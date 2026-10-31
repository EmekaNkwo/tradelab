/**
 * Test-only check for brief §1: every simulated money figure (SplitNumber/StatTile marked `money`, every PnLValue)
 * sits in a card (Card, HeroCard or StatTile) that also shows a SimulatedBadge: the tile itself, or the card the
 * tile sits in. Later stages run it on the
 * Practice, Replay and Backtest screens:
 *
 *   expectSimulatedFiguresBadged(screen.container as unknown as HostNode);
 */
import { BADGE_MARKER, CARD_MARKER, MONEY_MARKER } from '../components/ui/simulated';
import { accessibleName, type HostNode } from './a11y';

export interface UnbadgedFigure {
  readonly figure: string;
  readonly problem: string;
}

/** The cards around a node, innermost first (a StatTile is a card, usually inside another card). */
function cardsAround(n: HostNode): HostNode[] {
  const cards: HostNode[] = [];
  for (let p = n.parent; p; p = p.parent) if (p.props[CARD_MARKER] === true) cards.push(p);
  return cards;
}

/** Money figures that are not in a card, or whose card has no SimulatedBadge. */
export function unbadgedSimulatedFigures(root: HostNode): UnbadgedFigure[] {
  return root
    .queryAll((n) => n.props[MONEY_MARKER] === true)
    .flatMap((figure) => {
      const cards = cardsAround(figure);
      const name = accessibleName(figure).slice(0, 60);
      if (cards.length === 0) return [{ figure: name, problem: 'money figure is not inside a card' }];
      const badged = cards.some((card) => card.queryAll((n) => n.props[BADGE_MARKER] === true).length > 0);
      return badged ? [] : [{ figure: name, problem: 'card has no SimulatedBadge' }];
    });
}

/** How many money figures are on screen (marked SplitNumber/StatTile/MoneyText/ListRow values and every PnLValue). */
export function simulatedFigureCount(root: HostNode): number {
  return root.queryAll((n) => n.props[MONEY_MARKER] === true).length;
}

/**
 * `atLeast`: the number of money figures the screen must show, so the check cannot pass vacuously when figures
 * lose their marker. Omit it (0) only where no money is expected.
 */
export function expectSimulatedFiguresBadged(root: HostNode, { atLeast = 0 }: { readonly atLeast?: number } = {}): void {
  expect(unbadgedSimulatedFigures(root)).toEqual([]);
  expect(simulatedFigureCount(root)).toBeGreaterThanOrEqual(atLeast);
}
