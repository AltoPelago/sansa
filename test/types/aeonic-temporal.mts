import {
  evaluateAeonicTemporal as evaluate, evaluateAeonicTemporalText,
  AEONIC_TEMPORAL_CIVIL_DATE_PROFILE as profile,
  AEONIC_TEMPORAL_CIVIL_DATE_DEFAULT_RESOURCE_LIMITS,
  type AeonicTemporalOperand, type AeonicTemporalCalendarResult,
} from '../../src/index.js';
const context = { profile };
const february: AeonicTemporalOperand = { temporal: { category: 'civilDate', value: '2024-02' } };
const shifted = evaluate({ operation: 'shift', input: { value: february, context, policy: { unit: 'month', count: '1' } } });
if (shifted.outcome === 'value') {
  evaluate({ operation: 'shift', input: { value: shifted.value, context, policy: { unit: 'day', count: '1' } } });
  evaluate({ operation: 'materialize', input: { value: shifted.value, context, policy: { granularity: 'month' } } });
  const origin: 'day' | 'month' | 'year' | 'undeclared' = shifted.value.originGranularity;
  const history: 'none-declared' | 'clamping-declared' = shifted.value.history;
  void origin; void history;
} else {
  // @ts-expect-error Diagnostics never carry a partial value.
  shifted.value;
}
const relation = evaluate({ operation: 'relate', input: { left: february, right: february, context } });
if (relation.outcome === 'value') {
  const category: 'symbol' = relation.value.category;
  const history = relation.metadata.operandHistory.left;
  // @ts-expect-error Symbolic relation outcomes cannot feed a date operation.
  evaluate({ operation: 'step', input: { value: relation.value, context, policy: { granularity: 'month', count: '1' } } });
  // @ts-expect-error Comparison results are symbols, not Boolean predicates.
  const predicate: boolean = relation.value;
  void category; void history; void predicate;
}
evaluateAeonicTemporalText('{}', { capabilities: ['relations'], resourceLimits: { maxInputRanges: 1 } });
const limit: number = AEONIC_TEMPORAL_CIVIL_DATE_DEFAULT_RESOURCE_LIMITS.maxCalendarWork;
void limit;
// @ts-expect-error Derived date ranges require explicit origin and history.
const missing: AeonicTemporalOperand = { temporal: { category: 'civilDateSet', ranges: [{ start: '2024-03-01', end: '2024-03-29' }] } };
// @ts-expect-error Calendar counts use canonical integer text, not host numbers.
evaluate({ operation: 'shift', input: { value: february, context, policy: { unit: 'month', count: 1 } } });
// @ts-expect-error Exact materialization requires explicit granularity.
evaluate({ operation: 'materialize', input: { value: february, context, policy: {} } });
// @ts-expect-error Trusted capability selections have fixed names.
evaluateAeonicTemporalText('{}', { capabilities: ['sorting'] });
void missing;
const generic: AeonicTemporalCalendarResult = shifted;
void generic;
