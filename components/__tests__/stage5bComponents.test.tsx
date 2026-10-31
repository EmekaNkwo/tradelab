import { render, screen } from '@testing-library/react-native';
import { sessionsClock, sessionsDialView } from '../../features/plan';
import type { ModuleOverview } from '../../features/learning';
import { darkTheme, lightTheme, ThemeProvider, type Theme } from '../../theme';
import { accessibilityProblems, type HostNode } from '../../testing/a11y';
import type { PickedBackup } from '../../features/backup';
import { RestorePreview } from '../backup/RestorePreview';
import { menuIcon } from '../more/moreIcons';
import { BadgeGrid, badgeStatus, type BadgeTile } from '../progress/BadgeGrid';
import { ModuleTimeline, moduleStage } from '../progress/ModuleTimeline';
import { arcPath, DIAL_TEXT_MAX_SCALE, dialPoint, SESSION_COLORS, SessionsDial } from '../tools/SessionsDial';
import { BookOpen, Settings } from '../ui/icons';

/** Restyle stage 5b: the sessions dial, badge grid, module timeline and More icons. */
const inTheme = (ui: React.ReactElement) => render(<ThemeProvider preference="light">{ui}</ThemeProvider>);
const root = () => screen.container as unknown as HostNode;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe.each<[string, Theme]>([
  ['light', lightTheme],
  ['dark', darkTheme],
])('stage 5b colour pairs (%s)', (_name, { colors }) => {
  it('session arcs are line-safe (≥3:1) on the card and on their track', () => {
    for (const token of Object.values(SESSION_COLORS)) {
      expect(contrast(colors[token], colors.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(colors[token], colors.surfaceMuted)).toBeGreaterThanOrEqual(3);
    }
    // The Now marker.
    expect(contrast(colors.textPrimary, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('badge tiles keep text at AA: earned on brand tint, not earned on the muted fill', () => {
    expect(contrast(colors.brand, colors.brandTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textPrimary, colors.brandTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textSecondary, colors.brandTint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textSecondary, colors.surfaceMuted)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textPrimary, colors.surfaceMuted)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('SessionsDial', () => {
  it('maps hours clockwise from midnight at the top', () => {
    expect(dialPoint(0, 100)).toEqual({ x: 120, y: 20 });
    const six = dialPoint(6, 100);
    expect(six.x).toBeCloseTo(220);
    expect(six.y).toBeCloseTo(120);
    expect(arcPath(9, 9, 50)).toMatch(/^M [\d.]+ [\d.]+ A 50 50 0 0 1 [\d.]+ [\d.]+$/);
    expect(arcPath(20, 13, 50)).toContain(' 0 1 1 ');
  });

  it('is one image whose label is the text alternative, with the Now time shown', async () => {
    const ms = Date.parse('2026-10-29T10:00:00.000Z');
    const view = sessionsDialView(sessionsClock(ms), ms, 'Africa/Lagos');
    await inTheme(<SessionsDial view={view} testID="dial" />);
    const dial = screen.getByTestId('dial');
    expect(dial.props.accessibilityRole).toBe('image');
    expect(dial.props.accessibilityLabel).toBe(view.summary);
    expect(screen.getByText('Thu 11:00')).toBeTruthy();
    // The centre label is capped so large text stays inside the inner ring.
    expect(screen.getByTestId('dial-now').props.maxFontSizeMultiplier).toBe(DIAL_TEXT_MAX_SCALE);
    expect(screen.getByText('Now').props.maxFontSizeMultiplier).toBe(DIAL_TEXT_MAX_SCALE);
    expect(screen.getByText(/dashed rings show the next opening/)).toBeTruthy();
  });

  it('draws a full ring for a 24-hour window and nothing for an empty one', async () => {
    const ms = Date.parse('2026-10-29T10:00:00.000Z');
    const view = sessionsDialView(sessionsClock(ms), ms, 'UTC');
    const arcs = view.arcs.map((a, i) => (i === 0 ? { ...a, hours: 24 } : i === 1 ? { ...a, hours: 0 } : a));
    await inTheme(<SessionsDial view={{ ...view, arcs }} testID="dial" />);
    expect(screen.getByTestId('dial')).toBeTruthy();
  });
});

const badge = (over: Partial<BadgeTile>): BadgeTile => ({ id: 'b', title: 'Chart Reader', how: 'Reach "Secure" in chart reading.', earned: false, earnedOn: null, ...over });

describe('BadgeGrid', () => {
  it('says earned or not earned in words, with the date when it is known', async () => {
    expect(badgeStatus(badge({}))).toBe('Not earned yet');
    expect(badgeStatus(badge({ earned: true }))).toBe('Earned');
    expect(badgeStatus(badge({ earned: true, earnedOn: '3 Nov 2026' }))).toBe('Earned on 3 Nov 2026');
    await inTheme(<BadgeGrid badges={[badge({ id: 'a', earned: true, earnedOn: '3 Nov 2026' }), badge({ id: 'b' })]} />);
    expect(screen.getByTestId('badge-a').props.accessibilityLabel).toBe('Chart Reader. Earned on 3 Nov 2026. Reach "Secure" in chart reading.');
    expect(screen.getByTestId('badge-b').props.accessibilityLabel).toBe('Chart Reader. Not earned yet. Reach "Secure" in chart reading.');
    expect(accessibilityProblems(root())).toEqual([]);
  });
});

const lesson = (id: string, done: boolean) => ({ id, title: id, inOneLine: '', done });
const mod = (id: string, lessons: readonly { id: string; title: string; inOneLine: string; done: boolean }[], checkpointPassed: boolean): ModuleOverview => ({ id, title: `Module ${id}`, summary: '', practicalResult: '', lessons, checkpointPassed });

describe('ModuleTimeline', () => {
  const modules = [mod('a', [lesson('1', true), lesson('2', true)], true), mod('b', [lesson('3', true), lesson('4', false)], false), mod('c', [lesson('5', false)], false)];

  it('names each stage in words: passed, in progress, not started (modules are never locked)', async () => {
    expect(modules.map(moduleStage)).toEqual(['Checkpoint passed · 2 of 2 lessons', 'In progress · 1 of 2 lessons', 'Not started · 1 lesson']);
    await inTheme(<ModuleTimeline modules={modules} />);
    expect(screen.getByTestId('timeline-b').props.accessibilityLabel).toBe('2. Module b. In progress · 1 of 2 lessons');
    expect(screen.queryByText(/locked/i)).toBeNull();
  });
});

describe('More icons', () => {
  it('gives every More row an icon well, with a fallback', () => {
    expect(menuIcon('settings')).toEqual({ icon: Settings, tone: 'neutral' });
    expect(menuIcon('home')).toEqual({ icon: BookOpen, tone: 'neutral' });
  });
});

describe('RestorePreview', () => {
  const picked = { file: {}, summary: { createdAt: '2026-10-29T10:00:00.000Z', appVersion: '1.0.0', schemaVersion: 13, rowCounts: { user_profile: 1 } } } as unknown as PickedBackup;
  const fill = () => [screen.getByTestId('restore-preview').props.style].flat(3).reduce((a, b) => ({ ...a, ...(b ?? {}) }), {} as Record<string, unknown>);

  it('is a card on the backup screen and a tile inside onboarding’s restore card (no card in a card)', async () => {
    await inTheme(<RestorePreview picked={picked} timeZone="UTC" onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(fill()).toMatchObject({ backgroundColor: lightTheme.colors.surface, borderRadius: lightTheme.radii.card });
    screen.unmount();
    await inTheme(<RestorePreview inCard picked={picked} timeZone="UTC" onConfirm={() => undefined} onCancel={() => undefined} />);
    expect(fill()).toMatchObject({ backgroundColor: lightTheme.colors.surfaceMuted, borderRadius: lightTheme.radii.tile });
    expect(screen.getByText('Restore this backup?')).toBeTruthy();
  });
});
