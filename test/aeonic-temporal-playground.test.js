import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { TEMPORAL_EXAMPLES } from '../tools/playground/temporal-examples.mjs';
import { continueArithmetic, describeArithmeticInput, temporalDisplay, validateArithmeticInput } from '../tools/playground/arithmetic-model.mjs';
import { evaluateArithmeticPlayground } from '../tools/playground/arithmetic-evaluator.mjs';
const example = id => TEMPORAL_EXAMPLES.find(item => item.id === id);
const run = request => evaluateArithmeticPlayground({ lane: 'temporal', requestText: JSON.stringify(request) });

test('all civil-date playground examples call SANSA and exact continuations preserve metadata', () => {
  assert.equal(TEMPORAL_EXAMPLES.length, 12);
  for (const e of TEMPORAL_EXAMPLES) {
    const result = run(e.request);
    assert.equal(result.outcome, e.id === 'date-partial-output' ? 'diagnostic' : 'value', e.id);
  }
  const shifted = run(example('date-month-shift').request).value;
  const snapshot = structuredClone(shifted);
  const continuation = continueArithmetic(shifted, 'temporal', 'shift');
  assert.deepEqual(continuation.input.value, shifted);
  assert.deepEqual(run(continuation).value.temporal.ranges, [{ start: '2024-04-01', end: '2024-04-29' }]);
  assert.equal(run(continueArithmetic(shifted, 'temporal', 'step')).reason, 'incompatible_operand');
  assert.equal(run(continueArithmetic(shifted, 'temporal', 'materialize')).reason, 'unrepresentable_result');
  continuation.input.value.temporal.ranges[0].start = '2024-03-02'; assert.deepEqual(shifted, snapshot);
  const clamped = run(example('date-clamping').request).value;
  assert.equal(run(continueArithmetic(clamped, 'temporal', 'shift')).value.history, 'clamping-declared');
  const symbol = run(example('date-containment').request).value;
  assert.equal(temporalDisplay(symbol), '|contains|');
  assert.throws(() => continueArithmetic(symbol, 'temporal', 'shift'), TypeError);
  assert.throws(() => validateArithmeticInput({ lane: 'temporal', requestText: '{}', outputPolicyText: '{}' }), TypeError);
});

test('live temporal descriptions follow inputs and reject misleading malformed previews', () => {
  const r = structuredClone(example('date-containment').request);
  r.input.right.temporal.value = '2024-02-29';
  assert.match(describeArithmeticInput('temporal', JSON.stringify(r)), /2024-02-29/);
  r.operation = 'compare'; assert.match(describeArithmeticInput('temporal', JSON.stringify(r)), /^compare:/);
  assert.match(describeArithmeticInput('temporal', '{"operation":"shift","operation":"equal"}'), /Review the request/);
  assert.match(describeArithmeticInput('temporal', '['.repeat(33)), /Review the request/);
  assert.match(describeArithmeticInput('temporal', ' '.repeat(262145)), /Review the request/);
});

test('browser worker runs temporal APIs with no Node Buffer global', async t => {
  const url = new URL('../tools/playground/arithmetic-worker.mjs', import.meta.url).href;
  const worker = new Worker("const {parentPort}=require('node:worker_threads');globalThis.Buffer=undefined;globalThis.self={postMessage:x=>parentPort.postMessage(x)};import(" + JSON.stringify(url) + ").then(()=>parentPort.on('message',data=>self.onmessage({data}))).catch(e=>{throw e});", { eval: true });
  t.after(() => worker.terminate());
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Temporal worker timed out')), 8000);
    worker.once('error', reject); worker.once('message', r => { clearTimeout(timer); resolve(r); });
    worker.postMessage({ lane: 'temporal', requestText: JSON.stringify(example('date-month-shift').request) });
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.result.value.temporal.ranges, [{ start: '2024-03-01', end: '2024-03-29' }]);
});
