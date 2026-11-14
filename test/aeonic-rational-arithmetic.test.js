import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  evaluateAeonicRationalArithmetic as evaluate, evaluateAeonicRationalArithmeticText as evaluateText,
  AEONIC_RATIONAL_ARITHMETIC_PROFILE as profile,
} from '../src/index.js';
import { evaluateAeonicArithmetic as finite } from '../src/index.js';

const authored = (value, history) => ({ number: { category: 'finiteNumber', value }, ...(history ? { history } : {}) });
const exact = (coefficient, exponent = '0', denominator, history = 'none-declared') => ({
  number: { category: denominator ? 'exactRational' : 'exactNumber', coefficient, exponent,
    ...(denominator ? { denominator } : {}) }, history,
});
const request = (operation, left, right, policy) => ({ operation, input: {
  ...(['quantize', 'materialize'].includes(operation) ? { value: left } : { left, right }),
  context: { profile }, ...(policy ? { policy } : {}),
} });
const grid = (c, e, rounding = 'half-even') => ({ increment: exact(c, e).number, rounding });
const number = (result) => { assert.equal(result.outcome, 'value'); return result.value.number; };

test('rational capability is explicit; finite default and output contract remain unchanged', () => {
  const input = request('divide', authored('1'), authored('3'));
  delete input.input.context;
  assert.deepEqual(evaluate(input), { outcome: 'diagnostic', reason: 'unsupported_profile', context: { stage: 3, path: null } });
  assert.equal(finite({ operation: 'add', input: { left: authored('1'), right: authored('2') } }).value.number.coefficient, '3');
  assert.equal(finite(input).reason, 'unsupported_operation');
  assert.equal(finite({ operation: 'materialize', input: { value: exact('125', '-3'), policy: { family: 'exponent' } } }).value.number.value, '125e-3');
  assert.equal(number(evaluate(request('materialize', exact('125', '-3'), undefined, { family: 'exponent' }))).value, '1.25e-1');
});

test('exact rational outputs chain and collapse into the finite descriptor', () => {
  const third = evaluate(request('divide', authored('1'), authored('3'))).value;
  assert.deepEqual(third, exact('1', '0', '3'));
  assert.deepEqual(evaluate(request('divide', authored('1'), authored('6'))).value, exact('5', '-1', '3'));
  assert.deepEqual(evaluate(request('multiply', third, authored('3'))).value, exact('1'));
  assert.deepEqual(evaluate(request('add', third, exact('5', '-1', '3'))).value, exact('5', '-1'));
  assert.deepEqual(evaluate(request('divide', authored('1'), third)).value, exact('3'));
  assert.equal(evaluate(request('divide', authored('0'), authored('-0'))).reason, 'division_by_zero');
});

test('canonical incoming transport, required history and fail-closed configuration', () => {
  for (const value of [exact('2', '0', '6'), exact('1', '0', '2'), exact('10', '-1', '3'), exact('0', '0', '3')]) {
    const r = evaluate(request('add', value, authored('0')));
    assert.equal(r.reason, 'invalid_operand'); assert.equal(Object.hasOwn(r, 'value'), false);
  }
  const value = exact('1', '0', '3'); delete value.history;
  assert.equal(evaluate(request('add', value, authored('0'))).context.path, '/input/left/history');
  for (const resourceLimits of [null, [], { maxDenominatorDigits: true }, { maxDenominatorDigits: -1 }]) {
    assert.throws(() => evaluate(request('add', authored('1'), authored('2')), { resourceLimits }), TypeError);
  }
});

test('signed directed and tie modes use exact grid multiplier parity', () => {
  const modes = {
    'half-even': ['-12', '-1'], 'half-away-from-zero': ['-13', '-1'],
    'half-toward-zero': ['-12', '-1'], 'toward-zero': ['-12', '-1'],
    'away-from-zero': ['-13', '-1'], floor: ['-13', '-1'], ceiling: ['-12', '-1'],
  };
  for (const [mode, [c, e]] of Object.entries(modes)) {
    assert.deepEqual(number(evaluate(request('quantize', authored('-1.25'), undefined, grid('1', '-1', mode)))), exact(c, e).number);
  }
  assert.deepEqual(number(evaluate(request('quantize', authored('0.125'), undefined, grid('5', '-2')))), exact('1', '-1').number);
  assert.deepEqual(number(evaluate(request('quantize', authored('0.175'), undefined, grid('5', '-2')))), exact('2', '-1').number);
});

test('new rounding history remains separate from subsequent exact evaluation', () => {
  const third = evaluate(request('divide', authored('1'), authored('3'))).value;
  const rounded = evaluate(request('quantize', third, undefined, grid('1', '-2')));
  assert.deepEqual(rounded.value, exact('33', '-2', undefined, 'approximation-declared'));
  assert.equal(rounded.metadata.evaluation, 'rounded-for-operands');
  const later = evaluate(request('multiply', rounded.value, authored('3')));
  assert.deepEqual(later.value, exact('99', '-2', undefined, 'approximation-declared'));
  assert.equal(later.metadata.evaluation, 'exact-for-operands');
  const unchanged = evaluate(request('quantize', later.value, undefined, grid('1', '-2')));
  assert.deepEqual(unchanged.value, later.value);
  assert.equal(unchanged.metadata.evaluation, 'exact-for-operands');
  const cancelled = evaluate(request('subtract', third, exact('1', '0', '3', 'approximation-declared')));
  assert.deepEqual(cancelled.value, exact('0', '0', undefined, 'approximation-declared'));
});

