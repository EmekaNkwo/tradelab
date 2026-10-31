import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { GlossaryText } from '../lesson/GlossaryText';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CardHeader } from '../ui/CardHeader';
import { Calculator } from '../ui/icons';
import { Notice } from '../ui/Notice';

export interface WorkedExampleView {
  readonly assumptions: readonly string[];
  readonly steps: readonly string[];
}

function Lines({ items, numbered = false }: { readonly items: readonly string[]; readonly numbered?: boolean }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {items.map((line, i) => (
        <GlossaryText key={`${i}-${line}`} variant="reading">{`${numbered ? `${i + 1}.` : '•'} ${line}`}</GlossaryText>
      ))}
    </View>
  );
}

/** A worked example on a muted tile inside its card (brief §5.2): every assumption, then the numbered steps. */
export function WorkedExample({ example }: { readonly example: WorkedExampleView }) {
  return (
    <Card variant="tile" testID="worked-example">
      <AppText variant="label" color="textSecondary">
        Assumptions
      </AppText>
      <Lines items={example.assumptions} />
      <AppText variant="label" color="textSecondary">
        Steps
      </AppText>
      <Lines items={example.steps} numbered />
    </Card>
  );
}

interface LearnSectionProps {
  readonly title: string;
  readonly inOneLine: string;
  readonly explanation: string;
  readonly simpler: string;
  readonly commonMistake: string;
}

/** Learn: today's idea, with "Explain more simply" from curated content (spec §7.2). */
export function LearnSection({ title, inOneLine, explanation, simpler, commonMistake }: LearnSectionProps) {
  const [showSimpler, setShowSimpler] = useState(false);
  return (
    <Card testID="lesson-reading">
      <AppText variant="title">{title}</AppText>
      <GlossaryText variant="heading">{inOneLine}</GlossaryText>
      <GlossaryText variant="reading">{explanation}</GlossaryText>
      {showSimpler ? (
        <Notice title="More simply">
          <GlossaryText variant="reading">{simpler}</GlossaryText>
        </Notice>
      ) : (
        <Button label="Explain more simply" variant="secondary" onPress={() => setShowSimpler(true)} />
      )}
      <Notice title="Common mistake" tone="warning">
        <GlossaryText>{commonMistake}</GlossaryText>
      </Notice>
    </Card>
  );
}

interface WatchSectionProps {
  readonly example: WorkedExampleView;
  readonly another: WorkedExampleView;
}

/** Watch: a worked example with every assumption stated, plus "Show another example". */
export function WatchSection({ example, another }: WatchSectionProps) {
  const [showAnother, setShowAnother] = useState(false);
  return (
    <Card>
      <CardHeader icon={Calculator} title="Worked example" />
      <WorkedExample example={showAnother ? another : example} />
      <Button
        label={showAnother ? 'Show the first example' : 'Show another example'}
        variant="secondary"
        onPress={() => setShowAnother((v) => !v)}
      />
    </Card>
  );
}
