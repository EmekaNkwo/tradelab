/*
 * Draws the TradeLab mark (theme/brandMark.ts) into the app's icon and splash PNGs under assets/.
 * Uses CanvasKit (Skia's WebAssembly build, installed with @shopify/react-native-skia), so no image tool is needed.
 *   npx tsx scripts/generate-brand-assets.ts
 * Then `npx expo prebuild --clean` to pick the new files up.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Canvas, CanvasKit, Path } from 'canvaskit-wasm';
import { encodeRgbPng } from './lib/pngRgb';
import { END_DOT_RADIUS, FLASK_PATH, LINE_WIDTH, LIP, LIQUID_PATH, MARK_COLORS, PRICE_LINE_PATH, PRICE_POINTS } from '../theme/brandMark';

const require = createRequire(import.meta.url);
const ROOT = join(__dirname, '..');
const ASSETS = join(ROOT, 'assets');

type Variant = 'color' | 'mono';

function path(ck: CanvasKit, svg: string): Path {
  const p = ck.Path.MakeFromSVGString(svg);
  if (!p) throw new Error(`Bad SVG path: ${svg}`);
  return p;
}

/** Tile gradient: top left to bottom right, with one soft shape like the hero cards. */
function drawTile(ck: CanvasKit, canvas: Canvas, size: number, shape: 'square' | 'circle'): void {
  const paint = new ck.Paint();
  paint.setAntiAlias(true);
  paint.setShader(ck.Shader.MakeLinearGradient([0, 0], [size, size], [ck.parseColorString(MARK_COLORS.tileStart), ck.parseColorString(MARK_COLORS.tileEnd)], null, ck.TileMode.Clamp));
  const shadow = new ck.Paint();
  shadow.setAntiAlias(true);
  shadow.setColor(ck.Color(0, 0, 0, 0.08));
  if (shape === 'square') {
    canvas.drawRect(ck.XYWHRect(0, 0, size, size), paint);
    canvas.drawCircle(size * 0.92, size * 0.98, size * 0.46, shadow);
  } else {
    const r = size / 2;
    canvas.drawCircle(r, r, r, paint);
    canvas.save();
    canvas.clipPath(path(ck, `M0 ${r} A${r} ${r} 0 1 0 ${size} ${r} A${r} ${r} 0 1 0 0 ${r} Z`), ck.ClipOp.Intersect, true);
    canvas.drawCircle(size * 0.92, size * 0.98, size * 0.46, shadow);
    canvas.restore();
  }
}

/** The mark at `scale` pixels per unit, centred at (cx, cy). */
function drawMark(ck: CanvasKit, canvas: Canvas, cx: number, cy: number, scale: number, variant: Variant): void {
  canvas.save();
  canvas.translate(cx - 50 * scale, cy - 50 * scale);
  canvas.scale(scale, scale);
  const fill = (color: string) => {
    const p = new ck.Paint();
    p.setAntiAlias(true);
    p.setColor(ck.parseColorString(color));
    return p;
  };
  const flask = path(ck, FLASK_PATH);
  const lip = ck.RRectXY(ck.XYWHRect(LIP.x, LIP.y, LIP.width, LIP.height), LIP.height / 2, LIP.height / 2);
  const line = new ck.Paint();
  line.setAntiAlias(true);
  line.setStyle(ck.PaintStyle.Stroke);
  line.setStrokeWidth(LINE_WIDTH);
  line.setStrokeCap(ck.StrokeCap.Round);
  line.setStrokeJoin(ck.StrokeJoin.Round);
  const [endX, endY] = PRICE_POINTS[PRICE_POINTS.length - 1]!;

  if (variant === 'mono') {
    // Android themed icon: one opaque silhouette, the price line cut out of it.
    canvas.saveLayer();
    const white = fill('#FFFFFF');
    canvas.drawPath(flask, white);
    canvas.drawRRect(lip, white);
    line.setBlendMode(ck.BlendMode.Clear);
    canvas.drawPath(path(ck, PRICE_LINE_PATH), line);
    const hole = fill('#000000');
    hole.setBlendMode(ck.BlendMode.Clear);
    canvas.drawCircle(endX, endY, END_DOT_RADIUS, hole);
    canvas.restore();
  } else {
    canvas.drawPath(flask, fill(MARK_COLORS.glass));
    canvas.drawRRect(lip, fill(MARK_COLORS.glass));
    canvas.save();
    canvas.clipPath(flask, ck.ClipOp.Intersect, true);
    canvas.drawPath(path(ck, LIQUID_PATH), fill(MARK_COLORS.liquid));
    canvas.restore();
    line.setColor(ck.parseColorString(MARK_COLORS.line));
    canvas.drawPath(path(ck, PRICE_LINE_PATH), line);
    canvas.drawCircle(endX, endY, END_DOT_RADIUS, fill(MARK_COLORS.line));
  }
  canvas.restore();
}

