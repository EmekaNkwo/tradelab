# ADR 0010: A cheaper candle layer (path-number cache, no-op pan steps, crosshair texture) (not adopted)

**Status:** Not adopted, rolled back in full (2026-10-31). The chart is the APK D version again (ADR 0009, "Device results and decision"). The rest of this record describes what was tried.

**Device results and decision.** Release build SHA-256 `4b593b3b46e26c1e93afb4a84da6427ea8adda4a9327ce154a09188be43817ad`, Xiaomi at 90 Hz, Chart Lab, `dumpsys gfxinfo`, 6 injected pans then 6 crosshair drags, twice:

| | APK D | This change |
|---|---|---|
| Pan p90 / janky | 15–17 ms / 5–10 % | 18 ms / 7–9 % |
| Crosshair p90 / janky | 15–16 ms / 28–36 % | 15–16 ms / 29–33 % |

- **Looks:** with the crosshair held, a full-resolution crop of the candles was identical to the same crop without it. There was no blur and no offset.
- **Memory:** `dumpsys meminfo` Graphics went from 94 MB to 284 MB over 30 crosshair presses, and was still 284 MB 20 s later. That is about 6 MB per press, the size of one texture, so the textures were not released on the device. The Jest mocks showed every texture disposed, so the fault is in how the real Skia or Reanimated runtime holds them.
- **Decision:** there was no frame-time gain and the device leaked GPU memory, so every part was rolled back from the pre-change copies. The cache and the skipped steps did lower JS work, but the frame time is dominated by Skia replaying the canvas, which none of this changes.
- **Copy of the attempt:** the session scratchpad (`backup/candles-attempt/`) holds the attempted code, in case it is revisited.

**Context.** On the Xiaomi test phone (90 Hz, 11.1 ms budget), APK D measured pan p90 15–17 ms (5–10% janky frames) and crosshair drag p90 15–16 ms (28–36% janky frames). Where that time goes:

- **Crosshair frames.** No React component but the readout re-renders during a drag (the existing tests show this). The cost is native. Skia replays every command of a canvas on each redraw (`RNRecorder::play`, the reason ADR 0009 culled chunks). Moving the line by a shared value therefore re-strokes every wick, body and overlay on each frame.
- **Pan frames.** Each move calls `setViewport`, which re-renders the chart and re-records the canvas.
  - A move that stays within one candle produced a new, equal viewport object, so it paid a full render, recording and replay for an identical picture.
  - Building the path strings dominates the JS side. Measured with `node --jitless` (a stand-in for Hermes; there is no Hermes runtime in the repo), 80 candles plus 4 overlays took about 790 µs per one-candle pan step. Most of that is number-to-string formatting. Price range and the description took about 30 µs.
  - Any screen re-render rebuilt the Canvas children, and Skia's root then re-recorded the whole canvas, even with nothing changed.

**Decision.**

- **Path-number cache** (`createPathCache` in `features/practice/chartModel.ts`). `candlePaths`, `linePath` and `barPaths` keep their formatted numbers between calls:
  - x per slot (stable through a pan);
  - y per candle or series index (stable while the price range is the same, which is about 73% of one-candle steps on seeded random-walk data).

  The output is byte-identical to the uncached builders (tested over pans, jumps, zooms, ranges, sizes and gaps). With the cache, the measured pan step drops to about 306 µs.
