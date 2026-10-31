import { useCallback } from 'react';
import { comparisonIssues, type ComparisonIssue } from '../../domain/backtest';
import type { BacktestRun, PlaybookEntry, PlaybookInput, SaveVersionInput, StrategyVersion } from '../../data';
import { validationError } from '../../shared/errors';
import { err, ok } from '../../shared/result';
import { toUtcIso } from '../../shared/time';
import { useContainer, useLiveQuery, type QueryState } from '../app';

const TABLES = ['strategy_version', 'backtest_run', 'playbook_entry'];

export function useMyStrategies(): QueryState<readonly StrategyVersion[]> & { reload: () => void } {
  const c = useContainer();
  return useLiveQuery(() => c.backtests.strategies(), TABLES);
}

export function useStrategyVersions(strategyId: string | null): QueryState<readonly StrategyVersion[]> & { reload: () => void } {
  const c = useContainer();
  return useLiveQuery(() => (strategyId ? c.backtests.versions(strategyId) : Promise.resolve(ok([]))), TABLES);
}

export function useRuns(strategyId: string | null): QueryState<readonly BacktestRun[]> & { reload: () => void } {
  const c = useContainer();
  return useLiveQuery(() => c.backtests.runs(strategyId), TABLES);
}

export function useRunRecord(id: string): QueryState<BacktestRun | null> & { reload: () => void } {
  const c = useContainer();
  return useLiveQuery(() => c.backtests.run(id), TABLES);
}

export function usePlaybook(strategyId: string): QueryState<PlaybookEntry | null> & { reload: () => void } {
  const c = useContainer();
  return useLiveQuery(() => c.backtests.playbook(strategyId), TABLES);
}

export function useStrategyActions() {
  const c = useContainer();
  return {
    saveVersion: useCallback((input: SaveVersionInput) => c.backtests.saveVersion(input, toUtcIso(c.clock.now())), [c]),
    savePlaybook: useCallback((entry: PlaybookInput) => c.backtests.savePlaybook(entry, toUtcIso(c.clock.now())), [c]),
  };
}

export interface ComparedRun {
  readonly run: BacktestRun;
  readonly version: StrategyVersion | null;
}

/** Loads 2–4 runs and the reasons they may not be comparable (spec §16.4). */
export function useComparison(runIds: readonly string[]): QueryState<{ readonly runs: readonly ComparedRun[]; readonly issues: readonly ComparisonIssue[] }> & { reload: () => void } {
  const c = useContainer();
  const key = runIds.join(',');
  return useLiveQuery(async () => {
    const runs: ComparedRun[] = [];
    for (const id of key ? key.split(',') : []) {
      const run = await c.backtests.run(id);
      if (!run.ok) return run;
      if (!run.value) return err(validationError('One of these runs no longer exists'));
      const versions = await c.backtests.versions(run.value.strategyId);
      if (!versions.ok) return versions;
      runs.push({ run: run.value, version: versions.value.find((v) => v.version === run.value?.version) ?? null });
    }
    const issues = comparisonIssues(
      runs.flatMap(({ run, version }) => (version ? [{ definition: version.definition, dataset: run.inputs.dataset, capital: run.inputs.capital, costs: run.inputs.costs, split: run.inputs.split, engineVersion: run.result.engineVersion }] : [])),
    );
    const missing = runs.some((r) => r.version === null) ? [{ severity: 'refuse' as const, message: 'A strategy version for one of these runs could not be read.' }] : [];
    return ok({ runs, issues: [...missing, ...issues] });
  }, TABLES);
}
