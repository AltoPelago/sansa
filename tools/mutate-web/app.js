import { defaultPolicy, firstMutateExampleId, mutateExampleGroups, mutateExamples as examples } from './examples.mjs';
const sourceInput = document.querySelector('#sourceInput');
const sourceKindInput = document.querySelector('#sourceKind');
const sourceResultOutput = document.querySelector('#sourceResultOutput');
const requestInput = document.querySelector('#requestInput');
const requestInputLabel = document.querySelector('#requestInputLabel');
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
const enforcePolicyInput = document.querySelector('#enforcePolicy');
const targetFormatInput = document.querySelector('#targetFormat');
const policyInput = document.querySelector('#policyInput');
const policyStatus = document.querySelector('#policyStatus');
const policyTabButton = document.querySelector('#detailTabPolicy');
const maxOperationsInput = document.querySelector('#maxOperations');
const maxPreconditionsInput = document.querySelector('#maxPreconditions');
const maxValueNodesInput = document.querySelector('#maxValueNodes');
const maxValueDepthInput = document.querySelector('#maxValueDepth');
const maxStringLengthInput = document.querySelector('#maxStringLength');
const maxPositionIndexInput = document.querySelector('#maxPositionIndex');
const optionInputs = Array.from(document.querySelectorAll('.budget-row input'));
const sourceTabButtons = Array.from(document.querySelectorAll('[data-source-tab]'));
const detailTabButtons = Array.from(document.querySelectorAll('[data-detail-tab]'));
const requestKindInputs = Array.from(document.querySelectorAll('input[name="requestKind"]'));

const defaultSources = { aeon: '', telex: '' };
let lastPayload = null;
let activeSourceTab = 'input';
let activeDetailTab = 'diagnostics';

await loadDefaults();
renderExamples();
policyInput.value = JSON.stringify(defaultPolicy, null, 2);
renderPolicyControls();
renderDetailPanel();
setExample(firstMutateExampleId());
await runMutation('plan');

exampleSelect.addEventListener('change', () => {
  setExample(exampleSelect.value);
  void runMutation('plan');
});

resetButton.addEventListener('click', () => {
  sourceInput.value = defaultSources[sourceKind()];
  sourceStatus.textContent = `default ${sourceKind()}`;
  setExample(exampleSelect.value);
  void runMutation('plan');
});

