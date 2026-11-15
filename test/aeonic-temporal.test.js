import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAeonicTemporal as evaluate, evaluateAeonicTemporalText as evaluateTemporalText, AEONIC_TEMPORAL_CIVIL_DATE_PROFILE as profile } from '../src/index.js';
import { parseRationalArithmeticEnvelope } from '../src/aeonic-rational-json.js';
const civil = value => ({ temporal: { category: 'civilDate', value } });
const request = (operation, value, policy, right) => ({ operation, input: {
  ...(['equal', 'compare', 'relate'].includes(operation) ? { left: value, right } : { value }),
  context: { profile }, ...(policy ? { policy } : {}),
} });
const shift = (value, unit = 'month', count = '1', options) => evaluate(request('shift', value, { unit, count }), options);
const day = result => result.value.temporal.ranges[0].start;

test('civil-date chaining retains exact ranges and distinguishes whole-period stepping', () => {
  const input = civil('2024-02'), copy = structuredClone(input);
  const narrowed = shift(input);
  assert.deepEqual(narrowed.value.temporal.ranges, [{ start: '2024-03-01', end: '2024-03-29' }]);
  assert.deepEqual(shift(narrowed.value, 'day').value.temporal.ranges, [{ start: '2024-03-02', end: '2024-03-30' }]);
  assert.equal(evaluate(request('materialize', narrowed.value, { granularity: 'month' })).reason, 'unrepresentable_result');
  assert.equal(evaluate(request('step', narrowed.value, { granularity: 'month', count: '1' })).reason, 'incompatible_operand');
  const stepped = evaluate(request('step', input, { granularity: 'month', count: '1' }));
  assert.equal(evaluate(request('materialize', stepped.value, { granularity: 'month' })).value.temporal.value, '2024-03');
  assert.deepEqual(input, copy);
});

test('direct and chained clamps differ; month/EOM and year/EOY meanings remain explicit', () => {
  const january = civil('2023-01-31'), first = shift(january), next = shift(first.value);
  assert.equal(day(shift(january, 'month', '2')), '2023-03-31');
  assert.equal(day(next), '2023-03-28');
  assert.equal(first.metadata.clamping, 'applied');
  assert.equal(next.metadata.clamping, 'not-applied');
  assert.equal(next.value.history, 'clamping-declared');
  assert.equal(day(shift(civil('2023-02-27'), 'eom')), '2023-03-30');
  assert.equal(day(shift(civil('2023-02-28'), 'eoy')), '2024-02-29');
  assert.equal(day(shift(civil('2023-02-28'), 'year')), '2024-02-28');
  assert.equal(day(shift(civil('0001-01-01'), 'day', '0')), '0001-01-01');
  assert.equal(day(shift(civil('9999-12-31'), 'day', '-1')), '9999-12-30');
});

test('relations use symbols, exact sets and distinct history ownership', () => {
  const month = civil('2024-03'), day = { ...civil('2024-03-15'), history: 'clamping-declared' };
  assert.equal(evaluate(request('equal', month, null, day)).value.value, 'notEqual');
  const relation = evaluate(request('relate', month, null, day));
  assert.equal(relation.value.value, 'contains');
  assert.deepEqual(relation.metadata.operandHistory, { left: 'none-declared', right: 'clamping-declared' });
  assert.equal(evaluate(request('compare', month, null, day)).value.value, 'indeterminate');
});

test('explicit selection, complete trusted capabilities and deterministic fail-closed precedence', () => {
  const r = request('shift', civil('2024-02'), { unit: 'month', count: '1' });
  delete r.input.context;
  assert.deepEqual(evaluate(r), { outcome: 'diagnostic', reason: 'unsupported_profile', context: { stage: 3, path: null } });
  assert.equal(evaluate(r, { capabilities: ['relations'] }).reason, 'unsupported_operation');
  assert.equal(evaluate(request('step', civil('2024-03-15'), { granularity: 'month', count: '9'.repeat(32) }), { resourceLimits: { maxCalendarWork: 0 } }).reason, 'incompatible_operand');
  assert.equal(shift(civil('9999-12-31'), 'day', '1', { resourceLimits: { maxCalendarWork: 0 } }).reason, 'unrepresentable_result');
  assert.equal(shift(civil('2024-02'), 'month', '😀', { resourceLimits: { maxCountCharacters: 1 } }).reason, 'invalid_policy');
  assert.equal(shift(civil('2024-02'), 'month', '😀', { resourceLimits: { maxCountCharacters: 0 } }).reason, 'resource_limit');
  assert.equal(shift(civil('2024-02'), 'month', '9'.repeat(33)).context.stage, 3);
  assert.equal(shift(civil('2024-02'), 'month', '9'.repeat(32)).context.stage, 6);
  for (const resourceLimits of [null, [], { maxCalendarWork: null }, { maxRequestBytes: NaN }, { unknown: 1 }]) assert.throws(() => evaluate(r, { resourceLimits }), TypeError);
  assert.throws(() => evaluate(r, { capabilities: ['missing'] }), TypeError);
  assert.throws(() => evaluate(r, { capabilities: ['relations', 'relations'] }), TypeError);
  const diagnostic = shift(civil('2024-'), 'year', '1', { resourceLimits: { maxCalendarWork: 0, maxResultBytes: 0 } });
  assert.equal(diagnostic.reason, 'resource_limit'); assert.equal(diagnostic.context.stage, 6); assert.equal('value' in diagnostic, false);
});

test('strict raw and structured ingress preserves malformed token width and rejects cycles', () => {
  const raw = '{"operation":"equal","input":{"left":{"temporal":{"category":"container","payload":-0}},"right":{"temporal":{"category":"civilDate","value":"2024-03"}},"context":{"profile":"'+profile+'"}}}';
  const parsed = parseRationalArithmeticEnvelope('{"fixture":{"request":'+raw+'}}').fixture.request;
  assert.equal(evaluate(parsed).reason, 'unsupported_domain');
  assert.equal(evaluate(parsed, { resourceLimits: { maxRequestBytes: Buffer.byteLength(raw) - 1 } }).context.stage, 1);
  assert.equal(evaluateTemporalText('{"operation":"shift","operation":"equal"}').context.stage, 2);
  const cycle = {}; cycle.self = cycle;
  assert.equal(evaluate(cycle).reason, 'invalid_operand');
  let graph = [];
  for (let i = 0; i < 22; i++) graph = [graph, graph];
  assert.equal(evaluate(graph).context.stage, 1);
  assert.equal(evaluateTemporalText('\uD800').context.stage, 1);
});


test('browser-safe UTF-8 admission counts multibyte scalar requests exactly', () => {
  for (const text of ['é', '😀', 'é😀'.repeat(16)]) {
    const logical = request('shift', civil('2024-02'), { unit: 'month', count: '1' }); logical[text] = 0;
    const raw = JSON.stringify(logical), bytes = Buffer.byteLength(raw);
    assert.equal(evaluateTemporalText(raw, { resourceLimits: { maxRequestBytes: bytes - 1 } }).context.stage, 1);
    assert.equal(evaluateTemporalText(raw, { resourceLimits: { maxRequestBytes: bytes } }).context.stage, 2);
    assert.equal(evaluate(logical, { resourceLimits: { maxRequestBytes: bytes - 1 } }).context.stage, 1);
    assert.equal(evaluate(logical, { resourceLimits: { maxRequestBytes: bytes } }).context.stage, 2);
  }
});