/** Renders a square PNG. `opaque` writes RGB with no alpha channel (the app icon; stores reject alpha there). */
function render(ck: CanvasKit, size: number, draw: (canvas: Canvas) => void, opaque = false): Uint8Array {
  const surface = ck.MakeSurface(size, size);
  if (!surface) throw new Error('Could not create a CanvasKit surface');
  const canvas = surface.getCanvas();
  canvas.clear(ck.TRANSPARENT);
  draw(canvas);
  const image = surface.makeImageSnapshot();
  let png: Uint8Array | null;
  if (opaque) {
    const pixels = image.readPixels(0, 0, { width: size, height: size, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
    if (!pixels) throw new Error('readPixels failed');
    png = encodeRgbPng(size, size, new Uint8Array(pixels as Uint8Array));
  } else {
    png = image.encodeToBytes();
  }
  surface.delete();
  if (!png) throw new Error('PNG encoding failed');
  return png;
}

function loadCanvasKit(): { init: (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>; bin: string } {
  try {
    const init = require('canvaskit-wasm') as (opts: { locateFile: (f: string) => string }) => Promise<CanvasKit>;
    return { init, bin: join(dirname(require.resolve('canvaskit-wasm')), '..', 'bin') };
  } catch (error: unknown) {
    throw new Error(`canvaskit-wasm not found (it comes with @shopify/react-native-skia). Run \`npm install\` and try again. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  const { init, bin } = loadCanvasKit();
  const ck = await init({ locateFile: (f) => join(bin, f) });

  // Adaptive-icon safe zone is a circle 66/108 of the canvas; the mark's diagonal (~89 units) stays inside it.
  const outputs: readonly [string, number, (c: Canvas) => void, boolean?][] = [
    ['icon.png', 1024, (c) => { drawTile(ck, c, 1024, 'square'); drawMark(ck, c, 512, 512, 8.4, 'color'); }, true],
    ['favicon.png', 48, (c) => { drawTile(ck, c, 48, 'square'); drawMark(ck, c, 24, 24, 0.42, 'color'); }],
    ['android-icon-background.png', 1024, (c) => drawTile(ck, c, 1024, 'square')],
    ['android-icon-foreground.png', 1024, (c) => drawMark(ck, c, 512, 512, 6.6, 'color')],
    ['android-icon-monochrome.png', 1024, (c) => drawMark(ck, c, 512, 512, 6.6, 'mono')],
    // Splash: Android 12+ shows the centre 2/3 of this image in a circle, so the tile is a circle inside that.
    ['splash-icon.png', 1024, (c) => { c.save(); c.translate(512 - 330, 512 - 330); drawTile(ck, c, 660, 'circle'); c.restore(); drawMark(ck, c, 512, 512, 5.4, 'color'); }],
  ];
  for (const [name, size, draw, opaque] of outputs) {
    writeFileSync(join(ASSETS, name), render(ck, size, draw, opaque));
    console.log(`wrote assets/${name} (${size}×${size})`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
