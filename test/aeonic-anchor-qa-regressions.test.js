import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Worker } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import * as model from '../tools/playground/arithmetic-model.mjs';
import { evaluateAeonicCivilAnchor, evaluateAeonicCivilAnchorText } from '@altopelago/sansa';
const profile = 'aeonic.operations.temporal.civil-anchor.v1';
const request = () => ({ operation: 'anchor', input: {
  anchor: { temporal: { category: 'civilDate', value: '2024-02-28' } },
  clock: { temporal: { category: 'civilClock', value: '09:30:00' } }, context: { profile },
} });

test('trusted anchoring capabilities reject sparse lists in both public APIs', () => {
  const inherited = Array(1); Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), { 0: 'anchoring' }));
  for (const capabilities of [Array(1), ['anchoring', ,], [, 'anchoring'], inherited, [], ['anchoring', 'anchoring'], [undefined], ['other']]) {
    assert.throws(() => evaluateAeonicCivilAnchor(request(), { capabilities }), TypeError);
    assert.throws(() => evaluateAeonicCivilAnchorText(JSON.stringify(request()), { capabilities }), TypeError);
  }
  assert.equal(evaluateAeonicCivilAnchor(request(), { capabilities: ['anchoring'] }).outcome, 'value');
  assert.equal(evaluateAeonicCivilAnchorText(JSON.stringify(request()), { capabilities: ['anchoring'] }).outcome, 'value');
});

test('long zero-prefix fractions have bounded runtime and retain exact coordinates', () => {
  // Interpreted regex execution exposes suffix rescanning instead of relying on
  // JIT optimizations. This bounds the complete public API path, not a helper.
  const script = `
    import assert from 'node:assert/strict';
    import { evaluateAeonicCivilAnchor as native, evaluateAeonicCivilAnchorText as text } from '@altopelago/sansa';
    const fraction = '0'.repeat(65536) + '1';
    const limits = { maxRequestBytes: 262144, maxTemporalCharacters: 65550, maxFractionDigits: 65540 };
    const request = clock => ({ operation: 'anchor', input: { anchor: { temporal: { category: 'civilDate', value: '2024-02-28' } }, clock, context: { profile: '${profile}' } } });
    const authored = { temporal: { category: 'civilClock', value: '09:30:00.' + fraction } };
    for (const evaluate of [q => native(q, { resourceLimits: limits }), q => text(JSON.stringify(q), { resourceLimits: limits })]) {
      assert.equal(evaluate(request(authored)).value.temporal.pieces[0].at, '2024-02-28T09:30:00.' + fraction);
      assert.equal(evaluate(request({ temporal: { category: 'civilClock', value: '09:30:00.' + fraction + '000' } })).value.temporal.pieces[0].at, '2024-02-28T09:30:00.' + fraction);
      const derived = { temporal: { category: 'civilClockSet', pieces: [{ kind: 'point', at: { day: '0', time: '09:30:00.' + fraction } }] }, originClockForm: 'second', history: 'none-declared' };
      assert.equal(evaluate(request(derived)).value.temporal.pieces[0].at, '2024-02-28T09:30:00.' + fraction);
      derived.temporal.pieces[0].at.time += '0';
      assert.equal(evaluate(request(derived)).reason, 'invalid_operand');
    }
    console.log('exact fractions preserved');
  `;
  const result = spawnSync(process.execPath, ['--regexp-interpret-all', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  assert.match(result.stdout, /exact fractions preserved/);
});

test('actual continuation clicks keep all320 intervals within receiving APIs', { timeout: 15000 }, async t => {
  class Element {
    constructor() { this.value = ''; this.hidden = false; this.disabled = false; this.children = []; this.listeners = {}; this.dataset = {}; this.text = ''; }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    append(...children) { this.children.push(...children); }
    setAttribute() {}
    addEventListener(type, callback) { this.listeners[type] = callback; }
    dispatch(type) { this.listeners[type]?.({ preventDefault() {} }); }
    focus() {}
  }
  const nodes = new Map(), workers = [], continuations = ['shift', 'shiftClock', 'step', 'materialize'].map(operation => Object.assign(new Element(), { dataset: { continue: operation } }));
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }, createElement: () => new Element(), querySelectorAll: () => continuations, addEventListener() {} };
  const workerUrl = new URL('../tools/playground/arithmetic-worker.mjs', import.meta.url).href;
  class BrowserWorker {
    constructor() {
      workers.push(this);
      this.thread = new Worker("const {parentPort}=require('node:worker_threads');globalThis.Buffer=undefined;globalThis.self={postMessage:x=>parentPort.postMessage(x)};import(" + JSON.stringify(workerUrl) + ").then(()=>parentPort.on('message',data=>self.onmessage({data})));", { eval: true });
      this.finished = new Promise((resolve, reject) => {
        this.thread.once('error', reject);
        this.thread.once('message', data => { this.response = data; this.onmessage?.({ data }); resolve(data); });
      });
    }
    postMessage(input) { this.input = input; this.thread.postMessage(input); }
    terminate() { return this.thread.terminate(); }
  }
  t.after(() => Promise.all(workers.map(worker => worker.terminate())));
  let code = readFileSync(new URL('../tools/playground/arithmetic.mjs', import.meta.url), 'utf8');
  code = code.slice(code.indexOf('const $ =')).replace('import.meta.url', JSON.stringify(new URL('../tools/playground/arithmetic.mjs', import.meta.url).href));
  vm.runInNewContext(code, { ...model, document, Worker: BrowserWorker, URL, setTimeout, clearTimeout });
  const node = id => document.getElementById(id);
  const time = n => '00:' + String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const pieces = Array.from({ length: 320 }, (_, i) => ({ kind: 'interval', start: { day: '0', time: time(2 * i) }, end: { day: '0', time: time(2 * i + 1) }, includeStart: true, includeEnd: false }));
  node('lane').value = 'clock'; node('lane').dispatch('change');
  node('request').value = JSON.stringify({ operation: 'shiftClock', input: { value: { temporal: { category: 'civilClockSet', pieces }, originClockForm: 'second', history: 'approximation-declared' }, amount: { number: { category: 'finiteNumber', value: '0' } }, context: { profile: 'aeonic.operations.temporal.civil-clock.v1' } } });
  node('request').dispatch('input');
  const run = async () => { node('run').dispatch('click'); const response = await workers.at(-1).finished; assert.equal(response.status, 'completed'); assert.equal(response.result.outcome, 'value', JSON.stringify(response.result)); return response.result.value; };
  assert.equal((await run()).temporal.pieces.length, 320);
  for (const [button, lane] of [['anchor-result', 'anchor'], ['datetime-result', 'datetime']]) {
    node(button).dispatch('click'); assert.equal(node('lane').value, lane);
    assert.ok(Buffer.byteLength(node('request').value) <= 65536, lane + ' prepared text must fit');
    const value = await run(); assert.equal(value.temporal.pieces.length, 320);
    const suffix = lane === 'datetime' ? '.2' : '';
    assert.deepEqual(value.temporal.pieces, pieces.map(piece => ({ ...piece, start: '2024-02-28T' + piece.start.time + suffix, end: '2024-02-28T' + piece.end.time + suffix })));
    assert.equal(value.originClockForm, 'second'); assert.equal(value.history.approximation, 'approximation-declared');
    assert.equal(value.temporal.pieces[0].includeStart, true); assert.equal(value.temporal.pieces[0].includeEnd, false);

  }
});
