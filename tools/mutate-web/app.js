const sourceInput = document.querySelector('#sourceInput');
const sourceResultOutput = document.querySelector('#sourceResultOutput');
const requestInput = document.querySelector('#requestInput');
const resultOutput = document.querySelector('#resultOutput');
const sourceStatus = document.querySelector('#sourceStatus');
const requestStatus = document.querySelector('#requestStatus');
const resultStatus = document.querySelector('#resultStatus');
const exampleSelect = document.querySelector('#exampleSelect');
const resetButton = document.querySelector('#resetButton');
const planButton = document.querySelector('#planButton');
const applyButton = document.querySelector('#applyButton');
const requireAtomicInput = document.querySelector('#requireAtomic');
const recheckPreconditionsInput = document.querySelector('#recheckPreconditions');
const maxOperationsInput = document.querySelector('#maxOperations');
const maxPreconditionsInput = document.querySelector('#maxPreconditions');
const maxPositionIndexInput = document.querySelector('#maxPositionIndex');
const optionInputs = Array.from(document.querySelectorAll('.budget-row input'));
const sourceTabButtons = Array.from(document.querySelectorAll('[data-source-tab]'));

const examples = [
  {
    id: 'replace-sku',
    label: 'Replace SKU',
    request: {
      operations: [
        { op: 'replace', target: '$.inventory.items[0].sku', value: 'A-101' },
      ],
      preconditions: [
        { expression: '$.inventory.items[0].sku == "A-100"' },
      ],
      provenance: { source: 'mutate-workbench' },
    },
  },
  {
    id: 'create-status',
    label: 'Create Status',
    request: {
      op: 'create',
      parent: '$.inventory.items[0]',
      name: 'status',
      value: 'active',
    },
  },
  {
    id: 'insert-item',
    label: 'Insert Item',
    request: {
      op: 'insert',
      container: '$.inventory.items',
      placement: { kind: 'before', anchor: '$.inventory.items[1]' },
      value: {
        sku: 'B-150',
        name: 'Brace',
        qty: 4,
        category: 'hardware',
      },
    },
  },
  {
    id: 'move-item',
    label: 'Move Item',
    request: {
      op: 'move',
      source: '$.inventory.items[0]',
      container: '$.inventory.items',
      placement: 'last',
    },
  },
  {
    id: 'budget-fail',
    label: 'Budget Failure',
    options: { maxOperations: 1 },
    request: [
      { op: 'replace', target: '$.inventory.items[0].qty', value: 9 },
      { op: 'replace', target: '$.inventory.items[1].qty', value: 2 },
    ],
  },
  {
    id: 'capability-fail',
    label: 'Precondition Failure',
    request: {
      operations: [
        { op: 'replace', target: '$.inventory.items[0].sku', value: 'A-101' },
      ],
      preconditions: [
        { expression: '$.inventory.items[0].sku == "Z-999"' },
      ],
    },
  },
];

let defaultSource = '';
let lastPayload = null;
let activeSourceTab = 'input';

await loadDefaults();
renderExamples();
setExample(examples[0].id);
await runMutation('plan');

exampleSelect.addEventListener('change', () => {
  setExample(exampleSelect.value);
  void runMutation('plan');
});

resetButton.addEventListener('click', () => {
  sourceInput.value = defaultSource;
  sourceStatus.textContent = 'default aeon';
  setExample(exampleSelect.value);
  void runMutation('plan');
});

planButton.addEventListener('click', () => {
  void runMutation('plan');
});

applyButton.addEventListener('click', () => {
  void runMutation('apply');
});

document.querySelectorAll('input[name="outputMode"]').forEach((input) => {
  input.addEventListener('change', () => {
    renderPayload(lastPayload);
  });
});

for (const button of sourceTabButtons) {
  button.addEventListener('click', () => {
    activeSourceTab = button.dataset.sourceTab;
    renderSourcePanel();
  });
}

