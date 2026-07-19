const examples = {
  skuFilter: [
    'from $.inventory.items.*',
    'where contains(.sku, "B")',
    'select .sku',
  ].join('\n'),
  itemAttributes: [
    'from $.inventory.items.*',
    'where .@.lane == "primary"',
    'select { sku = .sku lane = .@.lane }',
  ].join('\n'),
  fieldAttributes: [
    'from $.inventory.items.*',
    'where .sku.@.origin == "catalog"',
    'select { sku = .sku origin = .sku.@.origin }',
  ].join('\n'),
  directExpansion: [
    'from $.inventory.items',
    'select .*',
  ].join('\n'),
  descendantStrings: [
    'from $',
    'select $.inventory.items.**#string',
  ].join('\n'),
  descendantNumbers: [
    'from $',
    'select $.inventory.items.**%number',
  ].join('\n'),
  namePattern: [
    'from $.inventory.items.*',
    'select .("s*")',
  ].join('\n'),
  adminRoles: [
    'from $.inventory.items.*',
    'where any(.roles.* == "admin")',
    'select { sku = .sku name = .name }',
  ].join('\n'),
  emptyRoles: [
    'from $.inventory.items.*',
    'where exists(.roles) and absent(.roles.*)',
    'select { sku = .sku name = .name }',
  ].join('\n'),
  numericIdGuard: [
    'from $.inventory.items.*',
    'where exists(.id#number) and .id > 2',
    'select { sku = .sku name = .name }',
  ].join('\n'),
  nullReason: [
    'from $.inventory.items.*',
    'where exists(.status) and isNullReason(.status, "notSet")',
    'select { sku = .sku name = .name }',
  ].join('\n'),
  numericSpecials: [
    'from $.inventory.items.*',
    'where (exists(.metric) and isNaN(.metric)) or (exists(.ceiling) and isInfinity(.ceiling))',
    'select { sku = .sku name = .name }',
  ].join('\n'),
  inactiveOrder: [
    'from $.inventory.items.*',
    'where .active == false',
    'order by .qty desc, .sku asc',
    'select { sku = .sku qty = .qty }',
  ].join('\n'),
  parseProjection: [
    'from $.inventory.items.*',
    'where .qty >= 2',
    'select { sku = .sku active = .active }',
  ].join('\n'),
  diagnosticWhere: [
    'from $.inventory.items.*',
    'where .sku',
    'select .sku',
  ].join('\n'),
};

const fixtureInput = document.querySelector('#fixtureInput');
const sourceLabel = document.querySelector('#sourceLabel');
const queryInput = document.querySelector('#queryInput');
const resultOutput = document.querySelector('#resultOutput');
const fixtureStatus = document.querySelector('#fixtureStatus');
const queryStatus = document.querySelector('#queryStatus');
const resultStatus = document.querySelector('#resultStatus');
const exampleSelect = document.querySelector('#exampleSelect');
const resetButton = document.querySelector('#resetButton');
const parseButton = document.querySelector('#parseButton');
const runButton = document.querySelector('#runButton');

let defaultFixtureSource = '';
let defaultJsonSource = '';
let defaultAeonSource = '';
let lastAction = 'evaluate';

await loadDefaultSources();
setExample(exampleSelect.value);
await runQuery();

exampleSelect.addEventListener('change', () => {
  setExample(exampleSelect.value);
  void runQuery();
});

resetButton.addEventListener('click', () => {
  fixtureInput.value = sourceKind() === 'json' ? defaultJsonSource : defaultAeonSource;
  setExample(exampleSelect.value);
  fixtureStatus.textContent = sourceKind() === 'json' ? 'default json' : 'default aeon';
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

queryInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    runQuery();
  }
});

function setExample(name) {
  queryInput.value = examples[name] ?? examples.skuFilter;
  queryStatus.textContent = 'example loaded';
}

async function loadDefaultSources() {
  defaultAeonSource = await fetchText('/fixtures/query-inventory.aeon', [
    'inventory = {',
    '  items:list<object> = []',
    '}',
  ].join('\n'));
  defaultJsonSource = await fetchText('/fixtures/query-inventory.json', '{\n  "root": {\n    "address": "$",\n    "children": []\n  }\n}');
  defaultFixtureSource = defaultAeonSource;
  fixtureInput.value = defaultFixtureSource;
  fixtureStatus.textContent = 'default aeon';
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
  renderValue(formatOutputMode() === 'json' ? payload : formatPayloadText(payload));
}

async function runQuery() {
  lastAction = 'evaluate';
  queryStatus.textContent = 'running';
  const payload = await queryApi({
    action: 'evaluate',
    sourceKind: sourceKind(),
    source: fixtureInput.value,
    query: queryInput.value,
  });
  queryStatus.textContent = payload.ok ? 'run ok' : 'run failed';
  resultStatus.textContent = payload.ok
    ? `${payload.count} result${payload.count === 1 ? '' : 's'}`
    : `${payload.errors.length} error${payload.errors.length === 1 ? '' : 's'}`;
  renderValue(formatOutputMode() === 'json' ? payload : formatPayloadText(payload));
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
