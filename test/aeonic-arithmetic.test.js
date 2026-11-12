import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAeonicArithmetic as evaluate, evaluateAeonicArithmeticText as text, evaluateAeonicArithmeticStructuredJson as structured } from '../src/aeonic-arithmetic.js';

const n = (value, history) => ({ number: { category: 'finiteNumber', value }, ...(history ? { history } : {}) });
const req = (operation, left, right) => ({ operation, input: { left, right } });
test('public root exports support arithmetic without Node Buffer', async () => {
  const api = await import('../src/index.js');
  const original = globalThis.Buffer;
  let result;
  try {
    globalThis.Buffer = undefined;
    result = api.evaluateAeonicArithmeticText(JSON.stringify(req('add', n('0.1'), n('0.2'))));
  } finally { globalThis.Buffer = original; }
  assert.equal(result.value.number.coefficient, '3');
  assert.equal(result.value.number.exponent, '-1');
  assert.ok(Object.isFrozen(api.AEONIC_ARITHMETIC_DEFAULT_RESOURCE_LIMITS));
});
test('UTF-8 ingress uses bytes and counts only through a rejected allowance', () => {
  const request = req('add', { number: { category: 'container', payload: 'é😀' } }, n('1'));
  const source = JSON.stringify(request), length = Buffer.byteLength(source);
  assert.deepEqual(structured(request, { resourceLimits: { maxRequestBytes: length } }), text(source));
  assert.equal(structured(request, { resourceLimits: { maxRequestBytes: length - 1 } }).reason, 'resource_limit');
  assert.equal(text(source, { resourceLimits: { maxRequestBytes: length - 1 } }).reason, 'resource_limit');
  const large = 'x'.repeat(100000), original = String.prototype[Symbol.iterator];
  let visits = 0, result;
  try {
    String.prototype[Symbol.iterator] = function* () {
      const tracked = this.valueOf() === large;
      for (const character of original.call(this)) { if (tracked) visits++; yield character; }
    };
    result = text(large, { resourceLimits: { maxRequestBytes: 1 } });
  } finally { String.prototype[Symbol.iterator] = original; }
  assert.equal(result.reason, 'resource_limit');
  assert.equal(visits, 2);
});
test('chaining preserves exact value and declared history through cancellation and materialization', () => {
  const a = evaluate(req('multiply', n('0.33', 'approximation-declared'), n('3'))).value;
  const b = evaluate(req('subtract', a, n('0.99'))).value;
  assert.deepEqual(b, { number: { category: 'exactNumber', coefficient: '0', exponent: '0' }, history: 'approximation-declared' });
  const result = evaluate({ operation: 'materialize', input: { value: b, policy: { family: 'exponent', zeroSign: 'negative' } } });
  assert.equal(result.value.number.value, '-0e0');
  assert.equal(result.value.history, 'approximation-declared');
});
test('compact exponent result is independent of output-size allowance', () => {
  const value = evaluate(req('multiply', n('1e1000000'), n('1'))).value;
  const integer = evaluate({ operation: 'materialize', input: { value, policy: { family: 'integer' } } });
  assert.equal(integer.reason, 'resource_limit'); assert.ok(!Object.hasOwn(integer, 'value'));
  const exponent = evaluate({ operation: 'materialize', input: { value, policy: { family: 'exponent' } } });
  assert.equal(exponent.value.number.value, '1e1000000');
});
test('strict text ingress and admission precedence', () => {
  assert.equal(text('{"operation":"add","operation":"multiply","input":{}}').reason, 'invalid_operand');
  assert.equal(text('NaN').reason, 'invalid_operand');
  assert.equal(text('invalid', { resourceLimits: { maxRequestBytes: 0 } }).reason, 'resource_limit');
  const request = req('add', n('1'), n('2'));
  assert.deepEqual(structured(request), text(JSON.stringify(request)));
});
test('numeric character guard is scalar-counted even for malformed text', () => {
  assert.equal(evaluate(req('add', n('😀'), n('1')), { resourceLimits: { maxNumericCharacters: 1 } }).reason, 'invalid_operand');
});
test('native graph admission memoizes shared containers and rejects cycles', () => {
  let reads = 0, payload = {};
  for (let i = 0; i < 24; i++) {
    const child = payload;
    payload = { get a() { reads++; return child; }, get b() { reads++; return child; } };
  }
  const request = req('add', { number: { category: 'container', payload } }, n('1'));
  assert.equal(evaluate(request).reason, 'unsupported_domain'); assert.equal(reads, 48);
  payload.a.a.loop = payload;
  assert.equal(evaluate(request).reason, 'invalid_operand');
});
test('completed shared nodes are rechecked at a deeper path', () => {
  const shared = { nested: {} }; let deep = shared;
  for (let i = 0; i < 29; i++) deep = { child: deep };
  const request = req('add', { number: { category: 'container', deep, shared } }, n('1'));
  assert.equal(evaluate(request).reason, 'resource_limit');
});
test('structured ingress stops shared-graph expansion at the byte budget', () => {
  let reads = 0, payload = {};
  for (let i = 0; i < 24; i++) {
    const child = payload;
    payload = { get a() { reads++; return child; }, get b() { reads++; return child; } };
  }
  const result = structured(req('add', { number: { category: 'container', payload } }, n('1')),
    { resourceLimits: { maxRequestBytes: 256 } });
  assert.equal(result.reason, 'resource_limit'); assert.equal(result.context.stage, 1);
  assert.ok(reads < 500, 'serialization must stop before expanding the entire graph');
});
test('structured array traversal is lazy under a small byte allowance', () => {
  let reads = 0;
  const payload = new Proxy(new Array(100000), { get(target, key, receiver) {
    if (typeof key === 'string' && /^[0-9]+$/u.test(key)) { reads++; return null; }
    return Reflect.get(target, key, receiver);
  } });
  const result = structured(req('add', { number: { category: 'container', payload } }, n('1')),
    { resourceLimits: { maxRequestBytes: 256 } });
  assert.equal(result.reason, 'resource_limit'); assert.ok(reads < 100);
});
test('populated structured arrays stop admission at the byte allowance', () => {
  for (const size of [1000, 100000]) {
    let reads = 0;
    const payload = new Proxy(new Array(size).fill(null), { get(target, key, receiver) {
      if (typeof key === 'string' && /^[0-9]+$/u.test(key)) reads++;
      return Reflect.get(target, key, receiver);
    } });
    const result = structured(req('add', { number: { category: 'container', payload } }, n('1')),
      { resourceLimits: { maxRequestBytes: 256 } });
    assert.deepEqual(result, { outcome: 'diagnostic', reason: 'resource_limit', context: { stage: 1, path: null } });
    assert.ok(reads < 100, `${size} populated entries required ${reads} reads`);
  }
});
test('structured serialization checks cycles, depth and shared aliases incrementally', () => {
  const payload = {}; payload.self = payload;
  assert.equal(structured(req('add', { number: { category: 'container', payload } }, n('1'))).reason, 'invalid_operand');
  assert.equal(structured(payload, { resourceLimits: { maxRequestDepth: 1 } }).reason, 'resource_limit');
  const shared = { nested: {} }, request = req('add', { number: { category: 'container', a: shared, b: shared } }, n('1'));
  assert.deepEqual(structured(request), text(JSON.stringify(request)));
  const bytes = Buffer.byteLength(JSON.stringify(request));
  assert.deepEqual(structured(request, { resourceLimits: { maxRequestBytes: bytes } }), text(JSON.stringify(request)));
  assert.equal(structured(request, { resourceLimits: { maxRequestBytes: bytes - 1 } }).reason, 'resource_limit');
  let deep = shared;
  for (let i = 0; i < 29; i++) deep = { child: deep };
  const aliases = req('add', { number: { category: 'container', shared, deep } }, n('1'));
  assert.equal(structured(aliases).reason, 'resource_limit');
});
test('numeric character admission stops without copying the rejected string', () => {
  const source = '1'.repeat(100000), original = String.prototype[Symbol.iterator];
  let reads = 0;
  try {
    String.prototype[Symbol.iterator] = function* () {
      const tracked = this.valueOf() === source;
      for (const character of original.call(this)) { if (tracked) reads++; yield character; }
    };
    const result = evaluate(req('add', n(source), n('1')), { resourceLimits: { maxNumericCharacters: 1 } });
    assert.deepEqual(result, { outcome: 'diagnostic', reason: 'resource_limit', context: { stage: 4, path: '/input/left/number/value' } });
    assert.equal(reads, 2);
  } finally { String.prototype[Symbol.iterator] = original; }
  const derived = { number: { category: 'exactNumber', coefficient: '12', exponent: '12' }, history: 'none-declared' };
  assert.equal(evaluate(req('add', derived, n('1')), { resourceLimits: { maxNumericCharacters: 3 } }).context.path, '/input/left/number/exponent');
  assert.equal(evaluate(req('add', n('😀x'), n('1')), { resourceLimits: { maxNumericCharacters: 1 } }).reason, 'resource_limit');
});
test('required derived history precedes unknown bundle fields', () => {
  const left = { number: { category: 'exactNumber', coefficient: '1', exponent: '0' }, extra: 0 };
  assert.equal(evaluate(req('add', left, n('1'))).context.path, '/input/left/history');
});
test('all policy shapes precede configuration field values', () => {
  const a = req('add', n('1'), n('2')); a.input.context = { profile: 0 }; a.input.policy = null;
  assert.equal(evaluate(a).context.path, '/input/policy');
  const b = { operation: 'materialize', input: { value: n('1'), context: { profile: 0 }, policy: {} } };
  assert.equal(evaluate(b).context.path, '/input/policy/family');
});
test('trusted settings reject null, booleans and misspellings', () => {
  for (const resourceLimits of [null, [], 1, { maxCoefficientDigits: true }, { maxCoeffDigits: 10 }]) {
    assert.throws(() => evaluate(req('add', n('1'), n('2')), { resourceLimits }), TypeError);
  }
});
test('source descriptors are not mutated or rewritten by arithmetic', () => {
  const a = n('-0.0'); Object.freeze(a.number); Object.freeze(a);
  const b = n('1.00'); Object.freeze(b.number); Object.freeze(b);
  assert.equal(evaluate(req('add', a, b)).value.number.coefficient, '1');
  assert.equal(a.number.value, '-0.0'); assert.equal(b.number.value, '1.00');
});
