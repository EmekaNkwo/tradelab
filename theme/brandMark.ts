/**
 * The TradeLab mark: a lab flask whose liquid level is a rising price line. One definition, drawn by the
 * in-app boot screen (react-native-svg) and by scripts/generate-brand-assets.ts (app icon, Android adaptive and
 * themed icons, splash), so they cannot drift apart. Coordinates are in a 100 × 100 box; the mark's bounds are
 * centred on (50, 50).
 */

/** Flask body and neck, one closed shape. */
export const FLASK_PATH =
  'M43 22 H57 V39.5 L76.6 75.2 C78.9 79.4 75.9 84.5 71.1 84.5 H28.9 C24.1 84.5 21.1 79.4 23.4 75.2 L43 39.5 Z';

/** The flask's lip, a pill across the top of the neck. */
export const LIP = { x: 39, y: 15.5, width: 22, height: 6.5 } as const;

/** The price line, bottom left to top right. Every point sits inside the flask body. */
export const PRICE_POINTS: readonly (readonly [number, number])[] = [
  [29, 74],
  [41, 64],
  [50, 68],
  [61, 55],
];

export const PRICE_LINE_PATH = PRICE_POINTS.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');

/** Everything below the price line; clip it to FLASK_PATH to get the liquid. */
export const LIQUID_PATH = `M18 76 ${PRICE_POINTS.map(([x, y]) => `L${x} ${y}`).join(' ')} L82 48 L82 90 L18 90 Z`;

export const LINE_WIDTH = 4.2;
export const END_DOT_RADIUS = 3.4;

/**
 * Mark colours. Fixed, not themed: the icon and splash are the same in light and dark, and the boot screen matches
 * them. Glass and liquid are tinted toward the brand hue; the line is brandStrong, ≥4.5:1 on both glass and liquid.
 */
export const MARK_COLORS = {
  tileStart: '#2A8452',
  tileEnd: '#145C39',
  glass: '#EEF5F0',
  liquid: '#A6DABB',
  line: '#145C39',
} as const;
