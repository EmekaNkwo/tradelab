import { View } from 'react-native';
import { heroOverlay, useTheme, type ColorTokens } from '../../theme';
import { Icon } from './Icon';
import type { LucideIcon } from './icons';

export type WellTone = 'brand' | 'gain' | 'loss' | 'warning' | 'info' | 'neutral' | 'simulated' | 'onHero';

interface IconWellProps {
  readonly icon: LucideIcon;
  readonly tone?: WellTone;
  /** Points; 40 or 44 (default) in rows and tiles. The icon scales with it. */
  readonly size?: number;
  readonly shape?: 'rounded' | 'circle';
  readonly testID?: string;
}

const TONES: Record<Exclude<WellTone, 'onHero'>, { readonly bg: keyof ColorTokens; readonly fg: keyof ColorTokens }> = {
  brand: { bg: 'brandTint', fg: 'brand' },
  gain: { bg: 'gainTint', fg: 'gainText' },
  loss: { bg: 'lossTint', fg: 'lossText' },
  warning: { bg: 'warningTint', fg: 'warning' },
  info: { bg: 'infoTint', fg: 'infoText' },
  neutral: { bg: 'surfaceMuted', fg: 'textSecondary' },
  simulated: { bg: 'simulatedBadgeBg', fg: 'simulatedBadge' },
};

/** The tinted square or circle behind an icon in rows, tiles and empty states. Hidden from screen readers. */
export function IconWell({ icon, tone = 'brand', size = 44, shape = 'rounded', testID }: IconWellProps) {
  const { colors, radii } = useTheme();
  const onHero = tone === 'onHero';
  const t = onHero ? null : TONES[tone];
  const iconSize = Math.round(size * 0.5);
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'circle' ? radii.pill : radii.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t ? colors[t.bg] : heroOverlay,
      }}
    >
      {t ? <Icon icon={icon} color={t.fg} size={iconSize} /> : <Icon icon={icon} literalColor={colors.onHero} size={iconSize} />}
    </View>
  );
}
