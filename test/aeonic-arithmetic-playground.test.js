import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { ARITHMETIC_EXAMPLES, ARITHMETIC_LIMITS, validateArithmeticInput, continueArithmetic } from '../tools/playground/arithmetic-model.mjs';
import { evaluateArithmeticPlayground } from '../tools/playground/arithmetic-evaluator.mjs';
const input = example => ({ lane: example.lane, requestText: JSON.stringify(example.request),
  ...(example.output ? { outputPolicyText: JSON.stringify(example.output) } : {}) });
const example = id => ARITHMETIC_EXAMPLES.find(item => item.id === id);

test('arithmetic playground examples execute the real source API and preserve outcomes/history', () => {
  assert.equal(ARITHMETIC_EXAMPLES.length, 11);
  for (const item of ARITHMETIC_EXAMPLES) {
    const result = evaluateArithmeticPlayground(input(item));
    if (['zero-divisor', 'unrepresentable'].includes(item.id)) {
      assert.equal(result.outcome, 'diagnostic'); assert.equal('value' in result, false);
      assert.equal(result.reason, item.id === 'zero-divisor' ? 'division_by_zero' : 'unrepresentable_result');
    } else assert.equal(result.outcome, 'value', item.id);
  }
  const result = evaluateArithmeticPlayground(input(example('combined-third')));
  assert.equal(result.value.number.value, '0.33'); assert.equal(result.value.history, 'approximation-declared');
  assert.deepEqual(result.metadata.steps.map(step => step.metadata.evaluation), ['exact-for-operands', 'rounded-for-operands', 'exact-for-operands']);
  assert.equal(evaluateArithmeticPlayground(input(example('finite-combined'))).value.number.value, '0.3');
});

test('returned exact and rounded bundles feed explicit continuations with their history', () => {
  const third = evaluateArithmeticPlayground(input(example('third'))).value;
  const multiplied = continueArithmetic(third, 'rational', 'multiply');
  assert.deepEqual(evaluateArithmeticPlayground({ lane: 'rational', requestText: JSON.stringify(multiplied) }).value.number,
    { category: 'exactNumber', coefficient: '1', exponent: '0' });
  multiplied.input.left.number.coefficient = '9'; assert.equal(third.number.coefficient, '1');
  const quantized = evaluateArithmeticPlayground({ lane: 'rational', requestText: JSON.stringify(continueArithmetic(third, 'rational', 'quantize')) }).value;
  const materialized = evaluateArithmeticPlayground({ lane: 'rational', requestText: JSON.stringify(continueArithmetic(quantized, 'rational', 'materialize')) });
  assert.equal(materialized.value.number.value, '0.33'); assert.equal(materialized.value.history, 'approximation-declared');
  assert.equal(materialized.metadata.evaluation, 'exact-for-operands');
  assert.throws(() => continueArithmetic(third, 'finite', 'quantize'), TypeError);
});

test('verbatim requests and token-preserving policies retain stage/no-value and closed configuration', () => {
  const base = input(example('third'));
  assert.equal(evaluateArithmeticPlayground({ ...base, requestText: '{"operation":"add","operation":"divide","input":{}}' }).context.stage, 2);
  const failed = evaluateArithmeticPlayground({ ...base, outputPolicyText: '{"family":"decimal"}' });
  assert.equal(failed.step, 'materialization'); assert.equal(failed.reason, 'unrepresentable_result'); assert.equal('value' in failed, false);
  for (const token of ['1e400', '-0', '1e-400', '1.0000000000000001']) {
    const result = evaluateArithmeticPlayground({ ...base, outputPolicyText: '{"family":"decimal","quantize":{"increment":{"category":"exactNumber","coefficient":' + token + ',"exponent":"0"},"rounding":"half-even"}}' });
    assert.equal(result.step, 'quantization'); assert.equal(result.reason, 'invalid_policy'); assert.equal('value' in result, false);
  }
  for (const text of ['{"family":"integer","family":"decimal"}', '{"family":"decimal"}} , "extra": {"request":{}}', '['.repeat(9) + '0' + ']'.repeat(9)]) {
    assert.throws(() => evaluateArithmeticPlayground({ ...base, outputPolicyText: text }));
  }
  assert.throws(() => evaluateArithmeticPlayground({ ...base, lane: ['rational'] }), TypeError);
  assert.throws(() => evaluateArithmeticPlayground({ ...base, resourceLimits: {} }), TypeError);
});

test('preparation rejects oversized text before byte iteration and counts UTF-8/total policy allowance', () => {
  const original = String.prototype[Symbol.iterator]; let yielded = 0;
  const counts = [];
  try {
    String.prototype[Symbol.iterator] = function* () { for (const character of original.call(this)) { yielded++; yield character; } };
    for (const size of [64, 128]) {
      yielded = 0;
      assert.throws(() => validateArithmeticInput({ lane: 'finite', requestText: 'é'.repeat(size) }, { requestBytes: 32, outputPolicyBytes: 16 }), RangeError);
      counts.push(yielded);
    }
  } finally { String.prototype[Symbol.iterator] = original; }
  assert.deepEqual(counts, [0, 0]);
  assert.doesNotThrow(() => validateArithmeticInput({ lane: 'finite', requestText: '😀'.repeat(4) }, { requestBytes: 16, outputPolicyBytes: 16 }));
  assert.throws(() => validateArithmeticInput({ lane: 'finite', requestText: '😀'.repeat(4) }, { requestBytes: 15, outputPolicyBytes: 16 }), RangeError);
  assert.throws(() => validateArithmeticInput({ lane: 'finite', requestText: 'x'.repeat(ARITHMETIC_LIMITS.requestBytes), outputPolicyText: '{}' }), RangeError);
});

test('browser worker entry returns actual source values and host errors without invented diagnostics', async t => {
  const url = new URL('../tools/playground/arithmetic-worker.mjs', import.meta.url).href;
  const worker = new Worker("const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:x=>parentPort.postMessage(x)};import(" + JSON.stringify(url) + ").then(()=>parentPort.on('message',data=>self.onmessage({data}))).catch(e=>{throw e});", { eval: true });
  t.after(() => worker.terminate());
  const send = data => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Worker fixture timed out')), 8000);
    worker.once('error', reject); worker.once('message', result => { clearTimeout(timer); resolve(result); }); worker.postMessage(data);
  });
  const value = await send(input(example('combined-third')));
  assert.equal(value.status, 'completed'); assert.equal(value.result.value.number.value, '0.33');
  const failure = await send({ ...input(example('third')), outputPolicyText: '{}' });
  assert.equal(failure.status, 'error'); assert.equal(failure.result, undefined);
});
