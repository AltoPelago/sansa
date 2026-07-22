import { firstQueryExampleName, queryExampleGroups, queryExamples } from './examples.mjs';

const fixtureInput = document.querySelector('#fixtureInput');
const paramsInput = document.querySelector('#paramsInput');
const sourceLabel = document.querySelector('#sourceLabel');
const queryInput = document.querySelector('#queryInput');
const resultOutput = document.querySelector('#resultOutput');
const fixtureStatus = document.querySelector('#fixtureStatus');
const paramsStatus = document.querySelector('#paramsStatus');
const queryStatus = document.querySelector('#queryStatus');
const resultStatus = document.querySelector('#resultStatus');
const exampleSelect = document.querySelector('#exampleSelect');
const resetButton = document.querySelector('#resetButton');
const parseButton = document.querySelector('#parseButton');
const runButton = document.querySelector('#runButton');
const transformExtensionsInput = document.querySelector('#transformExtensions');

let defaultFixtureSource = '';
let defaultJsonSource = '';
let defaultAeonSource = '';
let defaultParamsSource = '';
let lastAction = 'evaluate';

await loadDefaultSources();
renderExampleSelect();
setExample(exampleSelect.value || firstQueryExampleName());
await runQuery();

exampleSelect.addEventListener('change', () => {
  setExample(exampleSelect.value);
  void runQuery();
});

resetButton.addEventListener('click', () => {
  fixtureInput.value = sourceKind() === 'json' ? defaultJsonSource : defaultAeonSource;
  paramsInput.value = defaultParamsSource;
  setExample(exampleSelect.value);
  fixtureStatus.textContent = sourceKind() === 'json' ? 'default json' : 'default aeon';
  paramsStatus.textContent = 'default params';
  void runQuery();
});

parseButton.addEventListener('click', () => {
  void parseOnly();
});
runButton.addEventListener('click', () => {
  void runQuery();
});
document.querySelectorAll('input[name="outputMode"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (lastAction === 'parse') {
      void parseOnly();
    } else {
      void runQuery();
    }
  });
});
document.querySelectorAll('input[name="queryPolicy"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (lastAction !== 'parse') void runQuery();
  });
});
transformExtensionsInput.addEventListener('change', () => {
  if (lastAction !== 'parse') void runQuery();
});
document.querySelectorAll('input[name="sourceKind"]').forEach((input) => {
  input.addEventListener('change', () => {
    fixtureInput.value = sourceKind() === 'json' ? defaultJsonSource : defaultAeonSource;
    sourceLabel.textContent = sourceKind() === 'json' ? 'Fixture JSON' : 'AEON Source';
    fixtureStatus.textContent = sourceKind() === 'json' ? 'default json' : 'default aeon';
    void runQuery();
  });
});

fixtureInput.addEventListener('input', () => {
  fixtureStatus.textContent = 'edited fixture';
});

paramsInput.addEventListener('input', () => {
  paramsStatus.textContent = paramsInput.value.trim().length === 0 ? 'not mounted' : 'edited params';
});

queryInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    runQuery();
  }
});

function setExample(name) {
  queryInput.value = queryExamples[name]?.query ?? queryExamples[firstQueryExampleName()]?.query ?? '';
  queryStatus.textContent = 'example loaded';
}

function renderExampleSelect() {
  exampleSelect.replaceChildren(...queryExampleGroups.map((group) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    optgroup.append(...group.examples.map((example) => {
      const option = document.createElement('option');
      option.value = example.name;
      option.textContent = example.label;
      return option;
    }));
    return optgroup;
  }));
  exampleSelect.value = firstQueryExampleName();
}

