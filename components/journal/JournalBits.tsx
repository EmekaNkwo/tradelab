import { View } from 'react-native';
import { resultView, spokenR, type JournalEntry, type ProcessChip } from '../../features/journal';
import { useTheme, type ColorTokens } from '../../theme';
import { AppText } from '../ui/AppText';
import { Icon } from '../ui/Icon';
import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from '../ui/icons';
import { PnLValue } from '../ui/PnLValue';
import { directionOf, spokenChange } from '../ui/valueParts';

/**
 * Journal pieces (restyle brief §5.6): the process chip and the result, kept apart. Process uses brand (followed)
 * or warning (rules broken) with an icon and words; the result uses the gain/loss colours with sign and arrow.
 */

const CHIP_STYLE: Readonly<Record<ProcessChip['kind'], { readonly icon: LucideIcon; readonly fg: keyof ColorTokens; readonly bg: keyof ColorTokens }>> = {
  followed: { icon: CircleCheck, fg: 'brand', bg: 'brandTint' },
  broke: { icon: TriangleAlert, fg: 'warning', bg: 'warningTint' },
  not_followed: { icon: CircleAlert, fg: 'warning', bg: 'warningTint' },
};

/** What a screen reader says for the chip: the words, without the tick. */
export function spokenChip(chip: ProcessChip): string {
  return chip.text.replace(/\s*✓$/, '');
}

export function ProcessChipView({ chip, testID }: { readonly chip: ProcessChip; readonly testID?: string }) {
  const { colors, radii, spacing } = useTheme();
  const style = CHIP_STYLE[chip.kind];
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={spokenChip(chip)}
      style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xxs, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, backgroundColor: colors[style.bg] }}
    >
      <Icon icon={style.icon} size={14} color={style.fg} />
      <AppText variant="caption" color={style.fg} style={{ fontWeight: '600' }}>
        {chip.text}
      </AppText>
    </View>
  );
}

/**
 * "Result, loss of 100.00, 1.0 R". The source (what the badge shows) is not repeated here: a journal row says it
 * once, in its subtitle ("Paper trading (simulated)", "Demo trade, entered by hand", "Imported from MT statement").
 */
export function spokenResult(e: Pick<JournalEntry, 'pnlMoney' | 'pnlR'>): string {
  const r = resultView(e);
  if (!r) return 'Result not recorded';
  return `${spokenChange('Result', directionOf(r.delta, 2), r.amount, 'result')}${r.r ? `, ${spokenR(r.r)}` : ''}`;
}

/** The result as PnLValue (sign, arrow, R), or "Result not recorded". Must sit in a card with the entry's badge. */
export function JournalResult({ entry, variant = 'label', testID }: { readonly entry: Pick<JournalEntry, 'pnlMoney' | 'pnlR'>; readonly variant?: 'label' | 'title'; readonly testID?: string }) {
  const r = resultView(entry);
  if (!r) {
    return (
      <AppText variant="caption" color="textSecondary" testID={testID}>
        Result not recorded
      </AppText>
    );
  }
  return <PnLValue testID={testID} direction={directionOf(r.delta, 2)} amount={r.amount} r={r.r ?? undefined} subject="Result" variant={variant} />;
}
