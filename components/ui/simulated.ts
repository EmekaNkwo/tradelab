import { createContext, useContext } from 'react';
import type { SimulatedKind } from './SimulatedBadge';

/**
 * Simulated money must never look real (brief §1). Two enforcement aids:
 *  - `SimulatedContext`: a HeroCard with `simulated` tells the figures inside it, which then say "simulated".
 *  - Host markers: cards, money figures and badges carry a marker prop that testing/simulatedFigures.ts reads to
 *    check that every money figure has a SimulatedBadge in the same card. React Native drops unknown props on
 *    native views, so the markers cost nothing at run time.
 */
export const SimulatedContext = createContext<SimulatedKind | null>(null);

export function useSimulatedKind(): SimulatedKind | null {
  return useContext(SimulatedContext);
}

const MENTIONS_SIMULATED = /simulated|paper|demo|replay|backtest/i;

/** Adds ", simulated" to a spoken label inside a simulated card, unless it already says so. */
export function withSimulated(label: string, kind: SimulatedKind | null): string {
  if (!kind || MENTIONS_SIMULATED.test(label)) return label;
  return `${label}, simulated`;
}

export const CARD_MARKER = 'data-tl-card';
export const MONEY_MARKER = 'data-tl-money';
export const BADGE_MARKER = 'data-tl-simulated';

/** Spread onto a host View: `<View {...marker(CARD_MARKER)} />`. */
export function marker(name: string): object {
  return { [name]: true };
}
