import { evaluateAeonicCivilDateTime, evaluateAeonicCivilDateTimeText, AEONIC_TEMPORAL_CIVIL_DATETIME_PROFILE as profile,
  type AeonicCivilDateTimeOperand, type AeonicCivilDateTimeRequest, type AeonicCivilDateTimeResult,
  type AeonicCivilDateTimeArithmeticResult, type AeonicCivilDateTimeRelationResult,
  type AeonicDerivedDateTimeBundle } from '@altopelago/sansa';
const date: AeonicCivilDateTimeOperand = { temporal: { category: 'civilDateTime', value: '2024-02T09:30' } };
const shifted: AeonicCivilDateTimeArithmeticResult = evaluateAeonicCivilDateTime({ operation: 'shift', input: {
  value: date, context: { profile }, policy: { unit: 'month', count: '1' },
} });
if (shifted.outcome === 'value') {
  evaluateAeonicCivilDateTime({ operation: 'shiftClock', input: { value: shifted.value, context: { profile },
    amount: { number: { category: 'exactNumber', coefficient: '2', exponent: '-1' }, history: 'approximation-declared' } } });
  const history: 'none-declared' | 'clamping-declared' = shifted.value.history.clamping;
  void history;
}
const relation: AeonicCivilDateTimeRelationResult = evaluateAeonicCivilDateTime({ operation: 'compare', input: { left: date, right: date, policy: { profile } } });
if (relation.outcome === 'value') { const clock = relation.metadata.operandOrigin.left.clockForm; void clock; }
declare const request: AeonicCivilDateTimeRequest;
const result: AeonicCivilDateTimeResult = evaluateAeonicCivilDateTime(request, { capabilities: ['relations', 'arithmetic'] });
const textResult: AeonicCivilDateTimeResult = evaluateAeonicCivilDateTimeText('{}'); void result; void textResult;
// @ts-expect-error Derived bundles require explicit origins and both histories.
const missing: AeonicDerivedDateTimeBundle = { temporal: { category: 'civilDateTimeSet', pieces: [{ kind: 'point', at: '2024-03-01T09:30:00' }] } }; void missing;
// @ts-expect-error Materialization requires date and clock selectors.
evaluateAeonicCivilDateTime({ operation: 'materialize', input: { value: date, policy: { profile, dateGranularity: 'month' } } });
// @ts-expect-error Clock amount does not accept a nonterminating rational descriptor.
evaluateAeonicCivilDateTime({ operation: 'shiftClock', input: { value: date, context: { profile }, amount: { number: { category: 'exactRational', coefficient: '1', exponent: '0', denominator: '3' }, history: 'none-declared' } } });