- **No-op steps are skipped.** Pan, pinch and the zoom/scroll buttons go through `unlessSame`, which keeps the old viewport object, so React bails out (`sameViewport` in `domain/market/chartGeometry.ts`).
- **A memoised candle layer and canvas.** `components/chart/CandleLayer.tsx` holds the static paths. PriceChart memoises the Canvas element, so a screen re-render that changes nothing here no longer re-records it.
- **A crosshair texture** (`components/chart/layerSnapshot.ts`). When the crosshair appears:
  - the layer element is recorded once (`drawAsPicture`);
  - on the UI thread, the recording is drawn into an offscreen texture at the screen's pixel density, so each texel lands on one pixel;
  - two shared values in the canvas switch to it: the paths' `Group` opacity goes to 0, which makes Skia quick-reject every path, and the `Image` gets the texture.

  Each crosshair frame then draws one image and the line, not every path. On release the paths come back and the texture is disposed. Each switch pair starts at opacity 1 and image null, and a pair that has held a texture is never bound to a later layer. So a re-recorded canvas is correct before any UI-thread write reaches it, and a texture can never cover a different window (for example after a replay tick during a drag; that layer is snapshotted again). If recording or the offscreen surface fails, the paths simply stay.

  A texture is drawn some time after it is asked for, so every show and hide takes a new **ticket**. The ticket is written to the pair by a job on the UI queue, which runs in order. A pending show draws only if its ticket is still the pair's, so a release, a re-press, a replaced layer or an unmount always voids it before anything is rendered. A one-way "retired" flag would not do, because the same pair is reused when the same window is pressed again. The picture is disposed in every case, and the offscreen surface right after its image is taken. The texture is sized from `useWindowDimensions().scale`.
- **Not done.**
  - A translate-only pan within a pre-built range: the price scale refits on every step, so it would change what the chart shows, and ADR 0009's buffered translate measured slower.
  - A texture during pans: `useTexture` is asynchronous, so the candles would lag the labels by a frame.
  - Throttling or transitions for state updates: these change when frames commit.

**Consequences.**

- Pan JS work per step is roughly 2.6× lower for candles and overlays, and sub-candle moves cost nothing. The Skia replay per pan commit is unchanged.
- A crosshair frame should cost about one image draw plus the line. The first crosshair frame also pays one offscreen render of the layer.
- Jest mocks (`testing/jestSetupUi.tsx`) gained:
  - `Group`, `Image`, `drawAsPicture`, offscreen surfaces, `makeMutable` and a Path render counter;
  - disposal tracking;
  - worklets' own mock, with `scheduleOnUI` run at once;
  - a deferred mode (`offscreen.defer`, `uiQueue.deferred`), so tests can play out each ordering of a pending snapshot against a release, a re-press, a replay tick or an unmount.

**Device numbers:** pending (to be measured on the Xiaomi with the same `dumpsys gfxinfo` runs as ADR 0009). Check also that the chart looks identical while the crosshair is held: sharpness, colours and the hollow outlines.

**Rollback.**

- *Texture only.* In `components/chart/PriceChart.tsx`:
  - delete the snapshot calls in `setCrosshair` (and the `wasShowing` line);
  - delete the snapshot `useLayoutEffect` (the one after the hover reset);
  - render `{layer}` directly in the canvas, dropping the `<Group>` and `<Image>`;
  - delete the `snapshots` pool, the `snapshot` memo and `useWindowDimensions` / `density`;
  - remove `layer`, `snapshot` and `density` from the `live` ref, which keeps its other fields;
  - remove the now-unused `Group` and `Image` imports from Skia, and the `layerSnapshot.ts` import (`createSnapshotPool`, `showSnapshot`, `hideSnapshot`, `snapshotSize`).

  Then delete `components/chart/layerSnapshot.ts` and `components/chart/__tests__/layerSnapshot.test.tsx`. Also delete the "candle layer" snapshot tests and the "pending snapshots" describe block in `PriceChart.test.tsx`. The mocks can stay.
- *Everything.* The pre-change originals are kept in the session backup.
  - Restore: `components/chart/PriceChart.tsx`, `components/chart/__tests__/PriceChart.test.tsx`, `features/practice/chartModel.ts`, `features/practice/index.ts` (the `sameViewport` re-export), `domain/market/chartGeometry.ts`, `domain/market/__tests__/chartGeometry.test.ts` and `testing/jestSetupUi.tsx`.
  - Delete: `components/chart/CandleLayer.tsx`, `components/chart/layerSnapshot.ts`, `components/chart/__tests__/layerSnapshot.test.tsx` and `features/practice/__tests__/pathCache.test.ts`.
  - `domain/market/index.ts` was not changed: it re-exports `chartGeometry.ts` with `export *`, so `sameViewport` goes when that file is restored.
