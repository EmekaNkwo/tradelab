import type { ChecklistAnswers } from '../../domain/plan';
import type { OrderCheck } from './paperSession';

/** The checklist answers the order check already knows: whether a stop is set and whether the risk is within the rule. */
export function checklistPrefill(check: OrderCheck): ChecklistAnswers {
  const overRisk = check.violations.some((v) => v.rule === 'risk_per_trade');
  return {
    stop_set: check.plannedRisk ? 'yes' : 'no',
    risk_within: overRisk || !check.plannedRisk ? 'no' : 'yes',
  };
}