test('compact exponents, cancellation, and internal-only ratio limits', () => {
  const limits = { resourceLimits: { maxWorkspaceDigits: 2 } };
  const million = exact('1', '1000000');
  assert.deepEqual(evaluate(request('quantize', million, undefined, grid('1', '-1')), limits).value, million);
  assert.deepEqual(evaluate(request('quantize', authored('1'), undefined, grid('1', '1000000')), limits).value,
    exact('0', '0', undefined, 'approximation-declared'));
  assert.deepEqual(evaluate(request('quantize', authored('-1'), undefined, grid('1', '1000000', 'floor')), limits).value,
    exact('-1', '1000000', undefined, 'approximation-declared'));
  assert.deepEqual(evaluate(request('multiply', exact('1', '0', '999'), authored('999')), limits).value, exact('1'));
  assert.equal(evaluate(request('multiply', exact('1', '0', '999'), authored('999')), { resourceLimits: { maxWorkspaceDigits: 1 } }).reason, 'resource_limit');
  const r = evaluate(request('quantize', authored('1'), undefined, grid('3', '0')), { resourceLimits: { maxDenominatorDigits: 0 } });
  assert.deepEqual(r.value, exact('0', '0', undefined, 'approximation-declared'));
});

test('authored admission bounds normalize coefficients but still check the original exponent', () => {
  assert.deepEqual(evaluate(request('add', authored('1.0'), authored('0')), { resourceLimits: { maxCoefficientDigits: 1 } }).value, exact('1'));
  const bad = evaluate(request('add', authored('0e100'), authored('0')), { resourceLimits: { maxExponentMagnitude: 2 } });
  assert.equal(bad.reason, 'resource_limit'); assert.equal(bad.context.path, '/input/left/number/value');
  assert.equal(evaluate(request('add', authored('1e100x'), authored('0')), { resourceLimits: { maxExponentMagnitude: 2 } }).reason, 'invalid_operand');
});

test('materialization distinguishes exact representability, rendering size and signed zero', () => {
  const third = exact('1', '0', '3');
  const r = evaluate(request('materialize', third, undefined, { family: 'decimal' }), { resourceLimits: { maxOutputCharacters: 0 } });
  assert.equal(r.reason, 'unrepresentable_result');
  assert.equal(number(evaluate(request('materialize', exact('0'), undefined, { family: 'decimal', zeroSign: 'negative' }))).value, '-0.0');
  assert.equal(evaluate(request('materialize', exact('1', '1000000'), undefined, { family: 'integer' })).reason, 'resource_limit');
  assert.equal(number(evaluate(request('materialize', exact('1', '1000000'), undefined, { family: 'exponent' }))).value, '1e1000000');
});

test('strict JSON and structured ingress preserve failures, depth and expanded alias bytes', () => {
  assert.equal(evaluateText('{"operation":"add","operation":"divide","input":{}}').context.stage, 2);
  const cycle = {}; cycle.self = cycle;
  assert.equal(evaluate(cycle).reason, 'invalid_operand');
  assert.equal(evaluate(cycle, { resourceLimits: { maxRequestDepth: 0 } }).reason, 'resource_limit');
  let reads = 0;
  let graph = { get payload() { reads++; return 'x'; } };
  for (let i = 0; i < 20; i++) graph = { a: graph, b: graph };
  assert.equal(evaluate(graph, { resourceLimits: { maxRequestBytes: 128 } }).reason, 'resource_limit');
  assert.ok(reads < 20, 'expanded JSON byte guard must precede complete alias expansion');
  assert.throws(() => evaluate({ value: Infinity }), TypeError);
  assert.throws(() => evaluate({ value: new Date(0) }), TypeError);
  assert.throws(() => evaluate({ value: new Map() }), TypeError);
});

test('STDIO rejects malformed/null/rounded trusted limits as harness failures', () => {
  const fixture = { request: request('add', authored('1'), authored('2')) };
  for (const limits of ['null', '{"maxDenominatorDigits":true}', '{"maxDenominatorDigits":1.0000000000000001}']) {
    const input = '{"lane":"aeonic-rational-arithmetic","case_id":"bad","fixture":' + JSON.stringify(fixture)
      + ',"policy":{"resourceLimits":' + limits + '}}';
    const child = spawnSync(process.execPath, ['scripts/cts-aeonic-rational-arithmetic-adapter.mjs'], { input, encoding: 'utf8' });
    assert.notEqual(child.status, 0); assert.equal(child.stdout, '');
  }
});

test('portable browser ingress counts exact UTF-8 bytes without a Node Buffer', () => {
  const original = globalThis.Buffer;
  const samples = ['😀', 'é', '\\u0000', '𝄞'];
  const texts = samples.map(payload => JSON.stringify({ payload }));
  const sizes = texts.map(text => new TextEncoder().encode(text).length);
  try {
    globalThis.Buffer = undefined;
    for (let index = 0; index < texts.length; index++) {
      assert.equal(evaluateText(texts[index], { resourceLimits: { maxRequestBytes: sizes[index] - 1 } }).context.stage, 1);
      assert.equal(evaluateText(texts[index], { resourceLimits: { maxRequestBytes: sizes[index] } }).context.stage, 2);
      const value = { payload: samples[index] };
      assert.equal(evaluate(value, { resourceLimits: { maxRequestBytes: sizes[index] - 1 } }).context.stage, 1);
      assert.equal(evaluate(value, { resourceLimits: { maxRequestBytes: sizes[index] } }).context.stage, 2);
    }
  } finally { globalThis.Buffer = original; }
});
