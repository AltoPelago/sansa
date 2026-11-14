import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAeonicArithmeticAndMaterialize as finite, evaluateAeonicArithmeticAndMaterializeText as finiteText,
  evaluateAeonicRationalArithmeticAndMaterialize as rational, evaluateAeonicRationalArithmeticAndMaterializeText as rationalText } from '../src/index.js';

const number = (value, history = 'none-declared') => ({ number: { category: 'finiteNumber', value }, history });
const request = (operation, left, right, profile = 'aeonic.operations.arithmetic.rational.v1') => ({ operation, input: { left: number(left), right: number(right), context: { profile } } });
const third = request('divide', '1', '3');
const roundedOutput = { family: 'decimal', quantize: { increment: { category: 'exactNumber', coefficient: '1', exponent: '-2' }, rounding: 'half-even' } };

test('one-call finite arithmetic returns materialized value and separate stage metadata without mutation', () => {
  const input = request('add', '0.1', '0.2', 'aeonic.operations.arithmetic.exact.v1'), output = { family: 'decimal' };
  const before = structuredClone({ input, output });
  const result = finite(input, output);
  assert.deepEqual(result.value, { number: { category: 'finiteNumber', value: '0.3' }, history: 'none-declared' });
  assert.deepEqual(result.metadata.steps.map(x => x.step), ['calculation', 'materialization']);
  assert.equal(result.metadata.steps[1].metadata.effectivePolicy.family, 'decimal');
  assert.deepEqual({ input, output }, before);
  assert.deepEqual(finiteText(JSON.stringify(input), output), result);
});

test('rational convenience quantizes only on explicit request, retaining all stage policies/history', () => {
  const exact = rational(request('divide', '1', '8'), { family: 'decimal' });
  assert.equal(exact.value.number.value, '0.125'); assert.equal(exact.value.history, 'none-declared');
  const result = rational(third, roundedOutput);
  assert.equal(result.value.number.value, '0.33'); assert.equal(result.value.history, 'approximation-declared');
  assert.deepEqual(result.metadata.steps.map(x => x.step), ['calculation', 'quantization', 'materialization']);
  assert.deepEqual(result.metadata.steps.map(x => x.metadata.evaluation), ['exact-for-operands', 'rounded-for-operands', 'exact-for-operands']);
  assert.equal(result.metadata.steps[1].metadata.effectivePolicy.rounding, 'half-even');
  assert.deepEqual(rationalText(JSON.stringify(third), roundedOutput), result);
});

test('combined diagnostics identify failing step and expose no intermediate or fallback value', () => {
  for (const [result, step, reason] of [
    [rational(request('divide', '1', '0'), { family: 'unknown', unknown: true }), 'calculation', 'division_by_zero'],
    [rational(third, { family: 'decimal', quantize: null }), 'quantization', 'invalid_policy'],
    [rational(third, { family: 'decimal' }), 'materialization', 'unrepresentable_result'],
    [rational(request('add', '0.6', '0'), { family: 'integer' }), 'materialization', 'unrepresentable_result'],
  ]) {
    assert.equal(result.outcome, 'diagnostic'); assert.equal(result.step, step); assert.equal(result.reason, reason);
    assert.ok(!Object.hasOwn(result, 'value')); assert.ok(!Object.hasOwn(result, 'metadata'));
  }
});

test('required output configuration, profile isolation, unknown policy fields and stage limits remain explicit', () => {
  for (const output of [undefined, null, [], {}]) assert.throws(() => rational(third, output), TypeError);
  const unsupported = finite(third, { family: 'decimal' }); assert.equal(unsupported.step, 'calculation'); assert.equal(unsupported.reason, 'unsupported_operation');
  const finiteInput = request('add', '1', '1', 'aeonic.operations.arithmetic.exact.v1');
  assert.equal(finite(finiteInput, roundedOutput).reason, 'invalid_policy');
  assert.equal(finite(finiteInput, { family: 'decimal', extra: 1 }).context.path, '/input/policy/extra');
  const resource = finite(finiteInput, { family: 'decimal' }, { resourceLimits: { maxNumericCharacters: 1 } });
  assert.equal(resource.step, 'materialization'); assert.equal(resource.reason, 'resource_limit');
  assert.equal(resource.context.path, '/input/value/number/exponent');
  const wrongProfile = rational(third, { family: 'decimal', profile: 'unknown' });
  assert.equal(wrongProfile.step, 'materialization'); assert.equal(wrongProfile.reason, 'unsupported_profile');
});

test('text ingress retains duplicate-key/byte guards; failure stops before later policy access', () => {
  assert.equal(rationalText('{"operation":"add","operation":"divide","input":{}}', { family: 'decimal' }).step, 'calculation');
  const oversized = rationalText(JSON.stringify(third), { family: 'decimal' }, { resourceLimits: { maxRequestBytes: 0 } });
  assert.equal(oversized.context.stage, 1); assert.equal(oversized.step, 'calculation');
  let reads = 0;
  const output = { family: 'decimal', get quantize() { reads++; throw new Error('must not run'); } };
  assert.equal(rational(request('divide', '0', '0'), output).reason, 'division_by_zero'); assert.equal(reads, 0);
});

test('combined zero/history and no-change quantization preserve mathematical and authored decisions', () => {
  const input = request('subtract', '1', '1'); input.input.left.history = 'approximation-declared';
  const result = rational(input, { family: 'decimal', zeroSign: 'negative', quantize: roundedOutput.quantize });
  assert.equal(result.value.number.value, '-0.0'); assert.equal(result.value.history, 'approximation-declared');
  assert.equal(result.metadata.steps[1].metadata.evaluation, 'exact-for-operands');
});

