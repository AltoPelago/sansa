import { ARITHMETIC_LANES, ARITHMETIC_EXAMPLES, ARITHMETIC_LIMITS,
  validateArithmeticInput, continueArithmetic, arithmeticDisplay } from './arithmetic-model.mjs';
const $ = id => document.getElementById(id);
const state = { worker: null, timer: null, value: null };
const element = (tag, text) => { const item = document.createElement(tag); item.textContent = text; return item; };
function stop() {
  if (state.worker) state.worker.terminate();
  state.worker = null; clearTimeout(state.timer); state.timer = null;
  $('run').disabled = false; $('cancel').hidden = true;
}
function clear(message = 'Inputs changed. Run the operation again.') {
  stop(); state.value = null; $('continue').hidden = true; $('raw-result').hidden = true;
  $('response').textContent = ''; $('result').replaceChildren(); $('result-state').textContent = message;
}
function controls() {
  $('output-editor').hidden = $('result-mode').value !== 'combined';
  $('profile').textContent = ARITHMETIC_LANES[$('lane').value].profile;
  document.querySelector('[data-continue="quantize"]').hidden = $('lane').value !== 'rational';
}
function load(example) {
  clear('Run an operation to see its value or diagnostic.');
  $('lane').value = example.lane; $('description').textContent = example.detail;
  $('request').value = JSON.stringify(example.request, null, 2);
  $('result-mode').value = example.output ? 'combined' : 'exact';
  $('output-policy').value = JSON.stringify(example.output ?? { family: 'decimal' }, null, 2);
  $('examples').replaceChildren(...ARITHMETIC_EXAMPLES.filter(item => item.lane === example.lane).map(item => {
    const button = element('button', item.title); button.type = 'button'; button.className = 'example';
    button.setAttribute('aria-pressed', String(item.id === example.id)); button.addEventListener('click', () => load(item)); return button;
  }));
  controls(); $('run-state').textContent = 'Ready';
}
function facts(rows) {
  const list = document.createElement('dl');
  for (const [name, value] of rows) {
    const text = String(value);
    list.append(element('dt', name), element('dd', text.length > 300 ? text.slice(0, 300) + '…' : text));
  }
  return list;
}
function render(result) {
  const box = $('result');
  if (result.outcome === 'diagnostic') {
    const reason = element('p', result.reason); reason.className = 'number'; box.append(reason, element('p', 'Diagnostic · no value produced'));
    box.append(facts([...(result.step ? [['Failed step', result.step]] : []), ['Stage', String(result.context.stage)], ['Path', result.context.path ?? 'Operation root']]));
    return;
  }
  state.value = result.value;
  const display = arithmeticDisplay(result.value.number), number = element('p', display.length > 300 ? display.slice(0, 300) + '…' : display);
  number.className = 'number'; box.append(number);
  const kind = element('p', { finiteNumber: 'Materialized AEON Number', exactNumber: 'Exact derived decimal', exactRational: 'Exact derived rational · no fraction literal' }[result.value.number.category]); kind.className = 'kind'; box.append(kind);
  const steps = result.metadata.steps;
  box.append(facts([...(steps ? steps.map(step => [step.step, step.metadata.evaluation]) : [['Current operation', result.metadata.evaluation]]), ['Approximation history', result.value.history]]));
  const details = document.createElement('details'); details.append(element('summary', steps ? 'Step policies & evaluation' : 'Effective policy'), element('pre', JSON.stringify(steps ?? result.metadata.effectivePolicy, null, 2))); box.append(details);
  $('continue').hidden = false;
}
function run() {
  clear('Running the selected source API…'); $('run-state').textContent = 'Running…';
  const input = { lane: $('lane').value, requestText: $('request').value,
    ...($('result-mode').value === 'combined' ? { outputPolicyText: $('output-policy').value } : {}) };
  try {
    validateArithmeticInput(input);
    const worker = new Worker(new URL('./arithmetic-worker.mjs', import.meta.url), { type: 'module' });
    state.worker = worker; $('run').disabled = true; $('cancel').hidden = false;
    const failed = message => { if (state.worker !== worker) return; clear(message); $('run-state').textContent = 'Playground error'; };
    worker.onerror = event => { event.preventDefault(); failed('Worker could not complete: ' + event.message); };
    worker.onmessage = ({ data }) => {
      if (state.worker !== worker) return;
      if (data.status !== 'completed') { failed(data.error); return; }
      stop(); render(data.result); $('result-state').textContent = 'Completed · result comes directly from the SANSA source API.';
      $('run-state').textContent = 'Completed'; $('response').textContent = JSON.stringify(data.result, null, 2); $('raw-result').hidden = false;
    };
    state.timer = setTimeout(() => failed('Playground execution exceeded 4 seconds. No value retained.'), ARITHMETIC_LIMITS.timeoutMs);
    worker.postMessage(input);
  } catch (error) { clear(error instanceof Error ? error.message : String(error)); $('run-state').textContent = 'Playground input error'; }
}
for (const id of ['request', 'output-policy', 'result-mode']) $(id).addEventListener('input', () => { clear(); controls(); $('run-state').textContent = 'Ready · inputs changed'; });
$('lane').addEventListener('change', () => load(ARITHMETIC_EXAMPLES.find(item => item.lane === $('lane').value)));
$('run').addEventListener('click', run);
$('cancel').addEventListener('click', () => { clear('Cancelled. No value retained.'); $('run-state').textContent = 'Cancelled'; });
for (const button of document.querySelectorAll('[data-continue]')) button.addEventListener('click', () => {
  if (!state.value) return;
  const request = continueArithmetic(state.value, $('lane').value, button.dataset.continue);
  clear('Continuation prepared. Review its explicit policy, then run.'); $('request').value = JSON.stringify(request, null, 2);
  $('result-mode').value = 'exact'; controls(); $('run-state').textContent = 'Ready · using returned bundle'; $('request').focus();
});
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (!state.worker) run(); } });
load(ARITHMETIC_EXAMPLES.find(item => item.id === 'third'));
