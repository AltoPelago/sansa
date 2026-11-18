import { evaluateAeonicCivilClock, evaluateAeonicCivilClockText, AEONIC_TEMPORAL_CIVIL_CLOCK_PROFILE as profile,
  type AeonicCivilClockOperand, type AeonicCivilClockRequest, type AeonicCivilClockResult,
  type AeonicCivilClockArithmeticResult, type AeonicCivilClockRelationResult,
  type AeonicDerivedClockBundle } from '@altopelago/sansa';
const clock: AeonicCivilClockOperand = { temporal: { category: 'civilClock', value: '23:30:00' } };
const shifted: AeonicCivilClockArithmeticResult = evaluateAeonicCivilClock({ operation: 'shiftClock', input: {
  value: clock, context: { profile }, amount: { number: { category: 'finiteNumber', value: '7200' } },
} });
if (shifted.outcome === 'value') {
  evaluateAeonicCivilClock({ operation: 'shiftClock', input: { value: shifted.value, context: { profile },
    amount: { number: { category: 'exactNumber', coefficient: '-72', exponent: '2' }, history: 'approximation-declared' } } });
  const history: 'none-declared' | 'approximation-declared' = shifted.value.history; void history;
}
const derived: AeonicDerivedClockBundle = { temporal: { category: 'civilClockSet', pieces: [
  { kind: 'interval', start: { day: '0', time: '23:59:00.5' }, end: { day: '1', time: '00:00:00.5' }, includeStart: true, includeEnd: false },
] }, originClockForm: 'minute', history: 'none-declared' };
evaluateAeonicCivilClock({ operation: 'step', input: { value: derived, context: { profile }, policy: { clockForm: 'minute', count: '1' } } });
evaluateAeonicCivilClock({ operation: 'materialize', input: { value: clock, policy: { profile, clockForm: 'second' } } });
const relation: AeonicCivilClockRelationResult = evaluateAeonicCivilClock({ operation: 'compare', input: { left: clock, right: derived, policy: { profile } } });
if (relation.outcome === 'value') { const origin = relation.metadata.operandOrigin.left; void origin; }
declare const request: AeonicCivilClockRequest;
const result: AeonicCivilClockResult = evaluateAeonicCivilClock(request, { capabilities: ['relations', 'arithmetic'], resourceLimits: { maxRelativeDayDigits: 128 } });
const textResult: AeonicCivilClockResult = evaluateAeonicCivilClockText('{}'); void result; void textResult;
// @ts-expect-error Derived bundles require explicit clock origin and history.
const missing: AeonicDerivedClockBundle = { temporal: { category: 'civilClockSet', pieces: [{ kind: 'point', at: { day: '0', time: '09:30:00' } }] } }; void missing;
// @ts-expect-error Materialization requires an explicit clock selector.
evaluateAeonicCivilClock({ operation: 'materialize', input: { value: clock, policy: { profile } } });
// @ts-expect-error Clock amounts exclude nonterminating rational descriptors.
evaluateAeonicCivilClock({ operation: 'shiftClock', input: { value: clock, context: { profile }, amount: { number: { category: 'exactRational', coefficient: '1', exponent: '0', denominator: '3' }, history: 'none-declared' } } });
// @ts-expect-error Relative days are portable integer text, not host numbers.
const numericDay: AeonicDerivedClockBundle = { temporal: { category: 'civilClockSet', pieces: [{ kind: 'point', at: { day: 1, time: '09:30:00' } }] }, originClockForm: 'second', history: 'none-declared' }; void numericDay;
