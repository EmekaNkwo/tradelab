export {
  DEFAULT_PAPER_BALANCE,
  PAPER_BALANCES,
  PAPER_LABEL,
  PAPER_TIMEFRAMES,
  paperCandles,
  type OrderCheck,
  type TicketForm,
} from './paperSession';
export { useCreatePaperAccount, usePaperAccounts, usePaperSession, useRiskRules, type NewAccountForm, type PaperSession, type PaperSessionState } from './usePaper';
export type { Timeframe } from '../../domain/models/markets';
export { PRACTICE_INSTRUMENTS, practiceInstrument, stopWidened, type PaperView, type PracticeInstrument } from '../../domain/simulation';
export { EXAMPLE_RISK_RULES, RISK_RULE_LIMITS, invalidRuleFields, type RiskRules, type RuleViolation, type CooldownState } from '../../domain/risk';
export { checklistPrefill } from './checklistPrefill';
export { baseSymbol, costsText, equityChange, groupedFixed, moneyMagnitude, moneyText, riskAtStopsText, spokenMoney, tradeR, tradeRow, type TradeRow } from './paperFigures';
