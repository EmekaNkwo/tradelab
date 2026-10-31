import { useMemo, useState } from 'react';
import { investingSandbox, portfolioSummary, type PortfolioAccountInput, type PortfolioSummary, type SandboxInput, type SandboxResult } from '../../domain/portfolio';
import { practiceInstrument } from '../../domain/simulation/instruments';
import type { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import type { Result } from '../../shared/result';
import type { QueryState } from '../app';
import { paperCandles, usePaperAccounts } from '../paper';

/** The portfolio across every paper account (spec §18). Candles are regenerated from each account's seed. */
export function usePortfolio(): QueryState<PortfolioSummary> & { reload: () => void } {
  const accounts = usePaperAccounts();
  const summary = useMemo((): QueryState<PortfolioSummary> => {
    if (accounts.status !== 'success') return accounts;
    const inputs: PortfolioAccountInput[] = accounts.data.flatMap((a) => {
      const instrument = practiceInstrument(a.instrumentId);
      if (!instrument) {
        logger.warn('Paper account with an unknown market left out of the portfolio', { instrumentId: a.instrumentId });
        return [];
      }
      return [{ id: a.id, name: a.name, instrument, state: a.state, candles: paperCandles(instrument, a.scenarioKind, a.seed, a.timeframe) }];
    });
    return { status: 'success', data: portfolioSummary(inputs) };
  }, [accounts]);
  return { ...summary, reload: accounts.reload };
}

export const DEFAULT_SANDBOX: SandboxInput = { seed: 1, companies: 10, years: 10, startAmount: 10000 };

export function useInvestingSandbox(): { readonly input: SandboxInput; readonly setInput: (i: SandboxInput) => void; readonly result: Result<SandboxResult, AppError> } {
  const [input, setInput] = useState<SandboxInput>(DEFAULT_SANDBOX);
  const result = useMemo(() => investingSandbox(input), [input]);
  return { input, setInput, result };
}
