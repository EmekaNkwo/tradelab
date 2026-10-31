import { useId, type ReactElement } from 'react';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../theme';
import { AppText } from './AppText';
import { IconWell } from './IconWell';
import { ChartColumn, Droplet, Gem } from './icons';
import { instrumentGlyph, isFlagCurrency, type FlagCurrency } from './instrumentGlyph';

/**
 * Simple stylised flags, drawn here from basic shapes (no artwork copied, no logos). Each draws into a 24×24 box
 * that the caller clips to a circle.
 */
const FLAGS: Record<FlagCurrency, () => ReactElement> = {
  USD: () => (
    <G>
      <Rect width={24} height={24} fill="#FFFFFF" />
      {/* Seven red stripes of thirteen, starting and ending red; the canton covers the top seven stripes. */}
      {Array.from({ length: 7 }, (_, i) => (
        <Rect key={i} y={(i * 2 * 24) / 13} width={24} height={24 / 13} fill="#C8323C" />
      ))}
      <Rect width={10.5} height={(7 * 24) / 13} fill="#2E3F8F" />
    </G>
  ),
  EUR: () => (
    <G>
      <Rect width={24} height={24} fill="#2E4FA8" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <Circle key={i} cx={12 + 6 * Math.cos(a)} cy={12 + 6 * Math.sin(a)} r={1.1} fill="#F5C842" />;
      })}
    </G>
  ),
  GBP: () => (
    <G>
      <Rect width={24} height={24} fill="#2A3E8C" />
      <Path d="M0 0 L24 24 M24 0 L0 24" stroke="#FFFFFF" strokeWidth={4} />
      <Path d="M12 0 V24 M0 12 H24" stroke="#FFFFFF" strokeWidth={6} />
      <Path d="M12 0 V24 M0 12 H24" stroke="#C8323C" strokeWidth={3} />
    </G>
  ),
  JPY: () => (
    <G>
      <Rect width={24} height={24} fill="#FFFFFF" />
      <Circle cx={12} cy={12} r={5.5} fill="#C8323C" />
    </G>
  ),
  CHF: () => (
    <G>
      <Rect width={24} height={24} fill="#D2343C" />
      <Path d="M12 6 V18 M6 12 H18" stroke="#FFFFFF" strokeWidth={3.5} />
    </G>
  ),
  CAD: () => (
    <G>
      <Rect width={24} height={24} fill="#FFFFFF" />
      <Rect width={6} height={24} fill="#D2343C" />
      <Rect x={18} width={6} height={24} fill="#D2343C" />
      <Path d="M12 7 L15 12 L12 17 L9 12 Z" fill="#D2343C" />
    </G>
  ),
  AUD: () => (
    <G>
      <Rect width={24} height={24} fill="#22357F" />
      <Path d="M6 0 V11 M0 5.5 H12" stroke="#FFFFFF" strokeWidth={2.4} />
      <Path d="M6 0 V11 M0 5.5 H12" stroke="#C8323C" strokeWidth={1} />
      <Circle cx={17} cy={9} r={1.2} fill="#FFFFFF" />
      <Circle cx={15} cy={16} r={1.2} fill="#FFFFFF" />
      <Circle cx={19} cy={15} r={1} fill="#FFFFFF" />
      <Circle cx={7} cy={18} r={1.6} fill="#FFFFFF" />
    </G>
  ),
  NZD: () => (
    <G>
      <Rect width={24} height={24} fill="#22357F" />
      <Path d="M6 0 V11 M0 5.5 H12" stroke="#FFFFFF" strokeWidth={2.4} />
      <Path d="M6 0 V11 M0 5.5 H12" stroke="#C8323C" strokeWidth={1} />
      {[
        [17, 8],
        [15, 14],
        [19, 13],
        [17, 19],
      ].map(([x, y]) => (
        <Circle key={`${x}-${y}`} cx={x} cy={y} r={1.2} fill="#C8323C" stroke="#FFFFFF" strokeWidth={0.6} />
      ))}
    </G>
  ),
  CNH: () => <ChinaLike />,
  CNY: () => <ChinaLike />,
};

function ChinaLike() {
  return (
    <G>
      <Rect width={24} height={24} fill="#D2343C" />
      <Circle cx={8} cy={8} r={2.6} fill="#F5C842" />
      <Circle cx={13} cy={5} r={0.9} fill="#F5C842" />
      <Circle cx={14.5} cy={8.5} r={0.9} fill="#F5C842" />
    </G>
  );
}

interface FlagCircleProps {
  readonly code: string;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly ring: string;
  readonly fallbackFill: string;
  readonly fallbackText: string;
}

function FlagCircle({ code, cx, cy, r, ring, fallbackFill, fallbackText }: FlagCircleProps) {
  const id = `flag-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const scale = (r * 2) / 24;
  return (
    <G>
      <Defs>
        <ClipPath id={id}>
          <Circle cx={cx} cy={cy} r={r} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id})`}>
        {isFlagCurrency(code) ? (
          <G transform={`translate(${cx - r} ${cy - r}) scale(${scale})`}>{FLAGS[code]()}</G>
        ) : (
          <>
            <Circle cx={cx} cy={cy} r={r} fill={fallbackFill} />
            <SvgText x={cx} y={cy + r * 0.32} fontSize={r * 0.85} fontWeight="700" fill={fallbackText} textAnchor="middle">
              {code.charAt(0)}
            </SvgText>
          </>
        )}
      </G>
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={ring} strokeWidth={1.5} />
    </G>
  );
}

interface InstrumentIconProps {
  /** "EUR/USD", "EURUSD", "XAUUSD", "US500", "AAPL"… */
  readonly symbol: string;
  readonly size?: number;
  readonly testID?: string;
}

/**
 * Forex: two overlapping flag circles (base over quote). Gold/silver, oil and indices: a simple glyph. Anything
 * else (e.g. a stock): a letter avatar. Decorative: the symbol text next to it carries the meaning.
 */
export function InstrumentIcon({ symbol, size = 40, testID }: InstrumentIconProps) {
  const { colors, radii } = useTheme();
  const glyph = instrumentGlyph(symbol);
  if (glyph.kind === 'gold' || glyph.kind === 'silver') return <IconWell testID={testID} icon={Gem} tone={glyph.kind === 'gold' ? 'warning' : 'neutral'} shape="circle" size={size} />;
  if (glyph.kind === 'oil') return <IconWell testID={testID} icon={Droplet} tone="neutral" shape="circle" size={size} />;
  if (glyph.kind === 'index') return <IconWell testID={testID} icon={ChartColumn} tone="info" shape="circle" size={size} />;
  if (glyph.kind === 'letter') {
    return (
      <View
        testID={testID}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height: size, borderRadius: radii.pill, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' }}
      >
        <AppText variant="label" color="brand" style={{ fontSize: Math.round(size * 0.4), lineHeight: Math.round(size * 0.5) }} maxFontSizeMultiplier={1}>
          {glyph.letter}
        </AppText>
      </View>
    );
  }
  const r = size * 0.31;
  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <FlagCircle code={glyph.quote} cx={size - r - 1} cy={size - r - 1} r={r} ring={colors.surface} fallbackFill={colors.surfaceMuted} fallbackText={colors.textPrimary} />
        <FlagCircle code={glyph.base} cx={r + 1} cy={r + 1} r={r} ring={colors.surface} fallbackFill={colors.surfaceMuted} fallbackText={colors.textPrimary} />
      </Svg>
    </View>
  );
}
