/**
 * Pre-trade checklist (spec §20), run before placing a paper trade or going
 * to MetaTrader. The screens wait until every question is answered, but no
 * answer stops the trade: answers that need a second look are listed as
 * cautions. Answers about the order itself (stop, risk) come from the order
 * check when known.
 */

export type ChecklistItemId = 'in_plan' | 'stop_set' | 'risk_within' | 'news_soon' | 'calm';
export type ChecklistAnswer = 'yes' | 'no' | 'unsure';

export interface ChecklistItem {
  readonly id: ChecklistItemId;
  readonly question: string;
  /** The answer that is fine; any other answer raises the caution. */
  readonly fine: ChecklistAnswer;
  readonly caution: string;
}

export const CHECKLIST: readonly ChecklistItem[] = [
  { id: 'in_plan', question: 'Is this trade in your trading plan?', fine: 'yes', caution: 'It is not clearly in your plan. A trade outside the plan cannot be judged against it.' },
  { id: 'stop_set', question: 'Is a stop loss set?', fine: 'yes', caution: 'There is no stop, so the possible loss is not defined.' },
  { id: 'risk_within', question: 'Is the risk within your limit?', fine: 'yes', caution: 'The risk is over your limit, or you have not worked it out.' },
  { id: 'news_soon', question: 'Is there important news due soon for this market?', fine: 'no', caution: 'News may be due. Spreads can widen and prices can jump around releases.' },
  { id: 'calm', question: 'Are you calm, and not trying to win back a loss?', fine: 'yes', caution: 'You may not be calm. Trades made to win back a loss tend to break rules.' },
];

export type ChecklistAnswers = Partial<Readonly<Record<ChecklistItemId, ChecklistAnswer>>>;

export interface ChecklistResult {
  readonly complete: boolean;
  readonly unanswered: readonly ChecklistItemId[];
  readonly cautions: readonly { readonly id: ChecklistItemId; readonly text: string }[];
}

export function evaluateChecklist(answers: ChecklistAnswers): ChecklistResult {
  const unanswered = CHECKLIST.filter((i) => answers[i.id] === undefined).map((i) => i.id);
  const cautions = CHECKLIST.filter((i) => answers[i.id] !== undefined && answers[i.id] !== i.fine).map((i) => ({ id: i.id, text: i.caution }));
  return { complete: unanswered.length === 0, unanswered, cautions };
}