async function loadDefaultSources() {
  defaultAeonSource = await fetchText('/fixtures/query-inventory.aeon', [
    'inventory = {',
    '  items:list<object> = []',
    '}',
  ].join('\n'));
  defaultJsonSource = await fetchText('/fixtures/query-inventory.json', '{\n  "root": {\n    "address": "$",\n    "children": []\n  }\n}');
  defaultParamsSource = [
    'source:sansa = $.inventory.items.*',
    'field:sansa = ?.sku',
    'statusField:sansa = ?.status',
    'sortField:sansa = ?.qty',
    'name:string = "Adapter"',
  ].join('\n');
  defaultFixtureSource = defaultAeonSource;
  fixtureInput.value = defaultFixtureSource;
  paramsInput.value = defaultParamsSource;
  fixtureStatus.textContent = 'default aeon';
  paramsStatus.textContent = 'default params';
}

async function fetchText(path, fallback) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } catch (error) {
    fixtureStatus.textContent = 'source load failed';
    renderError('SANSA_QUERY_WORKBENCH_FIXTURE_LOAD', error.message);
    return fallback;
  }
}

async function parseOnly() {
  lastAction = 'parse';
  queryStatus.textContent = 'parsing';
  const payload = await queryApi({ action: 'parse', query: queryInput.value });
  queryStatus.textContent = payload.ok ? 'parse ok' : 'parse failed';
  resultStatus.textContent = payload.ok
    ? 'parse summary'
    : `${payload.errors.length} error${payload.errors.length === 1 ? '' : 's'}`;
  renderValue(formatPayloadOutput(payload));
}

async function runQuery() {
  lastAction = 'evaluate';
  queryStatus.textContent = 'running';
  const payload = await queryApi({
    action: 'evaluate',
    sourceKind: sourceKind(),
    source: fixtureInput.value,
    paramsSource: paramsInput.value,
    query: queryInput.value,
    policy: queryPolicy(),
    transformExtensions: transformExtensionsInput.checked,
  });
  queryStatus.textContent = payload.ok ? 'run ok' : 'run failed';
  resultStatus.textContent = payload.ok
    ? `${payload.count} result${payload.count === 1 ? '' : 's'}`
    : `${payload.errors.length} error${payload.errors.length === 1 ? '' : 's'}`;
  renderValue(formatPayloadOutput(payload));
}

async function queryApi(payload) {
  try {
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    return {
      ok: false,
      errors: [{ code: 'SANSA_QUERY_WORKBENCH_API_ERROR', message: error.message }],
    };
  }
}

function renderError(code, message) {
  renderValue({
    ok: false,
    errors: [{ code, message }],
  });
}

function renderValue(value) {
  resultOutput.textContent = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);
}

function formatPayloadText(payload) {
  if (typeof payload.text === 'string') return payload.text;
  if (Array.isArray(payload.errors)) return formatDiagnostics(payload.errors);
  return JSON.stringify(payload, null, 2);
}

function formatPayloadOutput(payload) {
  switch (formatOutputMode()) {
    case 'json':
      return payload;
    case 'inspect':
      return typeof payload.inspect === 'string' ? payload.inspect : formatPayloadText(payload);
    default:
      return formatPayloadText(payload);
  }
}

function formatDiagnostics(errors) {
  if (errors.length === 0) return '(no diagnostics)';
  return errors.map((error) => {
    const phase = typeof error.phase === 'string' ? ` [${error.phase}]` : '';
    const candidate = typeof error.candidateAddress === 'string' ? ` at ${error.candidateAddress}` : '';
    const location = Number.isInteger(error.index)
      ? ` index ${error.index}`
      : Number.isInteger(error.selectorIndex)
        ? ` selector ${error.selectorIndex}`
        : '';
    return `${error.code}${phase}${candidate}${location}: ${error.message}`;
  }).join('\n');
}

function formatOutputMode() {
  return document.querySelector('input[name="outputMode"]:checked')?.value ?? 'text';
}

function sourceKind() {
  return document.querySelector('input[name="sourceKind"]:checked')?.value ?? 'aeon';
}

function queryPolicy() {
  return document.querySelector('input[name="queryPolicy"]:checked')?.value ?? '';
}