sourceKindInput.addEventListener('change', () => {
  sourceInput.value = defaultSources[sourceKind()];
  targetFormatInput.value = sourceKind();
  sourceStatus.textContent = `default ${sourceKind()}`;
  sourceResultOutput.textContent = 'Run Plan or Apply to render the current source result.';
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

targetFormatInput.addEventListener('change', () => {
  void runMutation('plan');
});

for (const input of requestKindInputs) {
  input.addEventListener('change', () => {
    setExampleVariant(currentExample(), input.value);
    void runMutation('plan');
  });
}

enforcePolicyInput.addEventListener('change', () => {
  activeDetailTab = enforcePolicyInput.checked ? 'policy' : 'diagnostics';
  renderPolicyControls();
  renderDetailPanel();
  void runMutation('plan');
});

policyInput.addEventListener('input', () => {
  policyStatus.textContent = enforcePolicyInput.checked ? 'edited policy' : 'disabled';
});

for (const button of sourceTabButtons) {
  button.addEventListener('click', () => {
    activeSourceTab = button.dataset.sourceTab;
    renderSourcePanel();
  });
}

for (const button of detailTabButtons) {
  button.addEventListener('click', () => {
    activeDetailTab = button.dataset.detailTab;
    renderDetailPanel();
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
  defaultSources.aeon = await fetchText('/fixtures/query-inventory.aeon', [
    'inventory = {',
    '  items:list<object> = [',
    '    { sku:string = "A-100" name:string = "Adapter" qty:int = 1 }',
    '    { sku:string = "B-200" name:string = "Bolt" qty:int = 3 }',
    '  ]',
    '}',
  ].join('\n'));
  defaultSources.telex = await fetchText('/fixtures/query-inventory.telex.aes', [
    'telex.aes=1',
    '',
    'path=$.inventory',
    'kind=ObjectNode',
  ].join('\n'));
  sourceInput.value = defaultSources.aeon;
  sourceStatus.textContent = 'default aeon';
}

function renderExamples() {
  exampleSelect.replaceChildren(...mutateExampleGroups.map(({ label, examples: groupExamples }) => {
    const group = document.createElement('optgroup');
    group.label = label;
    group.replaceChildren(...groupExamples.map((example) => {
      const option = document.createElement('option');
      option.value = example.id;
      option.textContent = example.label;
      return option;
    }));
    return group;
  }));
}

function setExample(id) {
  const example = examples.find((entry) => entry.id === id) ?? examples[0];
  exampleSelect.value = example.id;
  const kind = requestKindForExample(example, requestKind());
  setExampleVariant(example, kind);
}

function setExampleVariant(example, kind) {
  if (!example) return;
  const selectedKind = requestKindForExample(example, kind);
  const variant = example.variants[selectedKind];
  updateRequestKindAvailability(example);
  setRequestKind(selectedKind);
  requestInput.value = selectedKind === 'instruction'
    ? variant.request
    : JSON.stringify(variant.request, null, 2);
  requestStatus.textContent = exampleVariantStatus(example);
  setOptionInputs(variant.options ?? {});
}

async function runMutation(mode) {
  resultStatus.textContent = mode === 'apply' ? 'applying' : 'planning';
  resultStatus.dataset.phase = mode === 'apply' ? 'apply' : 'plan';
  const payload = await mutateApi({
    sourceKind: sourceKind(),
    source: sourceInput.value,
    requestSource: requestInput.value,
    requestKind: requestKind(),
    mode,
    options: mutateOptions(),
  });
  lastPayload = payload;
  const status = mutationStatus(payload, mode);
  resultStatus.textContent = status.label;
  resultStatus.dataset.phase = status.phase;
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

function mutationStatus(payload, requestedMode) {
  if (payload?.ok) {
    const phase = requestedMode === 'apply' ? 'apply' : 'plan';
    return { phase, label: `${phase} ok` };
  }
  const phase = payload?.phase ?? payload?.errors?.[0]?.phase ?? 'error';
  const count = payload?.errors?.length ?? 0;
  const suffix = count > 1 ? ` ${count}` : '';
  return { phase, label: `${phase} error${suffix}` };
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

function renderDetailPanel() {
  if (!enforcePolicyInput.checked && activeDetailTab === 'policy') {
    activeDetailTab = 'diagnostics';
  }
  for (const button of detailTabButtons) {
    const tab = button.dataset.detailTab;
    const selected = tab === activeDetailTab;
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
  resultOutput.classList.toggle('hidden', activeDetailTab !== 'diagnostics');
  policyInput.classList.toggle('hidden', activeDetailTab !== 'policy');
}

function mutateOptions() {
  const options = {
    requireAtomic: requireAtomicInput.checked,
    recheckPreconditions: recheckPreconditionsInput.checked,
    targetFormat: targetFormatInput.value,
  };
  if (enforcePolicyInput.checked) {
    options.policySource = policyInput.value;
  }
  for (const input of optionInputs) {
    const value = input.value.trim();
    if (value.length === 0) continue;
    const number = Number(value);
    if (Number.isSafeInteger(number) && number >= 0) options[input.id] = number;
  }
  return options;
}

function renderPolicyControls() {
  policyTabButton.classList.toggle('hidden', !enforcePolicyInput.checked);
  policyStatus.textContent = enforcePolicyInput.checked ? 'enabled' : 'disabled';
}

function requestKind() {
  return document.querySelector('input[name="requestKind"]:checked')?.value ?? 'structured';
}

function sourceKind() {
  return sourceKindInput.value === 'telex' ? 'telex' : 'aeon';
}

function currentExample() {
  return examples.find((entry) => entry.id === exampleSelect.value) ?? examples[0];
}

function requestKindForExample(example, preferredKind) {
  if (example.variants[preferredKind]) return preferredKind;
  if (example.variants.structured) return 'structured';
  if (example.variants.instruction) return 'instruction';
  return 'structured';
}

function updateRequestKindAvailability(example) {
  for (const input of requestKindInputs) {
    const available = Boolean(example.variants[input.value]);
    input.disabled = !available;
    const label = input.closest('label');
    label?.classList.toggle('is-disabled', !available);
    if (label) {
      label.title = available
        ? ''
        : `${input.value === 'instruction' ? 'Instruction' : 'Structured JSON'} is not available for this example`;
    }
  }
}

function exampleVariantStatus(example) {
  const hasStructured = Boolean(example.variants.structured);
  const hasInstruction = Boolean(example.variants.instruction);
  if (hasStructured && hasInstruction) return 'example loaded';
  if (hasStructured) return 'structured-only example';
  if (hasInstruction) return 'instruction-only example';
  return 'example loaded';
}

function setRequestKind(kind) {
  for (const input of requestKindInputs) {
    input.checked = input.value === kind;
  }
  updateRequestKindLabel();
}

function updateRequestKindLabel() {
  requestInputLabel.textContent = requestKind() === 'instruction'
    ? 'SANSA Instruction'
    : 'Mutation Request JSON';
}

function requestKindLabel() {
  return requestKind() === 'instruction' ? 'instruction' : 'structured JSON';
}

function setOptionInputs(options) {
  targetFormatInput.value = options.targetFormat ?? sourceKind();
  if (options.policySource !== undefined) {
    enforcePolicyInput.checked = true;
    policyInput.value = options.policySource;
    activeDetailTab = 'policy';
  } else {
    enforcePolicyInput.checked = false;
    policyInput.value = JSON.stringify(defaultPolicy, null, 2);
    if (activeDetailTab === 'policy') activeDetailTab = 'diagnostics';
  }
  renderPolicyControls();
  renderDetailPanel();
  maxOperationsInput.value = options.maxOperations ?? '';
  maxPreconditionsInput.value = options.maxPreconditions ?? '';
  maxValueNodesInput.value = options.maxValueNodes ?? '';
  maxValueDepthInput.value = options.maxValueDepth ?? '';
  maxStringLengthInput.value = options.maxStringLength ?? '';
  maxPositionIndexInput.value = options.maxPositionIndex ?? '';
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
