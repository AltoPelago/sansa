import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { CLOCK_EXAMPLES } from '../tools/playground/clock-examples.mjs';
import { continueArithmetic, describeArithmeticInput, clockDisplay, clockFacts, validateArithmeticInput } from '../tools/playground/arithmetic-model.mjs';
import { evaluateArithmeticPlayground } from '../tools/playground/arithmetic-evaluator.mjs';
const example = id => CLOCK_EXAMPLES.find(e => e.id === id);
const run = request => evaluateArithmeticPlayground({ lane: 'clock', requestText: JSON.stringify(request) });

test('clock playground reuses exact relative days, gaps and approximation history', () => {
  for (const e of CLOCK_EXAMPLES) assert.equal(run(e.request).outcome, e.id === 'clock-output-carry' ? 'diagnostic' : 'value', e.id);
  const first = run(example('clock-midnight').request).value, saved = structuredClone(first);
  assert.match(clockDisplay(first), /day \+1 · 01:30:00/);
  const continuation = continueArithmetic(first, 'clock', 'shiftClock');
  assert.deepEqual(continuation.input.value, first);
  continuation.input.amount.number.value = '-7200';
  assert.deepEqual(run(continuation).value.temporal.pieces[0].at, { day: '0', time: '23:30:00' });
  continuation.input.value.temporal.pieces[0].at.day = '2'; assert.deepEqual(first, saved);
  assert.equal(run(continueArithmetic(first, 'clock', 'materialize')).reason, 'unrepresentable_result');
  const minute = run(example('clock-minute').request).value;
  assert.equal(minute.temporal.pieces[0].includeEnd, false);
  assert.match(clockDisplay(minute), /day \+1 · 00:00:00.5\)/);
  assert.equal(run(continueArithmetic(minute, 'clock', 'step')).reason, 'incompatible_operand');
  const marked = run(example('clock-history').request).value;
  assert.equal(run(continueArithmetic(marked, 'clock', 'shiftClock')).value.history, 'approximation-declared');
  assert.ok(clockFacts({ outcome: 'value', value: marked }).some(([k, v]) => k === 'Approximation history' && v === 'approximation-declared'));
  const symbol = run(example('clock-day-equality').request);
  assert.equal(clockDisplay(symbol.value), '|notEqual|');
  assert.equal(clockFacts(symbol).length, 4);
  assert.throws(() => continueArithmetic(symbol.value, 'clock', 'shiftClock'), TypeError);
  assert.throws(() => continueArithmetic(first, 'clock', 'shift'), TypeError);
  assert.throws(() => validateArithmeticInput({ lane: 'clock', requestText: '{}', outputPolicyText: '{}' }), TypeError);
});

test('clock descriptions track current inputs and explicit selectors', () => {
  const r = structuredClone(example('clock-midnight').request);
  assert.match(describeArithmeticInput('clock', JSON.stringify(r)), /7200 civil-coordinate seconds/);
  r.input.amount.number.value = '-7200';
  assert.match(describeArithmeticInput('clock', JSON.stringify(r)), /-7200 civil-coordinate seconds/);
  assert.match(describeArithmeticInput('clock', JSON.stringify(example('clock-step').request)), /1 complete hour/);
  assert.match(describeArithmeticInput('clock', JSON.stringify(example('clock-last-hour').request)), /day-zero hour/);
  for (const text of ['{"operation":"step","operation":"equal"}', '['.repeat(33), ' '.repeat(262145)]) assert.match(describeArithmeticInput('clock', text), /Review the request/);
});

test('clock worker runs without Buffer and retains cross-midnight endpoint inclusion', async t => {
  const url = new URL('../tools/playground/arithmetic-worker.mjs', import.meta.url).href;
  const worker = new Worker("const {parentPort}=require('node:worker_threads');globalThis.Buffer=undefined;globalThis.self={postMessage:x=>parentPort.postMessage(x)};import(" + JSON.stringify(url) + ").then(()=>parentPort.on('message',data=>self.onmessage({data}))).catch(e=>{throw e});", { eval: true });
  t.after(() => worker.terminate());
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Clock worker timed out')), 8000);
    worker.once('error', e => { clearTimeout(timer); reject(e); }); worker.once('message', r => { clearTimeout(timer); resolve(r); });
    worker.postMessage({ lane: 'clock', requestText: JSON.stringify(example('clock-minute').request) });
  });
  assert.equal(response.status, 'completed');
  assert.deepEqual(response.result.value.temporal.pieces[0].end, { day: '1', time: '00:00:00.5' });
  assert.equal(response.result.value.temporal.pieces[0].includeEnd, false);
});
