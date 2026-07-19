import { evaluateQuery, parseQuery } from '../../src/index.js';

const examples = {
  skuFilter: [
    'from $.inventory.items.*',
    'where contains(.sku, "B")',
    'select .sku',
  ].join('\n'),
  adminRoles: [
    'from $.inventory.items.*',
    'where any(.roles.* == "admin")',
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
};

const fixtureInput = document.querySelector('#fixtureInput');
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
let lastAction = 'evaluate';

await loadDefaultFixture();
setExample(exampleSelect.value);
runQuery();

exampleSelect.addEventListener('change', () => {
  setExample(exampleSelect.value);
  runQuery();
});

resetButton.addEventListener('click', () => {
  fixtureInput.value = defaultFixtureSource;
  setExample(exampleSelect.value);
  runQuery();
});

parseButton.addEventListener('click', parseOnly);
runButton.addEventListener('click', runQuery);
document.querySelectorAll('input[name="outputMode"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (lastAction === 'parse') {
      parseOnly();
    } else {
      runQuery();
    }
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

async function loadDefaultFixture() {
  try {
    const response = await fetch('/fixtures/query-inventory.json');
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const fixture = await response.json();
    defaultFixtureSource = JSON.stringify(fixture, null, 2);
    fixtureInput.value = defaultFixtureSource;
    fixtureStatus.textContent = 'default fixture';
  } catch (error) {
    defaultFixtureSource = '{\n  "root": {\n    "address": "$",\n    "children": []\n  }\n}';
    fixtureInput.value = defaultFixtureSource;
    fixtureStatus.textContent = 'fixture load failed';
    renderError('SANSA_QUERY_WORKBENCH_FIXTURE_LOAD', error.message);
  }
}

function parseOnly() {
  lastAction = 'parse';
  const query = parseQuery(queryInput.value);
  queryStatus.textContent = query.ok ? 'parse ok' : 'parse failed';
  if (!query.ok) {
    resultStatus.textContent = `${query.errors.length} error${query.errors.length === 1 ? '' : 's'}`;
    renderDiagnostics(query.errors);
    return;
  }

  resultStatus.textContent = 'parse summary';
  renderValue(formatOutputMode() === 'json'
    ? {
      ok: true,
      mode: 'parse',
      query: summarizeQuery(query.query),
    }
    : query.query.canonical);
}

function runQuery() {
  lastAction = 'evaluate';
  const fixture = readFixture();
  if (!fixture.ok) {
    queryStatus.textContent = 'blocked';
    resultStatus.textContent = 'fixture error';
    renderError('SANSA_QUERY_WORKBENCH_INVALID_FIXTURE', fixture.error);
    return;
  }

  const result = evaluateQuery(queryInput.value, buildNamespace(fixture.value));
  queryStatus.textContent = result.ok ? 'run ok' : 'run failed';

  if (!result.ok) {
    resultStatus.textContent = `${result.errors.length} error${result.errors.length === 1 ? '' : 's'}`;
    renderDiagnostics(result.errors);
    return;
  }

  resultStatus.textContent = `${result.results.length} result${result.results.length === 1 ? '' : 's'}`;
  renderValue(formatOutputMode() === 'json'
    ? {
      ok: true,
      mode: 'evaluate',
      count: result.results.length,
      results: result.results.map((entry) => ({
        binding: summarizeBinding(entry.binding),
        value: summarizeQueryValue(entry.value),
      })),
    }
    : renderTextResults(result.results));
}

function readFixture() {
  try {
    return { ok: true, value: JSON.parse(fixtureInput.value) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function buildNamespace(fixture) {
  const root = fixture.root ?? fixture;
  return {
    root,
    children: (binding) => binding.children ?? [],
    attributeSpace: (binding) => binding.attributeSpace ?? binding.attributes,
    localSpace: (binding, name) => binding.localSpaces?.[name],
  };
}

function renderTextResults(results) {
  if (results.length === 0) return '(no results)';
  return results.flatMap((entry) => renderQueryValueLines(entry.value, entry.binding)).join('\n');
}

function renderQueryValueLines(value, sourceBinding) {
  switch (value.type) {
    case 'scalar':
    case 'object':
      return [`${sourceBinding.address ?? '<binding>'} = ${JSON.stringify(value.value)}`];
    case 'bindingSet':
      if (value.bindings.length === 0) return [`${sourceBinding.address ?? '<binding>'} -> (empty)`];
      return value.bindings.map((binding) => {
        const scalar = scalarFromBinding(binding);
        return scalar.ok
          ? `${binding.address ?? '<binding>'} = ${JSON.stringify(scalar.value)}`
          : `${binding.address ?? '<binding>'}`;
      });
    default:
      return [`${sourceBinding.address ?? '<binding>'} = ${JSON.stringify(value)}`];
  }
}

function renderDiagnostics(errors) {
  renderValue({
    ok: false,
    errors: errors.map((error) => ({
      code: error.code,
      message: error.message,
      ...(Number.isInteger(error.index) ? { index: error.index } : {}),
      ...(Number.isInteger(error.selectorIndex) ? { selectorIndex: error.selectorIndex } : {}),
    })),
  });
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

function formatOutputMode() {
  return document.querySelector('input[name="outputMode"]:checked')?.value ?? 'text';
}

function summarizeQuery(query) {
  return {
    canonical: query.canonical,
    clauses: query.clauses,
    from: query.from.address.canonical,
    ...(query.where ? { where: query.where.expression } : {}),
    ...(query.orderBy ? {
      orderBy: query.orderBy.keys.map((key) => ({
        expression: key.expression,
        direction: key.direction,
      })),
    } : {}),
    ...(query.offset ? { offset: query.offset.value } : {}),
    ...(query.limit ? { limit: query.limit.value } : {}),
    select: query.select.expression,
  };
}

function summarizeQueryValue(value) {
  switch (value.type) {
    case 'bindingSet':
      return {
        type: value.type,
        bindings: value.bindings.map(summarizeBinding),
      };
    case 'scalar':
    case 'object':
      return value;
    default:
      return value;
  }
}

function summarizeBinding(binding) {
  const scalar = scalarFromBinding(binding);
  return {
    ...(binding.address === undefined ? {} : { address: binding.address }),
    ...(binding.name === undefined ? {} : { name: binding.name }),
    ...(binding.index === undefined ? {} : { index: binding.index }),
    ...(binding.semanticType === undefined ? {} : { semanticType: binding.semanticType }),
    ...(binding.representationKind === undefined ? {} : { representationKind: binding.representationKind }),
    ...(scalar.ok ? { value: scalar.value } : {}),
  };
}

function scalarFromBinding(binding) {
  if (Object.hasOwn(binding, 'value')) return { ok: true, value: binding.value };
  if (Object.hasOwn(binding, 'scalar')) return { ok: true, value: binding.scalar };
  return { ok: false };
}
