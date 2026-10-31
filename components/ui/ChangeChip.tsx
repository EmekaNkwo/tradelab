import { View } from 'react-native';
import { heroOverlay, useTheme, type ColorTokens } from '../../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ArrowDown, ArrowUp, Minus } from './icons';
import { signedText, spokenChange, type Direction } from './valueParts';

interface ChangeChipProps {
  readonly direction: Direction;
  /** Unsigned display text, e.g. "4.3%" or "$42.50". The chip adds the sign. */
  readonly value: string;
  /**
   * `result`: P/L and other trading results, in gain/loss colours. `neutral`: learning stats vs last week, in
   * brand or secondary colours, because a learning change is not a profit.
   */
  readonly tone?: 'result' | 'neutral';
  /** What changed, said first by screen readers, e.g. "Quiz accuracy vs last week". */
  readonly subject?: string;
  /** For chips on a hero gradient. */
  readonly onHero?: boolean;
  readonly testID?: string;
}

type Pair = { readonly fg: keyof ColorTokens; readonly bg: keyof ColorTokens };

export function chipColors(direction: Direction, tone: 'result' | 'neutral'): Pair {
  if (tone === 'result') {
    if (direction === 'up') return { fg: 'gainText', bg: 'gainTint' };
    if (direction === 'down') return { fg: 'lossText', bg: 'lossTint' };
    return { fg: 'textSecondary', bg: 'surfaceMuted' };
  }
  return direction === 'up' ? { fg: 'brand', bg: 'brandTint' } : { fg: 'textSecondary', bg: 'surfaceMuted' };
}

const ARROWS = { up: ArrowUp, down: ArrowDown, flat: Minus } as const;

/** Arrow + sign + value, always all three (brief §1: green/red never alone). */
export function ChangeChip({ direction, value, tone = 'neutral', subject, onHero = false, testID }: ChangeChipProps) {
  const { colors, radii, spacing } = useTheme();
  const pair = chipColors(direction, tone);
  const fg = onHero ? colors.onHero : colors[pair.fg];
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={spokenChange(subject, direction, value, tone === 'result' ? 'result' : 'change')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: spacing.xxs,
        borderRadius: radii.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs,
        backgroundColor: onHero ? heroOverlay : colors[pair.bg],
      }}
    >
      <Icon icon={ARROWS[direction]} size={14} literalColor={fg} />
      <AppText variant="caption" tabular style={{ color: fg, fontWeight: '600' }}>
        {signedText(direction, value)}
      </AppText>
    </View>
  );
}
