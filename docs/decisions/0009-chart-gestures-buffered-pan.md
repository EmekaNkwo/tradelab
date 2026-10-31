# ADR 0009: Chart gestures on the UI thread; pan a buffered, chunked drawing (not adopted)

**Status:** Superseded / not adopted (2026-10-31). The chart is back on the `PanResponder` version from ADR 0005 (the build shipped as APK D, with the UI-thread crosshair). See "Device results and decision" below; the rest of this record describes the design that was tried. Originally: accepted (performance pass after Phase 11), revised after review and two device runs (2026-10-30).

**Context.** On the Xiaomi test phone (90 Hz, so an 11.1 ms frame budget), panning with `PanResponder` gave p90 16 ms and 7.3% janky frames, and the crosshair drag gave p90 17 ms. Every move called `setViewport`, which re-rendered the whole chart. The first version of this ADR moved the gestures to the UI thread and translated one buffered drawing. That made the median pan frame faster (p50 5 ms), but the crosshair regressed (p90 21 ms) and the pan tail did not improve. Skia's native recorder parses each path once per commit, but on **every UI-thread frame** it replays and strokes every path on the canvas. So:

- each pan frame paid for the whole buffer, three windows of candles;
- each crosshair move redrew every candle.

Build 2 (chunks, plus the crosshair on its own overlay canvas) measured worse than the original: pan 30–32% janky (p90 15 ms), crosshair 75–79% janky (p90 18–20 ms). gfxinfo blamed "slow issue draw commands" for the crosshair and "slow UI thread" for the pan. Reading Skia 2.14's Android code explains both:

- A canvas that is not `opaque` is backed by a **TextureView**. The app's render thread re-composites its texture on every frame it changes, and the overlay added a second one.
- `requestRedraw` runs `renderImmediate` (replay, GL flush and swap) **on the main thread**, once per changed canvas per frame. That is the UI-thread time; the mappers and `applyUpdates` that feed it are small.

**Decision.**

- **Gestures.** Add `react-native-gesture-handler` (installed with `npx expo install`; `GestureHandlerRootView` sits in `app/_layout.tsx`). `components/chart/useChartGestures.ts` builds four v3 hook gestures. Their callbacks are worklets, and they are composed with `useCompetingGestures`, so the first to activate cancels the others. The configs are built once, because RNGH memoises on the config object.
  - **Pan**: one finger, `activeOffsetX ±10`, `failOffsetY ±10`, `maxPointers 1`. A vertical move fails the pan before it activates, so the page `ScrollView` scrolls. This is RNGH's `PanGestureHandler.shouldFail` on Android. Once the pan is active, the RNGH root view intercepts the touch.
  - **Crosshair**: a second pan with `activateAfterLongPress: 350`. It sets the hovered candle on the UI thread, and calls JS (the readout) only when the candle changes.
  - **Pinch**: zooms around the candle under the focal point. It calls JS once for each whole-candle change of the window size.
  - **Tap**: `maxDistance 8`, passed to `onTap`.
- **Absolute frame, chunked buffer** (`components/chart/chartLayers.ts`):
  - Candle *i* is drawn at (*i* + 0.5) slots. The buffer is the visible window plus **two windows on each side** (`drawSpan`).
  - The buffer is built in half-window chunks at fixed candle positions. Skia rejects a path whose bounds are off-screen cheaply, so each frame strokes only the two or three chunks on screen, however wide the buffer is.
  - A chunk is rebuilt only when its own inputs change: its candles, its overlay or pane values, the scale, or the style. A pan commit builds only the chunks that newly enter the buffer, and a replay tick builds only the chunk with the new candle.
