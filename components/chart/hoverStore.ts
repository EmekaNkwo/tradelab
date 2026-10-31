/**
 * The candle under the crosshair, kept outside React state so that moving the
 * crosshair re-renders only the readout, not the whole chart (device run
 * 2026-10-30: per-move chart re-renders made over half the frames janky).
 */
export interface HoverStore {
  readonly get: () => number | null;
  /** Sets the hovered candle; returns false (and notifies nobody) when it did not change. */
  readonly set: (index: number | null) => boolean;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createHoverStore(): HoverStore {
  let index: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => index,
    set: (next) => {
      if (next === index) return false;
      index = next;
      listeners.forEach((l) => l());
      return true;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