sourceInput.addEventListener('input', () => {
  sourceStatus.textContent = 'edited source';
  sourceResultOutput.textContent = 'Run Plan or Apply to render the current source result.';
});

requestInput.addEventListener('input', () => {
  requestStatus.textContent = 'edited request';
});

requestInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    void runMutation('plan');
  }
});

async function loadDefaults() {
  defaultSource = await fetchText('/fixtures/query-inventory.aeon', [
    'inventory = {',
    '  items:list<object> = [',
    '    { sku:string = "A-100" name:string = "Adapter" qty:int = 7 }',
    '    { sku:string = "B-200" name:string = "Bolt" qty:int = 3 }',
    '  ]',
    '}',
  ].join('\n'));
  sourceInput.value = defaultSource;
  sourceStatus.textContent = 'default aeon';
}

function renderExamples() {
  exampleSelect.replaceChildren(...examples.map((example) => {
    const option = document.createElement('option');
    option.value = example.id;
    option.textContent = example.label;
    return option;
  }));
}

function setExample(id) {
  const example = examples.find((entry) => entry.id === id) ?? examples[0];
  exampleSelect.value = example.id;
  requestInput.value = JSON.stringify(example.request, null, 2);
  requestStatus.textContent = 'example loaded';
  maxOperationsInput.value = example.options?.maxOperations ?? '';
  maxPreconditionsInput.value = example.options?.maxPreconditions ?? '';
  maxPositionIndexInput.value = example.options?.maxPositionIndex ?? '';
}

async function runMutation(mode) {
  resultStatus.textContent = mode === 'apply' ? 'applying' : 'planning';
  const payload = await mutateApi({
    source: sourceInput.value,
    requestSource: requestInput.value,
    mode,
    options: mutateOptions(),
  });
  lastPayload = payload;
  resultStatus.textContent = payload.ok
    ? mode === 'apply' ? 'apply ok' : 'plan ok'
    : `${payload.errors?.length ?? 0} error${payload.errors?.length === 1 ? '' : 's'}`;
  renderSourceResult(payload);
  renderPayload(payload);
}

async function mutateApi(payload) {
  try {
    const response = await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await response.json();
  } catch (error) {
    return {
      ok: false,
      text: `${error.name}: ${error.message}`,
      errors: [{ code: 'SANSA_MUTATE_WORKBENCH_API_ERROR', message: error.message }],
    };
  }
}

function renderPayload(payload) {
  if (!payload) {
    resultOutput.textContent = '';
    return;
  }
  switch (outputMode()) {
    case 'json':
      resultOutput.textContent = JSON.stringify(payload, null, 2);
      break;
    default:
      resultOutput.textContent = payload.text ?? JSON.stringify(payload, null, 2);
      break;
  }
}

function renderSourcePanel() {
  for (const button of sourceTabButtons) {
    const selected = button.dataset.sourceTab === activeSourceTab;
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
  sourceInput.classList.toggle('hidden', activeSourceTab !== 'input');
  sourceResultOutput.classList.toggle('hidden', activeSourceTab !== 'result');
}

function renderSourceResult(payload) {
  sourceResultOutput.textContent = payload?.source
    ?? 'Run Plan or Apply to render the current source result.';
}

function mutateOptions() {
  const options = {
    requireAtomic: requireAtomicInput.checked,
    recheckPreconditions: recheckPreconditionsInput.checked,
  };
  for (const input of optionInputs) {
    const value = input.value.trim();
    if (value.length === 0) continue;
    const number = Number(value);
    if (Number.isSafeInteger(number) && number >= 0) options[input.id] = number;
  }
  return options;
}

function outputMode() {
  return document.querySelector('input[name="outputMode"]:checked')?.value ?? 'text';
}

async function fetchText(path, fallback) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } catch (error) {
    resultOutput.textContent = `SANSA_MUTATE_WORKBENCH_FIXTURE_LOAD: ${error.message}`;
    return fallback;
  }
}