- **Translucent canvases (TextureView).** Build 3 made the canvases `opaque`, so Skia backed them with a SurfaceView. That is reverted (build 4). A SurfaceView is a separate compositor layer. It can lag the page scroll by a frame, and it ignores navigation transitions, parent opacity and the parent's rounded clip; build 3 had to draw its own corners. The cost that gfxinfo blamed was the overlay's second TextureView, and that overlay is gone. So the canvases are translucent again: TextureView on Android, inside the plot View's border and rounded clip.
- **Crosshair in the main canvas.** The overlay canvas is gone: the line is a `Line` inside the translated group, with derived end points. With chunk culling, redrawing the main canvas costs about as much as the overlay did, without a second surface. The line's x and the candle width it used are fixed when the candle is picked (`HoverValue`), and `crosshairX` hides the line when the data or the candle width has changed since. So the line never mixes a new width with an old translation. Its derived values read only the hover and the epoch, never the drag offsets, so a pan does not recompute them.
- **One moving transform.** Chunks are fragments, not groups. A pan frame changes one shared value (the bound offset), one derived transform, and one `applyUpdates` per canvas.
- **Translation: epochs** (`components/chart/chartView.ts`). The drawing is translated by two transforms:
  - the **epoch base**, `-baseStart × slot`, which is a plain React prop;
  - a **drag offset**, which is a shared value written on the UI thread.

  Every change that is not a pan starts a new epoch (buttons, pinch steps, following a replay tick, resize, replaced data). A new epoch sets a new base and binds the other of two offset values, which is 0. All of this happens in the same React commit as the new paths, so **a React commit never needs a matching shared-value write to look right.** A pan's own commits keep the epoch: in an absolute frame, re-centring the buffer moves nothing.

  The bound offset is chosen by a **parity** that flips once per *committed* epoch change, not by `epoch % 2`. When one commit batches two epochs, `epoch % 2` would have bound the offset an earlier drag left non-zero.
- **Writers.**
  - The JS thread writes only the epoch copy (`ChartEpoch`, with its parity) and zeroes the unbound offset. JS writes reach the UI thread in order, and the UI thread only ever writes the current epoch's bound offset, so these writes can't clash with a drag.
  - The UI thread writes the bound offset, the drag state and the hovered candle. The hovered candle is tagged with `dataGen`, so replaced data hides the line without JS writing it. The readout ignores a pick from an older `dataGen` that arrives after a swap.
- **Commits.** A pan commits when the view is **a whole window** from the drawn candles (a window of headroom remains), and once on release.
  - A half-window swipe therefore commits only on release. The review suggested a trigger at a third of a window. That would mean more commits, and commits are the cost, so this design rejects it.
  - On release, the view snaps to a whole candle, at most half a candle's move. The committed window then starts exactly where the drawing is, and taps and the crosshair map to whole candles.
- **Price scale.** The y range (and the axis labels and the pane range) stays fitted to the window the drag started from, through every commit made during the drag. It is refitted once, on release (`scaleWindow`).
- **Data and size during a drag.**
  - New candles (replay with `followLatest`) do not re-anchor the window while the user drags: the user has taken control. After release, the window follows again only if it is back at the right edge. "Dragging" is a ref set by the gesture and read only in the layout effect that handles new candles, never during render and never React state: build 3 made it state, so every pan began with a React commit that re-recorded both canvases mid-gesture. Any final pan commit clears it, even one whose epoch is stale and is otherwise ignored.
  - A new epoch during a drag (replaced data, a resize, or a button, zoom or replay step just as the finger lands) **rebases** the drag: on its next move the worklet carries on from the new epoch's window, from the current finger position. The view jumps to the new window once, then follows the finger; the touch is never dropped. Pending commits from the old epoch are ignored.
- **What stays still.** Zones, level lines, horizontal drawings, Fibonacci lines, pane guides and their labels depend only on price. They are drawn outside the translated groups, and the price scale is fixed during a pan, so they need no moving or hiding. Trend lines move with the candles: `drawingShapes` returns them as `trends`.

**Build 3 trace (perfetto, 2026-10-30).** The chart's SurfaceView presented about every second vsync during injected gestures. The trace shows that this is the input rate, not rendering:

