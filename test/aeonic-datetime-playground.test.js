import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { DATETIME_EXAMPLES } from '../tools/playground/datetime-examples.mjs';
import { continueArithmetic, describeArithmeticInput, dateTimeDisplay, dateTimeFacts, validateArithmeticInput } from '../tools/playground/arithmetic-model.mjs';
import { evaluateArithmeticPlayground } from '../tools/playground/arithmetic-evaluator.mjs';
const example = id => DATETIME_EXAMPLES.find(e => e.id === id);
const run = request => evaluateArithmeticPlayground({ lane: 'datetime', requestText: JSON.stringify(request) });

test('date-time playground calls source APIs and reuses precise bundles with both histories', () => {
  for (const e of DATETIME_EXAMPLES) assert.equal(run(e.request).outcome, e.id === 'datetime-partial-output' ? 'diagnostic' : 'value', e.id);
  const shifted = run(example('datetime-month-shift').request).value, saved = structuredClone(shifted);
  const continuation = continueArithmetic(shifted, 'datetime', 'shift');
  assert.deepEqual(continuation.input.value, shifted);
  assert.equal(run(continuation).value.temporal.pieces.at(-1).end, '2024-04-29T09:31:00');
  assert.equal(run(continueArithmetic(shifted, 'datetime', 'step')).reason, 'incompatible_operand');
  assert.equal(run(continueArithmetic(shifted, 'datetime', 'materialize')).reason, 'unrepresentable_result');
  continuation.input.value.temporal.pieces[0].start = '2024-03-02T09:30:00'; assert.deepEqual(shifted, saved);
  const marked = run(example('datetime-history').request).value;
  const next = run(continueArithmetic(marked, 'datetime', 'shiftClock'));
  assert.equal(next.value.history.approximation, 'approximation-declared');
  assert.equal(next.value.temporal.pieces[0].at, '2023-01-31T09:30:00.4');
  assert.ok(dateTimeFacts(next).some(([k,v]) => k === 'approximation history' && v === 'approximation-declared'));
  assert.match(dateTimeDisplay(run(example('datetime-final-minute').request).value), /end of domain\)/);
  const symbol = run(example('datetime-open-boundary').request);
  assert.equal(dateTimeDisplay(symbol.value), '|disjoint|');
  assert.ok(dateTimeFacts(symbol).some(([k,v]) => k === 'Left clock origin' && v === 'minute'));
  assert.throws(() => continueArithmetic(symbol.value, 'datetime', 'shift'), TypeError);
  assert.throws(() => validateArithmeticInput({ lane: 'datetime', requestText: '{}', outputPolicyText: '{}' }), TypeError);
});

test('date-time descriptions follow current inputs without predicting results', () => {
  const r = structuredClone(example('datetime-clock-carry').request);
  assert.match(describeArithmeticInput('datetime', JSON.stringify(r)), /0\.2 civil-coordinate seconds/);
  r.input.amount.number.value = '-1.5';
  assert.match(describeArithmeticInput('datetime', JSON.stringify(r)), /-1\.5 civil-coordinate seconds/);
  for (const text of ['{"operation":"shift","operation":"equal"}', '['.repeat(33), ' '.repeat(262145)]) assert.match(describeArithmeticInput('datetime', text), /Review the request/);
});

test('date-time worker runs without Buffer and preserves endpoint inclusion', async t => {
  const url = new URL('../tools/playground/arithmetic-worker.mjs', import.meta.url).href;
  const worker = new Worker("const {parentPort}=require('node:worker_threads');globalThis.Buffer=undefined;globalThis.self={postMessage:x=>parentPort.postMessage(x)};import(" + JSON.stringify(url) + ").then(()=>parentPort.on('message',data=>self.onmessage({data}))).catch(e=>{throw e});", { eval: true });
  t.after(() => worker.terminate());
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Date-time worker timed out')), 8000);
    worker.once('error', e => { clearTimeout(timer); reject(e); }); worker.once('message', r => { clearTimeout(timer); resolve(r); });
    worker.postMessage({ lane: 'datetime', requestText: JSON.stringify(example('datetime-month-shift').request) });
  });
  assert.equal(response.status, 'completed');
  assert.equal(response.result.value.temporal.pieces.length, 29);
  assert.equal(response.result.value.temporal.pieces.at(-1).end, '2024-03-29T09:31:00');
  assert.equal(response.result.value.temporal.pieces.at(-1).includeEnd, false);
});
