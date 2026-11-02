/**
 * Test-only accessibility and navigation helpers for rendered screens (React Native Testing Library v14,
 * whose tree holds host elements only).
 */
import { act, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { touchTarget } from '../theme';

/** A host element as RNTL v14 exposes it. */
export interface HostNode {
  readonly type: string;
  readonly props: Record<string, unknown>;
  readonly children: readonly (HostNode | string)[];
  readonly parent: HostNode | null;
  queryAll(predicate: (n: HostNode) => boolean): HostNode[];
}

const ROLE_REQUIRED = 'every pressable needs an accessibilityRole';

function textOf(node: HostNode | string): string {
  if (typeof node === 'string') return node;
  return node.children.map(textOf).join('');
}

const isInputHost = (n: HostNode) => /TextInput/.test(n.type);

/** Interactive host elements: anything with a press handler or an on/off switch. */
export function pressables(root: HostNode): HostNode[] {
  return root.queryAll(
    (n) =>
      !isInputHost(n) &&
      (typeof n.props.onClick === 'function' || typeof n.props.onPress === 'function' || (/Switch/.test(n.type) && typeof n.props.onChange === 'function')),
  );
}

/** What a screen reader announces for the element: its label, or else its text. */
export function accessibleName(n: HostNode): string {
  const label = n.props.accessibilityLabel ?? n.props['aria-label'];
  if (typeof label === 'string' && label.trim().length > 0) return label.trim();
  return textOf(n).trim();
}

export interface A11yProblem {
  readonly element: string;
  readonly problem: string;
}

function describe(n: HostNode): string {
  return `${n.type} "${accessibleName(n).slice(0, 60)}"`;
}

type Style = Record<string, unknown>;

const styleOf = (n: HostNode): Style => (StyleSheet.flatten(n.props.style as never) ?? {}) as Style;

/** A Text inside another Text is an inline link in running text: exempt from target size (WCAG 2.5.8 "inline"). */
function isInlineText(n: HostNode): boolean {
  if (n.type !== 'Text') return false;
  for (let p = n.parent; p; p = p.parent) if (p.type === 'Text') return true;
  return false;
}

/** Extra size from hitSlop, per axis. */
function slopOf(n: HostNode): { readonly h: number; readonly w: number } {
  const slop = n.props.hitSlop;
  if (typeof slop === 'number') return { h: slop * 2, w: slop * 2 };
  if (!slop || typeof slop !== 'object') return { h: 0, w: 0 };
  const s = slop as { top?: number; bottom?: number; left?: number; right?: number };
  return { h: (s.top ?? 0) + (s.bottom ?? 0), w: (s.left ?? 0) + (s.right ?? 0) };
}

/** The nearest ancestor that sets layout (host wrappers without a style are skipped). */
function layoutParent(n: HostNode): HostNode | null {
  for (let p = n.parent; p; p = p.parent) if (p.props.style !== undefined) return p;
  return null;
}

/** True when the element is stretched across its parent's width (a column parent with default alignment). */
function stretchesAcross(n: HostNode, own: Style): boolean {
  if (own.alignSelf !== undefined && own.alignSelf !== 'stretch') return false;
  const p = layoutParent(n);
  if (!p) return true;
  const ps = styleOf(p);
  if (ps.flexDirection === 'row' || ps.flexDirection === 'row-reverse') return false;
  return ps.alignItems === undefined || ps.alignItems === 'stretch';
}

/** True when the element grows along a row (flex or flexGrow), so it takes a share of the width. */
function growsInRow(own: Style): boolean {
  return Number(own.flex ?? 0) > 0 || Number(own.flexGrow ?? 0) > 0;
}

function targetSize(n: HostNode): { readonly ok: boolean; readonly detail: string } {
  if (isInlineText(n)) return { ok: true, detail: '' };
  const own = styleOf(n);
  const slop = slopOf(n);
  const h = Number(own.minHeight ?? own.height ?? 0) + slop.h;
  const w = Number(own.minWidth ?? own.width ?? 0) + slop.w;
  // A full-width element ('100%', e.g. a long ChoiceChips option row) is as wide as its parent.
  const widthOk = w >= touchTarget || own.width === '100%' || (own.width === undefined && (stretchesAcross(n, own) || growsInRow(own)));
  // Native switches size themselves to the platform minimum.
  if (/Switch/.test(n.type)) return { ok: true, detail: '' };
  return { ok: h >= touchTarget && widthOk, detail: `height ${h}, width ${w}${widthOk ? '' : ' (not stretched)'}` };
}

const CHOICE_ROLES = new Set(['radio', 'checkbox']);

const roleOf = (n: HostNode) => String(n.props.accessibilityRole ?? n.props.role ?? '');
const labelOf = (n: HostNode): string | null => {
  const label = n.props.accessibilityLabel ?? n.props['aria-label'];
  return typeof label === 'string' && label.trim().length > 0 ? label.trim() : null;
};
const isChoice = (n: HostNode) => CHOICE_ROLES.has(roleOf(n));
const childNodes = (n: HostNode) => n.children.filter((c): c is HostNode => typeof c !== 'string');

/**
 * The group a choice belongs to: its parent, when that is a radiogroup or a labelled wrapper (ChoiceChips and
 * SegmentedControl render options as direct children of one).
 */
function choiceGroup(n: HostNode): HostNode | null {
  const p = n.parent;
  if (!p) return null;
  return roleOf(p) === 'radiogroup' || (labelOf(p) !== null && typeof p.props.onPress !== 'function') ? p : null;
}

/** True when `name` is the whole label or hint, or one comma-separated part of it (so "Market" ≠ "Market order"). */
function names(n: HostNode, name: string): boolean {
  const said = [accessibleName(n), String(n.props.accessibilityHint ?? '')];
  return said.some((s) => s.trim() === name || s.split(/,\s+/).some((part) => part.trim() === name));
}

/**
 * A radio or checkbox inside a group must say which group it is in (in its label or hint): TalkBack does not
 * read the label of a plain grouping View, so without it "Yes" or "3" has no question.
 */
function groupProblems(n: HostNode): A11yProblem[] {
  if (!isChoice(n)) return [];
  const group = choiceGroup(n);
  if (!group) return [];
  const name = labelOf(group);
  if (name === null) return [{ element: describe(n), problem: 'choice group has no accessibilityLabel' }];
  return names(n, name) ? [] : [{ element: describe(n), problem: `choice does not name its group "${name}"` }];
}

/**
 * Hidden choice labels (`hideLabel`) reviewed as equivalent to the question shown above them. A hidden label
 * not listed here must appear on screen word for word.
 */
export const HIDDEN_LABEL_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = {
  'Explanation level': ['Explanations', 'How should we explain things?'],
  Experience: ['What is your experience?'],
  Markets: ['Which markets interest you?'],
  Goals: ['What do you want to learn?'],
  'MetaTrader version': ['MetaTrader'],
  Program: ['Choose your program'],
};

/**
 * Every choice group whose label is not shown above it (`hideLabel`) has its label, or a reviewed equivalent,
 * shown as text elsewhere on the screen, so sighted users still see the question.
 */
export function hiddenLabelProblems(root: HostNode): A11yProblem[] {
  const texts = new Set(root.queryAll((n) => n.type === 'Text').map((n) => textOf(n).trim()));
  const groups = root.queryAll((n) => labelOf(n) !== null && typeof n.props.onPress !== 'function' && childNodes(n).some(isChoice));
  return groups.flatMap((g) => {
    const label = labelOf(g)!;
    const first = g.parent ? childNodes(g.parent)[0] : undefined;
    const labelShown = first !== undefined && first !== g && first.type === 'Text' && textOf(first).trim() === label;
    if (labelShown) return [];
    const accepted = [label, ...(HIDDEN_LABEL_EQUIVALENTS[label] ?? [])];
    return accepted.some((t) => texts.has(t)) ? [] : [{ element: `group "${label}"`, problem: 'label is hidden but no equivalent text is shown' }];
  });
}

/**
 * Every pressable in the tree has a role, an accessible name, and (outside running text) a 44×44 target, and
 * every text input has a label. A choice inside a group names its group.
 * Returns the problems so a failing test lists them all.
 */
export function accessibilityProblems(root: HostNode): A11yProblem[] {
  const inputs = root.queryAll(isInputHost).flatMap((n) => {
    const label = n.props.accessibilityLabel ?? n.props['aria-label'] ?? n.props.accessibilityLabelledBy;
    return typeof label === 'string' && label.trim().length > 0 ? [] : [{ element: `${n.type} "${String(n.props.placeholder ?? '')}"`, problem: 'text input has no accessibilityLabel' }];
  });
  return [...inputs, ...pressables(root).flatMap((n) => {
    const problems: A11yProblem[] = [];
    const role = n.props.accessibilityRole ?? n.props.role;
    if (typeof role !== 'string' || role.length === 0 || role === 'none') problems.push({ element: describe(n), problem: ROLE_REQUIRED });
    if (accessibleName(n).length === 0) problems.push({ element: describe(n), problem: 'no accessible name (label or text)' });
    const size = targetSize(n);
    if (!size.ok) problems.push({ element: describe(n), problem: `touch target under ${touchTarget}×${touchTarget} (${size.detail})` });
    return [...problems, ...groupProblems(n)];
  })];
}

/** Lets pending effects and promises settle. */
export async function settle(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const isDisabled = (n: HostNode) => {
  const state = n.props.accessibilityState as { disabled?: boolean } | undefined;
  return state?.disabled === true || n.props.disabled === true || n.props['aria-disabled'] === true;
};

/**
 * Presses every enabled pressable on the screen once (re-querying after each press, since a press can change
 * the screen), and returns how many were pressed. Use with the router mock to collect where they lead.
 */
export async function pressEverything(getRoot: () => HostNode, limit = 80): Promise<number> {
  const pressed = new Set<string>();
  let count = 0;
  for (let guard = 0; guard < limit; guard += 1) {
    const next = pressables(getRoot()).find((n) => !isDisabled(n) && !pressed.has(`${n.type}:${accessibleName(n)}`));
    if (!next) break;
    pressed.add(`${next.type}:${accessibleName(next)}`);
    try {
      await fireEvent.press(next as never);
      await settle(2);
    } catch {
      // A press whose handler throws in the test environment is not a navigation; keep going.
    }
    count += 1;
  }
  return count;
}

/** The pathname of an expo-router push/replace argument. */
export function targetPath(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'pathname' in arg) return String((arg as { pathname: unknown }).pathname);
  return String(arg);
}