- The render path is one hop. The touch event runs the RNGH worklet, the Reanimated mapper and Skia's `applyUpdates`. `requestRedraw` is already on the main thread, so `renderImmediate` and `eglSwapBuffers` run inside the same `deliverInputEvent`. SurfaceFlinger presents the buffer at the next vsync.
- Timings on the main thread: input start to swap end p50 3.9 ms (p90 4.7, max 6.5); `eglSwapBuffers` 0.6 to 1.6 ms, with no blocking (`dequeueBuffer` at most 0.15 ms); swap to present p50 9.2 ms (p90 10.2).
- Frames that redraw take p50 6.3 ms, p90 7.7 ms and max 10.4 ms, inside the 11.1 ms budget. The worst case is a crosshair line move plus the readout's text mount and traversal. A price and pane pan frame takes about 7 ms.
- The adb-injected touches carry whole- or half-millisecond timestamps and arrive every 22 to 34 ms. Android fills the other frames with resampled events. Every frame with a raw sample redraws, and many resampled frames carry no change, so nothing is drawn. Presents therefore follow the injection rate, about 45 Hz. The swipes in this trace did not move the chart: the window was already at the newest candle, and an unchanged shared value triggers no mapper.

Judge this design with a real finger, or by its per-redraw frame time and input-to-present latency. Present intervals of an injected gesture measure the injector.

**Build 3 showed no movement on the device.** On the phone, a swipe and the Older button left Chart Lab pixel-identical. The trace of those swipes shows the same thing, step by step:

- At the start of the pan, a React commit (the new `drag` state) re-recorded both canvases.
- The first move redrew both canvases once.
- For the rest of the swipe nothing redrew, although the pan worklet received an event every frame.

The jest tests cannot run on the UI thread, so the exact native mechanism (Skia's mapper restart after a mid-gesture re-record, on the SurfaceView path) is not proven. Build 4 removes both build 3 changes that pans hit: there is no commit at pan start, and the canvases are TextureViews again, as in builds 1 and 2, where the same swipe panned. A test now checks that starting and dragging a pan renders no canvas. The Older button's commit draws through a fresh recording, which the trace shows working after other commits. If it still does nothing on build 4, the tap probably missed the button.

**Consequences.**

- A pan or crosshair move costs shared-value writes and a Skia redraw of the on-screen chunks (or of one line). No React render happens.
- The UI-thread maths lives in `components/chart/gestureMath.ts`. Its tests check it against `indexAtX`, `clampViewport` and `zoom`. The view-state reducer and the chunk cache are pure and unit-tested.
- Jest uses RNGH's `jestSetup.js` and `jest-utils` (`createGestureController`, `fireGestureHandler`, `getByGestureTestId`), with the worklets running on the JS thread:
  - the Reanimated mock in `testing/jestSetupUi.tsx` gained the hooks RNGH asks for;
  - Worklets uses its own mock;
  - the Skia mock counts `Path` renders and exposes each `Group`'s transform and each canvas's `opaque` flag (they must stay translucent).
- **Known limits.**
  - A pinch wins only if the second finger lands before a one-finger pan activates (10 px sideways).
  - The first 10 px of a pan are activation slop.
  - On a resize while the crosshair is showing, the line hides until the finger moves.
  - Skia still renders on the main thread. If pan frames go over budget, the remaining lever is drawing less per frame (fewer candles in view, or no pane while panning); RNGH and the epoch design would not change.
  - The first render and each release render build five windows of chunks (on the JS thread).

**Device results and decision (2026-10-31).** Measured on the Xiaomi test phone at 90 Hz with `dumpsys gfxinfo`: 6 injected pans and 6 crosshair drags per run, each build measured twice.

| Build | Pan | Crosshair drag |
| --- | --- | --- |
| Build 4 (this ADR) | p90 15–16 ms, 33–37% janky frames | p90 22 ms, 31–39% janky frames |
| APK D (`PanResponder`, UI-thread crosshair) | p90 13–15 ms, 8–12% janky frames | p90 17 ms, 26–34% janky frames |

Build 4 was slower than APK D on both gestures, so this design is not adopted:

- The chart reverts to APK D's `components/chart/PriceChart.tsx`: `PanResponder` gestures, the crosshair line as a Reanimated derived value drawn by Skia, and only the readout re-rendering on a crosshair move (`hoverStore.ts`).
- `useChartGestures.ts`, `gestureMath.ts`, `chartView.ts`, `chartLayers.ts` and their tests are removed, along with `drawSpan`, the `span` parameter of the path builders and the separate `trends` output of `drawingShapes`.
- `react-native-gesture-handler` stays installed, with `GestureHandlerRootView` in `app/_layout.tsx` and its Jest setup, but the chart does not use it.
