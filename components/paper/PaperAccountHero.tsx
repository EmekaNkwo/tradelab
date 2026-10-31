import { Pressable, View } from 'react-native';
import { equityChange, groupedFixed, moneyText, spokenMoney, type PaperSession } from '../../features/paper';
import { heroOverlay, touchTarget, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { ChangeChip } from '../ui/ChangeChip';
import { HeroCard } from '../ui/HeroCard';
import { Icon } from '../ui/Icon';
import { Ellipsis } from '../ui/icons';
import { SplitNumber } from '../ui/SplitNumber';
import { directionOf } from '../ui/valueParts';

interface PaperAccountHeroProps {
  readonly session: PaperSession;
  readonly menuOpen: boolean;
  readonly onToggleMenu: () => void;
}

/**
 * The paper account hero (restyle brief §5.3): equity in split decimals with its change since the start, the
 * account name and starting balance, always under the Paper badge. No card graphic: no number, chip or logo.
 */
export function PaperAccountHero({ session, menuOpen, onToggleMenu }: PaperAccountHeroProps) {
  const { colors, spacing, radii } = useTheme();
  const { view, account, instrument } = session;
  const change = equityChange(view);
  const equity = moneyText(view.equity);
  const direction = change ? directionOf(change.delta) : 'flat';
  return (
    <HeroCard
      simulated="paper"
      testID="paper-hero"
      pill={
        <Pressable
          testID="paper-account-menu"
          accessibilityRole="button"
          accessibilityLabel="Account options"
          accessibilityHint="Reset or delete this paper account"
          accessibilityState={{ expanded: menuOpen }}
          onPress={onToggleMenu}
          style={{ width: touchTarget, height: touchTarget, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: heroOverlay }}
        >
          <Icon icon={Ellipsis} size={22} literalColor={colors.onHero} />
        </Pressable>
      }
    >
      <AppText variant="title" color="onHero">
        {account.name}
      </AppText>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="caption" color="onHero">
          Equity
        </AppText>
        <SplitNumber
          testID="paper-equity"
          value={equity}
          money
          literalColor={colors.onHero}
          accessibilityLabel={`Equity, paper account, ${spokenMoney(view.equity)}${change ? `, ${direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'no change'} ${change.text} since the start` : ''}`}
        />
        {change ? <ChangeChip direction={direction} value={change.text} tone="result" onHero subject="Equity since the start" testID="paper-equity-change" /> : null}
      </View>
      <AppText variant="caption" color="onHero" tabular>
        {`Started with ${groupedFixed(view.startingBalance)} USD · ${instrument.symbol}`}
      </AppText>
    </HeroCard>
  );
}
