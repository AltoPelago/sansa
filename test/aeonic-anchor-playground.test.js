import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { ANCHOR_EXAMPLES } from '../tools/playground/anchor-examples.mjs';
import { prepareAnchoring, continueAnchoredDateTime, describeArithmeticInput, dateTimeFacts, validateArithmeticInput } from '../tools/playground/arithmetic-model.mjs';
import { evaluateArithmeticPlayground } from '../tools/playground/arithmetic-evaluator.mjs';
import { evaluateAeonicCivilClock, evaluateAeonicTemporal } from '@altopelago/sansa';
const run = (request, lane = 'anchor') => evaluateArithmeticPlayground({ lane, requestText: JSON.stringify(request) });
test('anchoring examples and cross-lane continuations preserve full dates, clocks and independent histories', () => {
  for (const e of ANCHOR_EXAMPLES) assert.equal(run(e.request).outcome, ['anchor-month', 'anchor-outside'].includes(e.id) ? 'diagnostic' : 'value', e.id);
  const clock = evaluateAeonicCivilClock({ operation: 'shiftClock', input: { value: { temporal: { category: 'civilClock', value: '23:30:00' } }, amount: { number: { category: 'finiteNumber', value: '7200' }, history: 'approximation-declared' }, context: { profile: 'aeonic.operations.temporal.civil-clock.v1' } } }).value;
  const saved = structuredClone(clock), prepared = prepareAnchoring(clock);
  assert.equal(prepared.input.context.profile, 'aeonic.operations.temporal.civil-anchor.v1');
  assert.deepEqual(prepared.input.clock, clock);
  const result = run(prepared);
  assert.equal(result.value.temporal.pieces[0].at, '2024-02-29T01:30:00');
  assert.equal(result.value.history.approximation, 'approximation-declared');
  const continuation = continueAnchoredDateTime(result.value);
  assert.equal(continuation.input.context.profile, 'aeonic.operations.temporal.civil-datetime.v1');
  assert.equal(run(continuation, 'datetime').value.temporal.pieces[0].at, '2024-02-29T01:30:00.2');
  prepared.input.clock.temporal.pieces[0].at.day = '4'; assert.deepEqual(clock, saved);
  const date = evaluateAeonicTemporal({ operation: 'shift', input: { value: { temporal: { category: 'civilDate', value: '2023-01-31' } }, policy: { unit: 'month', count: '1' }, context: { profile: 'aeonic.operations.temporal.civil-date.v1' } } }).value;
  const dated = run(prepareAnchoring(date));
  assert.equal(dated.value.history.clamping, 'clamping-declared');
  assert.ok(dateTimeFacts(dated).some(([key, value]) => key === 'clamping history' && value === 'clamping-declared'));
  for (const bad of [{ category: 'symbol', value: 'equal' }, { outcome: 'diagnostic' }]) {
    assert.throws(() => prepareAnchoring(bad), TypeError); assert.throws(() => continueAnchoredDateTime(bad), TypeError);
  }
  assert.throws(() => validateArithmeticInput({ lane: 'anchor', requestText: '{}', outputPolicyText: '{}' }), TypeError);
  const request = structuredClone(ANCHOR_EXAMPLES[0].request);
  assert.match(describeArithmeticInput('anchor', JSON.stringify(request)), /2024-02-28/);
  request.input.anchor.temporal.value = '2025-01-01';
  assert.match(describeArithmeticInput('anchor', JSON.stringify(request)), /2025-01-01/);
});
test('real browser worker executes anchoring without Buffer and retains excluded upper boundary', async t => {
  const url = new URL('../tools/playground/arithmetic-worker.mjs', import.meta.url).href;
  const worker = new Worker("const {parentPort}=require('node:worker_threads');globalThis.Buffer=undefined;globalThis.self={postMessage:x=>parentPort.postMessage(x)};import(" + JSON.stringify(url) + ").then(()=>parentPort.on('message',data=>self.onmessage({data}))).catch(e=>{throw e});", { eval: true });
  t.after(() => worker.terminate());
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Anchoring worker timed out')), 8000);
    worker.once('error', e => { clearTimeout(timer); reject(e); }); worker.once('message', r => { clearTimeout(timer); resolve(r); });
    worker.postMessage({ lane: 'anchor', requestText: JSON.stringify(ANCHOR_EXAMPLES.find(e => e.id === 'anchor-upper').request) });
  });
  assert.equal(response.status, 'completed'); assert.deepEqual(response.result.value.temporal.pieces[0].end, { boundary: 'endOfDomain' });
});
