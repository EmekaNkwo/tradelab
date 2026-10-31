import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { DialArc, SessionId, SessionsDialView } from '../../features/plan';
import { useTheme, type ColorTokens } from '../../theme';
import { AppText } from '../ui/AppText';

/** Each session's arc colour: line-safe tokens (≥3:1 on the card in light and dark, tested). Never gain/loss. */
export const SESSION_COLORS: Readonly<Record<SessionId, keyof ColorTokens>> = {
  sydney: 'simulatedBadge',
  tokyo: 'infoText',
  london: 'brand',
  new_york: 'warning',
};

const SIZE = 240;
const CENTER = SIZE / 2;
const STROKE = 10;
const RING_GAP = 14;
/** Room outside the rings for the hour labels. */
const LABEL_SPACE = 24;
const OUTER = CENTER - LABEL_SPACE;
const LABEL_BOX = 40;
/** Closed sessions are dashed, so open/closed is never told by colour alone (the rows below say it in words). */
const CLOSED_DASH = '4 6';
const HOUR_LABELS = [0, 6, 12, 18] as const;
/**
 * Text drawn inside the fixed-size dial grows at most this much with the system font size, so the centre label
 * stays inside the inner ring. The dial's spoken label and the session rows below carry the same facts unscaled.
 */
export const DIAL_TEXT_MAX_SCALE = 1.3;

/** Hour of day → point on a circle; midnight at the top, clockwise. */
export function dialPoint(hour: number, radius: number): { readonly x: number; readonly y: number } {
  const angle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

/** SVG arc path from `startHour` for `hours` (a full ring is drawn as a circle instead). */
export function arcPath(startHour: number, hours: number, radius: number): string {
  const a = dialPoint(startHour, radius);
  const b = dialPoint(startHour + hours, radius);
  const large = hours > 12 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

const ringRadius = (i: number) => OUTER - i * RING_GAP;

function SessionRing({ arc, index }: { readonly arc: DialArc; readonly index: number }) {
  const { colors } = useTheme();
  const r = ringRadius(index);
  const stroke = colors[SESSION_COLORS[arc.id]];
  const dash = arc.open ? undefined : CLOSED_DASH;
  return (
    <>
      <Circle cx={CENTER} cy={CENTER} r={r} stroke={colors.surfaceMuted} strokeWidth={STROKE} fill="none" />
      {arc.hours >= 24 ? (
        <Circle cx={CENTER} cy={CENTER} r={r} stroke={stroke} strokeWidth={STROKE} strokeDasharray={dash} fill="none" />
      ) : arc.hours > 0 ? (
        <Path d={arcPath(arc.startHour, arc.hours, r)} stroke={stroke} strokeWidth={STROKE} strokeDasharray={dash} strokeLinecap="round" fill="none" />
      ) : null}
    </>
  );
}

/**
 * A circular 24-hour dial (brief §5.7): one soft ring per session with its window as an arc, and a "Now" marker
 * from the injected clock. The drawing is hidden from screen readers; the dial is one image whose label says
 * everything in words.
 */
export function SessionsDial({ view, testID }: { readonly view: SessionsDialView; readonly testID?: string }) {
  const { colors, spacing } = useTheme();
  const innerMost = ringRadius(view.arcs.length - 1) - STROKE;
  const tip = dialPoint(view.nowHour, OUTER + STROKE / 2);
  const base = dialPoint(view.nowHour, Math.max(innerMost - spacing.xs, 0));
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={view.summary} style={{ alignItems: 'center', gap: spacing.sm }}>
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {view.arcs.map((arc, i) => (
            <SessionRing key={arc.id} arc={arc} index={i} />
          ))}
          {HOUR_LABELS.map((h) => {
            const a = dialPoint(h, OUTER + STROKE / 2);
            const b = dialPoint(h, OUTER - (view.arcs.length - 1) * RING_GAP - STROKE / 2);
            return <Line key={h} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colors.border} strokeWidth={1} />;
          })}
          <Line x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} stroke={colors.textPrimary} strokeWidth={2.5} strokeLinecap="round" />
          <Circle cx={tip.x} cy={tip.y} r={5} fill={colors.textPrimary} stroke={colors.surface} strokeWidth={2} />
        </Svg>
        {HOUR_LABELS.map((h) => {
          const p = dialPoint(h, CENTER - 9);
          return (
            <AppText
              key={h}
              variant="caption"
              color="textSecondary"
              tabular
              maxFontSizeMultiplier={DIAL_TEXT_MAX_SCALE}
              style={{ position: 'absolute', left: p.x - LABEL_BOX / 2, top: p.y - 9, width: LABEL_BOX, textAlign: 'center' }}
            >
              {String(h).padStart(2, '0')}
            </AppText>
          );
        })}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" color="textSecondary" maxFontSizeMultiplier={DIAL_TEXT_MAX_SCALE}>
            Now
          </AppText>
          <AppText variant="label" tabular maxFontSizeMultiplier={DIAL_TEXT_MAX_SCALE} testID={testID ? `${testID}-now` : undefined}>
            {view.nowLabel}
          </AppText>
        </View>
      </View>
      <AppText variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
        Midnight at the top, clockwise. Solid rings are open now; dashed rings show the next opening.
      </AppText>
    </View>
  );
}
