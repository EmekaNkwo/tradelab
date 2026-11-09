import { router } from 'expo-router';
import { GlossaryText } from '../lesson/GlossaryText';
import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { CardHeader } from '../ui/CardHeader';
import { MonitorSmartphone, Target } from '../ui/icons';
import { canOpen } from '../../shared/routeAccess';

export interface PracticeView {
  readonly kind: string;
  readonly instructions: string;
  readonly mtTaskId?: string;
}

interface PracticeCardProps {
  readonly practice: PracticeView;
  /** The lesson's module, so a calculator task opens the calculator that module uses. */
  readonly moduleId?: string;
}

/** Modules whose calculator tasks need a calculator other than the first one. */
const MODULE_CALCULATORS: Readonly<Record<string, string>> = { futures: 'futures_contract', options: 'option_payoff' };

/**
 * Where each practice task kind opens. Exported so the route test can check every value is a real route. The
 * calculator opens on top of the lesson (Back returns to it); the others open inside the Practice or Learn tab with
 * that tab's first screen underneath, so the tab is never left stuck on the tool.
 */
export const TOOL_ROUTES: Readonly<Record<string, '/tools/calculator' | '/practice/chart-lab' | '/practice/replay' | '/practice/paper' | '/labs'>> = {
  calculator: '/tools/calculator',
  chart_lab: '/practice/chart-lab',
  replay: '/practice/replay',
  paper: '/practice/paper',
  fundamental: '/labs',
};

function openTool(kind: string, moduleId: string | undefined): void {
  const route = TOOL_ROUTES[kind];
  if (!route) return;
  if (kind === 'calculator') {
    const calc = moduleId ? MODULE_CALCULATORS[moduleId] : undefined;
    router.push(calc ? { pathname: '/tools/calculator', params: { calc } } : '/tools/calculator');
    return;
  }
  // Labs is a stack screen above the tabs; the practice tools live inside the Practice tab.
  if (route === '/labs') router.push(route);
  else router.push(route, { withAnchor: true });
}

const TOOL_LABELS: Readonly<Record<string, string>> = {
  calculator: 'Open the calculators',
  chart_lab: 'Open Chart Lab',
  replay: 'Open Replay',
  paper: 'Open paper trading',
  fundamental: 'Open the analysis labs',
};

/**
 * "Do it now" (spec §9.1). Links straight to the tool the practice needs:
 * the guided MetaTrader task, a calculator, Chart Lab, Replay, paper trading
 * or the analysis labs. Reflection tasks need no tool.
 */
export function PracticeCard({ practice, moduleId }: PracticeCardProps) {
  const metaTrader = practice.kind === 'metatrader';
  const toolRoute = TOOL_ROUTES[practice.kind];
  const toolLabel = toolRoute && canOpen(toolRoute) ? TOOL_LABELS[practice.kind] : undefined;
  return (
    <Card testID="practice-card">
      <CardHeader icon={metaTrader ? MonitorSmartphone : Target} tone={metaTrader ? 'neutral' : 'brand'} title="Do it now" badge={metaTrader ? 'demo' : undefined} />
      <GlossaryText>{practice.instructions}</GlossaryText>
      {metaTrader ? (
        <AppText variant="caption" color="textSecondary">
          Use a demo account only. Never enter real-account details anywhere. TradeLab cannot see inside MetaTrader, so marking this done is your own confirmation.
        </AppText>
      ) : null}
      {practice.mtTaskId && canOpen('/mt-task/[id]') ? (
        <Button
          label="Open the guided MetaTrader task"
          variant="secondary"
          onPress={() => router.push({ pathname: '/mt-task/[id]', params: { id: practice.mtTaskId as string } })}
        />
      ) : null}
      {toolLabel ? <Button label={toolLabel} variant="secondary" onPress={() => openTool(practice.kind, moduleId)} /> : null}
    </Card>
  );
}
