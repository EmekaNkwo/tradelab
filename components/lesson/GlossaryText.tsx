import { router } from 'expo-router';
import { parseGlossaryLinks } from '../../shared/glossaryLinks';
import type { TypographyVariant } from '../../theme';
import { AppText } from '../ui/AppText';
import { canOpen } from '../../shared/routeAccess';

interface GlossaryTextProps {
  readonly children: string;
  readonly variant?: TypographyVariant;
}

/**
 * Content text whose `[[term]]` links open the glossary (spec §9.2: every
 * difficult term is tappable). Terms are underlined links for screen readers too.
 */
export function GlossaryText({ children, variant = 'body' }: GlossaryTextProps) {
  const linked = canOpen('/glossary/[id]');
  return (
    <AppText variant={variant}>
      {parseGlossaryLinks(children).map((s, i) =>
        s.kind === 'text' ? (
          s.text
        ) : !linked ? (
          s.label
        ) : (
          <AppText
            key={`${i}-${s.id}`}
            variant={variant}
            color="brand"
            accessibilityRole="link"
            accessibilityHint="Opens the glossary"
            style={{ textDecorationLine: 'underline' }}
            onPress={() => router.push({ pathname: '/glossary/[id]', params: { id: s.id } })}
          >
            {s.label}
          </AppText>
        ),
      )}
    </AppText>
  );
}
