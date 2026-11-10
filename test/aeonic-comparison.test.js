import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  evaluateAeonicComparison as evaluate,
  evaluateAeonicComparisonText as evaluateText,
  evaluateValueSemanticsOperation as legacy,
  AEONIC_COMPARISON_CODEPOINT_PROFILE as CODEPOINT,
} from '../src/index.js';

const operand = (category, value) => ({ category, value });
const request = (left, right, operation = 'compare') => ({ operation, input: { left, right } });
const number = value => operand('finiteNumber', value);
const symbol = value => operand('symbol', value);
const declaration = { mode: 'declared-order', declaration: { order: [symbol('low'), symbol('high')] } };

test('Aeonic compares exact authored numbers without changing the historical API', () => {
  const logical = request(number('1.0'), number('1e0'), 'equal');
  const before = structuredClone(logical);
  assert.deepEqual(evaluate(logical).value, symbol('equal'));
  assert.deepEqual(logical, before);
  assert.equal(legacy('equal', logical.input).value, true);
  assert.equal(evaluate(request(number('9007199254740992'), number('9007199254740993'))).value.value, 'less');
  assert.equal(evaluate(request(number('-0'), number('0.0'))).value.value, 'equal');
});

test('Aeonic Boolean and symbol ordering coexist with historical minimum-profile rejection', () => {
  for (const logical of [request(operand('boolean', false), operand('boolean', true)), request(symbol('A'), symbol('a'))]) {
    assert.deepEqual(evaluate(logical).value, symbol('less'));
    assert.equal(legacy('compare', logical.input).reason, 'not_orderable');
  }
  const mismatch = evaluate(request(symbol('1'), operand('string', '1'), 'equal'));
  assert.deepEqual(mismatch, { outcome: 'diagnostic', reason: 'incompatible_comparison', context: { stage: 5, path: '/input' } });
  assert.ok(!Object.hasOwn(mismatch, 'value'));
});

test('the Aeonic boundary rejects descriptor coercions before they reach comparison', () => {
  for (const left of [number(1), operand('boolean', 'false'), { category: 'string' }, symbol(''), operand('string', '\uD800')]) {
    const result = evaluate(request(left, number('1')));
    assert.deepEqual(result, { outcome: 'diagnostic', reason: 'invalid_operand', context: { stage: 4, path: '/input/left/value' } });
    assert.ok(!Object.hasOwn(result, 'value'));
  }
});

test('declared-order shape validation precedes capability rejection and cannot be enabled', () => {
  const logical = request(symbol('low'), symbol('high'));
  logical.input.policy = { symbols: declaration };
  assert.deepEqual(evaluate(logical), { outcome: 'diagnostic', reason: 'unsupported_profile', context: { stage: 3, path: '/input/policy/symbols/mode' } });
  logical.input.policy.symbols = { mode: 'declared-order', declaration: { order: [] } };
  assert.equal(evaluate(logical).reason, 'invalid_policy');
  assert.throws(() => evaluate(logical, { declaredOrder: true }), TypeError);
});

test('operation policy replaces an unavailable context selection without mutating caller metadata', () => {
  const logical = request(symbol('low'), symbol('high'));
  logical.input.context = { symbols: declaration };
  logical.input.policy = { symbols: { mode: 'string-profile', profile: CODEPOINT } };
  const before = structuredClone(logical);
  const result = evaluate(logical);
  assert.equal(result.value.value, 'greater');
  assert.equal(result.metadata.effectivePolicy.symbols.profile, CODEPOINT);
  result.metadata.effectivePolicy.symbols.profile = 'edited';
  assert.deepEqual(logical, before);
  assert.equal(evaluate(logical).metadata.effectivePolicy.symbols.profile, CODEPOINT);
});

test('JSON ingress rejects duplicate decoded keys and admits UTF-8 bytes before dispatch', () => {
  const logical = request(number('1'), number('2'));
  const duplicate = JSON.stringify(logical).replace('"operation":"compare"', '"operation":"equal","\\u006fperation":"compare"');
  assert.deepEqual(evaluateText(duplicate), { outcome: 'diagnostic', reason: 'invalid_operand', context: { stage: 2, path: null } });
  assert.equal(evaluateText('{').reason, 'invalid_operand');
  const text = JSON.stringify(request(operand('string', 'é'), operand('string', 'é')));
  assert.equal(evaluateText(text, { resourceLimits: { maxRequestBytes: new TextEncoder().encode(text).length - 1 } }).reason, 'resource_limit');
  assert.throws(() => evaluate(logical, { resourceLimits: { maxNumericCharacters: true } }), TypeError);
  assert.throws(() => evaluate(logical, { resourceLimits: null }), TypeError);
});

test('deep structured CTS requests reach resource admission without a serializer stack failure', () => {
  const nested = '['.repeat(10000) + '0' + ']'.repeat(10000);
  const input = '{"lane":"aeonic-operations","case_id":"deep","fixture":{"request":{"operation":"compare","input":{"left":{"category":"container","value":' + nested + '},"right":{"category":"finiteNumber","value":"1"}}}},"policy":{}}';
  const completed = spawnSync(process.execPath, ['scripts/cts-aeonic-comparison-adapter.mjs'], { input, encoding: 'utf8' });
  assert.equal(completed.status, 0, completed.stderr);
  const result = JSON.parse(completed.stdout).result;
  assert.deepEqual(result, { outcome: 'diagnostic', reason: 'resource_limit', context: { stage: 1, path: null } });
  assert.ok(!Object.hasOwn(result, 'value'));
});
