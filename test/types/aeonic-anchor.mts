import { evaluateAeonicCivilAnchor, evaluateAeonicCivilAnchorText, evaluateAeonicCivilClock, evaluateAeonicCivilDateTime,
  AEONIC_TEMPORAL_CIVIL_ANCHOR_PROFILE as profile, type AeonicCivilAnchorRequest, type AeonicCivilAnchorResult,
  type AeonicDerivedClockBundle, type AeonicDerivedDateBundle } from '@altopelago/sansa';
const anchor: AeonicDerivedDateBundle = { temporal: { category: 'civilDateSet', ranges: [{ start: '2024-02-28', end: '2024-02-28' }] }, originGranularity: 'month', history: 'clamping-declared' };
const clock: AeonicDerivedClockBundle = { temporal: { category: 'civilClockSet', pieces: [{ kind: 'point', at: { day: '1', time: '01:30:00.125' } }] }, originClockForm: 'second', history: 'approximation-declared' };
const request: AeonicCivilAnchorRequest = { operation: 'anchor', input: { anchor, clock, context: { profile } } };
const result: AeonicCivilAnchorResult = evaluateAeonicCivilAnchor(request, { resourceLimits: { maxWork: 2 }, capabilities: ['anchoring'] });
if (result.outcome === 'value') {
  evaluateAeonicCivilDateTime({ operation: 'shiftClock', input: { value: result.value, amount: { number: { category: 'finiteNumber', value: '0.2' } }, context: { profile: 'aeonic.operations.temporal.civil-datetime.v1' } } });
  const status: 'not-applied' = result.metadata.clamping; void status;
}
const shifted = evaluateAeonicCivilClock({ operation: 'shiftClock', input: { value: clock, amount: { number: { category: 'finiteNumber', value: '0' } }, context: { profile: 'aeonic.operations.temporal.civil-clock.v1' } } });
if (shifted.outcome === 'value') evaluateAeonicCivilAnchor({ operation: 'anchor', input: { anchor, clock: shifted.value, policy: { profile } } });
evaluateAeonicCivilAnchorText('{}');
// @ts-expect-error Clock input is required.
evaluateAeonicCivilAnchor({ operation: 'anchor', input: { anchor, context: { profile } } });
// @ts-expect-error Independent date and clock histories cannot be interchanged.
evaluateAeonicCivilAnchor({ operation: 'anchor', input: { anchor: clock, clock, context: { profile } } });
// @ts-expect-error Only the complete anchoring capability is supported.
evaluateAeonicCivilAnchor(request, { capabilities: ['relations'] });
