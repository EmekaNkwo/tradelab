/**
 * Seeded pseudo-random numbers (mulberry32). Domain code may not use
 * Math.random: every simulated scenario must be reproducible from its seed
 * (spec §13.3).
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal (Box–Muller). */
  normal(): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    normal: () => {
      const u = Math.max(next(), Number.EPSILON);
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
  };
}
