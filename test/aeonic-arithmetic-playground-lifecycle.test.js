import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as model from '../tools/playground/arithmetic-model.mjs';
import { evaluateArithmeticPlayground } from '../tools/playground/arithmetic-evaluator.mjs';

test('actual page controller terminates pending work on edit/cancel/timeout and ignores stale replies', () => {
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
  const nodes = new Map(), button = operation => { const item = new Element(); item.dataset.continue = operation; return item; };
  const continuations = ['multiply', 'quantize', 'materialize'].map(button);
  const workers = [], timers = new Map(); let nextTimer = 0;
  const document = {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); },
    createElement: () => new Element(), querySelector: () => continuations[1], querySelectorAll: () => continuations,
    addEventListener() {},
  };
  class PendingWorker {
    constructor() { this.terminated = 0; workers.push(this); }
    postMessage(value) { this.input = value; }
    terminate() { this.terminated++; }
  }
  let code = readFileSync(new URL('../tools/playground/arithmetic.mjs', import.meta.url), 'utf8');
  // Execute the production controller with a controlled DOM/worker clock. This
  // checks lifecycle callbacks, not a claim of browser scheduling or visual QA.
  code = code.slice(code.indexOf('const $ =')).replace('import.meta.url', JSON.stringify(new URL('../tools/playground/arithmetic.mjs', import.meta.url).href));
  vm.runInNewContext(code, { ...model, document, Worker: PendingWorker, URL, setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: id => timers.delete(id) });
  const node = id => document.getElementById(id);
  node('run').dispatch('click');
  const first = workers.at(-1); assert.equal(node('run').disabled, true); assert.equal(node('cancel').hidden, false);
  const result = evaluateArithmeticPlayground(first.input);
  first.onmessage({ data: { status: 'completed', result } });
  assert.equal(first.terminated, 1); assert.equal(node('continue').hidden, false); assert.equal(timers.size, 0);
  node('request').dispatch('input'); assert.equal(node('continue').hidden, true);
  first.onmessage({ data: { status: 'completed', result } });
  assert.equal(node('result').textContent, ''); assert.equal(node('raw-result').hidden, true);
  node('run').dispatch('click'); const cancelled = workers.at(-1);
  node('cancel').dispatch('click');
  assert.equal(cancelled.terminated, 1); assert.equal(node('run-state').textContent, 'Cancelled');
  assert.equal(node('continue').hidden, true); assert.equal(timers.size, 0);
  cancelled.onmessage({ data: { status: 'completed', result } }); assert.equal(node('continue').hidden, true);
  node('run').dispatch('click'); const timedOut = workers.at(-1); const timeout = [...timers.values()][0]; timeout();
  assert.equal(timedOut.terminated, 1); assert.match(node('result-state').textContent, /exceeded 4 seconds/);
  assert.equal(node('run').disabled, false); assert.equal(node('cancel').hidden, true); assert.equal(node('continue').hidden, true);
  node('run').dispatch('click'); const edited = workers.at(-1); node('output-policy').dispatch('input');
  assert.equal(edited.terminated, 1); assert.equal(timers.size, 0);
  const longKey = 'x'.repeat(2000);
  node('request').value = JSON.stringify({ ...JSON.parse(node('request').value), [longKey]: 0 });
  node('run').dispatch('click'); const diagnostic = workers.at(-1);
  diagnostic.onmessage({ data: { status: 'completed', result: evaluateArithmeticPlayground(diagnostic.input) } });
  assert.ok(node('result').textContent.length < 700, 'Diagnostic preview must not lay out a long input key in full');
  assert.ok(node('response').textContent.includes(longKey), 'Complete response retains the original diagnostic path');
  assert.equal(node('continue').hidden, true);
});
