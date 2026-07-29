const sourceInput = document.querySelector('#sourceInput');
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

const defaultPolicy = {
  default: 'deny',
  rules: [
    {
      allow: true,
      operations: ['replace'],
      target: '$.inventory.items.*.sku',
      datatype: 'string',
    },
    {
      allow: true,
      operations: ['replace'],
      target: '$.inventory.items.*.qty',
      datatypes: ['number', 'int32'],
    },
    {
      allow: true,
      operations: ['create'],
      parent: '$.inventory.items.*',
      names: ['status'],
      datatype: 'string',
      values: ['pending', 'active'],
    },
    {
      allow: true,
      operations: ['remove'],
      target: '$.inventory.items.*.metric',
    },
    {
      allow: true,
      operations: ['insert'],
      container: '$.inventory.items.*.roles',
      datatype: 'string',
      values: ['admin', 'user'],
    },
    {
      allow: true,
      operations: ['move'],
      source: '$.inventory.items.*.roles.*',
      container: '$.inventory.items.*.roles',
    },
  ],
};

const examples = [
  {
    id: 'replace-sku',
    label: 'Replace SKU',
    group: 'Core Mutations',
    variants: {
      structured: {
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
      instruction: {
        request: [
          'because "manual correction"',
          'by "Bob"',
          'from $.inventory.items[0]',
          'where .sku == "A-100"',
          'replace .sku with "A-101"',
        ].join('\n'),
      },
    },
  },
  {
    id: 'replace-qty',
    label: 'Replace Qty',
    group: 'Core Mutations',
    variants: {
      instruction: {
        request: [
          'from $.inventory.items.*',
          'where .sku == "B-200"',
          'replace .qty with :int32, 10',
        ].join('\n'),
      },
    },
  },
  {
    id: 'guarded-replace-qty',
    label: 'Require Qty Before Replace',
    group: 'Preconditions',
    variants: {
      structured: {
        request: {
          operations: [
            { op: 'replace', target: '$.inventory.items[0].qty', datatype: 'int32', value: 10 },
          ],
          preconditions: [
            { expression: '.qty == 7', target: '$.inventory.items[0]' },
          ],
        },
      },
      instruction: {
        request: [
          'from $.inventory.items.*',
          'where .sku == "A-100"',
          'require .qty == 1',
          'replace .qty with :int32, 10',
        ].join('\n'),
      },
    },
  },
  {
    id: 'create-status',
    label: 'Create Status',
    group: 'Core Mutations',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.inventory.items[2]',
          name: 'status',
          value: 'pending',
        },
      },
      instruction: {
        request: [
          'from $.inventory.items.*',
          'where .sku == "C-300"',
          'create status with "pending"',
        ].join('\n'),
      },
    },
  },
  {
    id: 'create-attribute',
    label: 'Create Attribute',
    group: 'Attributes and Kinds',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types.color.@',
          name: 'selector',
          datatype: 'sansa',
          value: '$.inventory.items.*',
        },
      },
      instruction: {
        request: 'create $.types.color.@.selector with :sansa, $.inventory.items.*',
      },
    },
  },
  {
    id: 'create-kind',
    label: 'Create Kind',
    group: 'Attributes and Kinds',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types',
          name: 'brand',
          datatype: 'brandColor',
          kind: 'hex',
          value: 'ff00aa',
        },
      },
      instruction: {
        request: 'create $.types.brand with :brandColor, #ff00aa',
      },
    },
  },
  {
    id: 'remove-metric',
    label: 'Remove Metric',
    group: 'Core Mutations',
    variants: {
      structured: {
        request: {
          op: 'remove',
          target: '$.inventory.items[2].metric',
        },
      },
      instruction: {
        request: 'remove $.inventory.items[2].metric',
      },
    },
  },
  {
    id: 'insert-role',
    label: 'Append Role',
    group: 'Ordered Containers',
    variants: {
      structured: {
        request: {
          op: 'insert',
          container: '$.inventory.items[1].roles',
          placement: 'last',
          value: 'admin',
        },
      },
      instruction: {
        request: 'append $.inventory.items[1].roles with "admin"',
      },
    },
  },
  {
    id: 'move-role',
    label: 'Move Role',
    group: 'Ordered Containers',
    variants: {
      structured: {
        request: {
          op: 'move',
          source: '$.inventory.items[0].roles[0]',
          container: '$.inventory.items[0].roles',
          placement: { kind: 'after', anchor: '$.inventory.items[0].roles[1]' },
        },
      },
      instruction: {
        request: 'move $.inventory.items[0].roles[0] after $.inventory.items[0].roles[1] in $.inventory.items[0].roles',
      },
    },
  },
  {
    id: 'create-sansa-value',
    label: 'Create SANSA Value',
    group: 'Typed Values',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types',
          name: 'selectorWorkbench',
          datatype: 'sansa',
          value: '$.inventory.items.*',
        },
      },
      instruction: {
        request: 'create $.types.selectorWorkbench with :sansa, $.inventory.items.*',
      },
    },
  },
  {
    id: 'create-sep-value',
    label: 'Create Sep Value',
    group: 'Typed Values',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types',
          name: 'versionWorkbench',
          datatype: 'version',
          kind: 'sep',
          value: '0.11.0',
        },
      },
      instruction: {
        request: 'create $.types.versionWorkbench with :version, ^0.11.0',
      },
    },
  },
  {
    id: 'create-null-value',
    label: 'Create Null Value',
    group: 'Typed Values',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types',
          name: 'absentWorkbench',
          datatype: 'null<string>',
          kind: 'null',
          value: 'notApplicable',
        },
      },
      instruction: {
        request: 'create $.types.absentWorkbench with :null<string>, !notApplicable',
      },
    },
  },
  {
    id: 'create-reference-value',
    label: 'Create Reference Value',
    group: 'Typed Values',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$',
          name: 'cloneWorkbench',
          datatype: 'number',
          kind: 'cloneReference',
          value: 'target',
        },
      },
      instruction: {
        request: 'create $.cloneWorkbench with :number, ~target',
      },
    },
  },
  {
    id: 'create-object-value',
    label: 'Create Object Value',
    group: 'Typed Values',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types',
          name: 'settingsWorkbench',
          datatype: 'object',
          value: { enabled: true },
        },
      },
      instruction: {
        request: 'create $.types.settingsWorkbench with :object, { enabled = true }',
      },
    },
  },
  {
    id: 'create-list-value',
    label: 'Create List Value',
    group: 'Typed Values',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types',
          name: 'aliasesWorkbench',
          datatype: 'list<string>',
          value: ['adapter', 'driver'],
        },
      },
      instruction: {
        request: 'create $.types.aliasesWorkbench with :list<string>, ["adapter", "driver"]',
      },
    },
  },
  {
    id: 'create-generic-object-value',
    label: 'Create object<node>',
    group: 'Typed Values',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types',
          name: 'settingsGenericWorkbench',
          datatype: 'object<node>',
          value: { enabled: true },
        },
      },
      instruction: {
        request: 'create $.types.settingsGenericWorkbench with :object<node>, { enabled = true }',
      },
    },
  },
  {
    id: 'create-tuple-value',
    label: 'Create Tuple Value',
    group: 'Typed Values',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types',
          name: 'pairingWorkbench',
          datatype: 'tuple',
          value: ['sku', 7],
        },
      },
      instruction: {
        request: 'create $.types.pairingWorkbench with :tuple, ("sku", 7)',
      },
    },
  },
  {
    id: 'create-node-value',
    label: 'Create Node Value',
    group: 'Typed Values',
    variants: {
      structured: {
        request: {
          op: 'create',
          parent: '$.types',
          name: 'badgeWorkbench',
          datatype: 'node',
          value: { tag: 'badge', children: ['new', 3] },
        },
      },
      instruction: {
        request: 'create $.types.badgeWorkbench with :node, <badge("new", 3)>',
      },
    },
  },
  {
    id: 'append-typed-role',
    label: 'Append Typed Role',
    group: 'Ordered Containers',
    variants: {
      structured: {
        request: {
          op: 'insert',
          container: '$.inventory.items[1].roles',
          placement: 'last',
          datatype: 'string',
          kind: 'string',
          value: 'admin,editor',
        },
      },
      instruction: {
        request: 'append in $.inventory.items[1].roles with :string, "admin,editor"',
      },
    },
  },
  {
    id: 'target-aeon-generic-fail',
    label: 'AEON Rejects string<null>',
    group: 'Target Surfaces',
    variants: {
      instruction: {
        options: { targetFormat: 'aeon' },
        request: 'create $.types.textProbe with :string<null>, ""',
      },
    },
  },
  {
    id: 'target-aeon-container-generic-ok',
    label: 'AEON Allows object<node>',
    group: 'Target Surfaces',
    variants: {
      instruction: {
        options: { targetFormat: 'aeon' },
        request: 'create $.types.settingsAeonProbe with :object<node>, { enabled = true }',
      },
    },
  },
  {
    id: 'target-json-scalar-ok',
    label: 'JSON Allows Scalar',
    group: 'Target Surfaces',
    variants: {
      structured: {
        options: { targetFormat: 'json' },
        request: {
          op: 'replace',
          target: '$.inventory.items[0].sku',
          value: 'A-101',
        },
      },
      instruction: {
        options: { targetFormat: 'json' },
        request: [
          'from $.inventory.items[0]',
          'where .sku == "A-100"',
          'replace .sku with "A-101"',
        ].join('\n'),
      },
    },
  },
  {
    id: 'target-json-container-ok',
    label: 'JSON Allows Container',
    group: 'Target Surfaces',
    variants: {
      instruction: {
        options: { targetFormat: 'json' },
        request: 'create $.types.settingsJsonProbe with :object, { enabled = true }',
      },
    },
  },
  {
    id: 'target-json-attribute-fail',
    label: 'JSON Rejects Attribute',
    group: 'Target Surfaces',
    variants: {
      structured: {
        options: { targetFormat: 'json' },
        request: {
          op: 'create',
          parent: '$.types.color.@',
          name: 'selector',
          datatype: 'sansa',
          value: '$.inventory.items.*',
        },
      },
      instruction: {
        options: { targetFormat: 'json' },
        request: 'create $.types.color.@.selector with :sansa, $.inventory.items.*',
      },
    },
  },
  {
    id: 'target-json-typed-sansa-fail',
    label: 'JSON Rejects SANSA Type',
    group: 'Target Surfaces',
    variants: {
      structured: {
        options: { targetFormat: 'json' },
        request: {
          op: 'create',
          parent: '$.types',
          name: 'selectorJsonProbe',
          datatype: 'sansa',
          value: '$.inventory.items.*',
        },
      },
      instruction: {
        options: { targetFormat: 'json' },
        request: 'create $.types.selectorJsonProbe with :sansa, $.inventory.items.*',
      },
    },
  },
  {
    id: 'target-json-parameterized-list-fail',
    label: 'JSON Rejects list<string>',
    group: 'Target Surfaces',
    variants: {
      instruction: {
        options: { targetFormat: 'json' },
        request: 'create $.types.aliasesJsonProbe with :list<string>, ["adapter", "driver"]',
      },
    },
  },
  {
    id: 'target-json-parameterized-object-fail',
    label: 'JSON Rejects object<node>',
    group: 'Target Surfaces',
    variants: {
      instruction: {
        options: { targetFormat: 'json' },
        request: 'create $.types.settingsJsonGenericProbe with :object<node>, { enabled = true }',
      },
    },
  },
  {
    id: 'target-json-tuple-fail',
    label: 'JSON Rejects Tuple',
    group: 'Target Surfaces',
    variants: {
      instruction: {
        options: { targetFormat: 'json' },
        request: 'create $.types.pairingJsonProbe with :tuple, ("sku", 7)',
      },
    },
  },
  {
    id: 'target-json-node-fail',
    label: 'JSON Rejects Node',
    group: 'Target Surfaces',
    variants: {
      instruction: {
        options: { targetFormat: 'json' },
        request: 'create $.types.badgeJsonProbe with :node, <badge("new", 3)>',
      },
    },
  },
  {
    id: 'target-json-reference-fail',
    label: 'JSON Rejects Reference',
    group: 'Target Surfaces',
    variants: {
      instruction: {
        options: { targetFormat: 'json' },
        request: 'create $.cloneJsonProbe with :number, ~target',
      },
    },
  },
  {
    id: 'instruction-duplicate-object-field-fail',
    label: 'Duplicate Object Field',
    group: 'Instruction Diagnostics',
    variants: {
      instruction: {
        request: 'create $.types.settingsWorkbench with :object, { enabled = true enabled = false }',
      },
    },
  },
  {
    id: 'instruction-literal-only-fail',
    label: 'Literal-Only Value',
    group: 'Instruction Diagnostics',
    variants: {
      instruction: {
        request: 'replace $.inventory.items[0].sku with lower("A")',
      },
    },
  },
  {
    id: 'instruction-invalid-create-name-fail',
    label: 'Invalid Create Name',
    group: 'Instruction Diagnostics',
    variants: {
      instruction: {
        request: 'create "" with "x"',
      },
    },
  },
  {
    id: 'create-scalars',
    label: 'Create Scalars',
    group: 'Batch Requests',
    variants: {
      structured: {
        request: {
          operations: [
            {
              op: 'create',
              parent: '$.types',
              name: 'selectorCopy',
              datatype: 'sansa',
              value: '$.inventory.items.*',
            },
            {
              op: 'create',
              parent: '$.types',
              name: 'versionCopy',
              datatype: 'version',
              kind: 'sep',
              value: '0.11.0',
            },
            {
              op: 'create',
              parent: '$.types',
              name: 'absentCopy',
              datatype: 'null<string>',
              kind: 'null',
              value: 'notApplicable',
            },
            {
              op: 'create',
              parent: '$',
              name: 'cloneCopy',
              datatype: 'number',
              kind: 'cloneReference',
              value: 'target',
            },
          ],
        },
      },
    },
  },
  {
    id: 'create-containers',
    label: 'Create Containers',
    group: 'Batch Requests',
    variants: {
      structured: {
        request: {
          operations: [
            {
              op: 'create',
              parent: '$.types',
              name: 'settings',
              datatype: 'object',
              value: { enabled: true },
            },
            {
              op: 'create',
              parent: '$.types',
              name: 'aliases',
              datatype: 'list<string>',
              value: ['adapter', 'driver'],
            },
            {
              op: 'create',
              parent: '$.types',
              name: 'pairing',
              datatype: 'tuple',
              value: ['sku', 7],
            },
            {
              op: 'create',
              parent: '$.types',
              name: 'badge',
              datatype: 'node',
              value: { tag: 'badge', children: ['new', 3] },
            },
          ],
        },
      },
    },
  },
  {
    id: 'insert-item',
    label: 'Insert Item',
    group: 'Ordered Containers',
    variants: {
      structured: {
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
      instruction: {
        request: 'insert before $.inventory.items[1] in $.inventory.items with :object, { sku = "B-150" name = "Brace" qty = 4 category = "hardware" }',
      },
    },
  },
  {
    id: 'move-item',
    label: 'Move Item',
    group: 'Ordered Containers',
    variants: {
      structured: {
        request: {
          op: 'move',
          source: '$.inventory.items[0]',
          container: '$.inventory.items',
          placement: 'last',
        },
      },
      instruction: {
        request: 'move $.inventory.items[0] last in $.inventory.items',
      },
    },
  },
  {
    id: 'budget-fail',
    label: 'Budget Failure',
    group: 'Failure Cases',
    variants: {
      structured: {
        options: { maxOperations: 1 },
        request: [
          { op: 'replace', target: '$.inventory.items[0].qty', value: 9 },
          { op: 'replace', target: '$.inventory.items[1].qty', value: 2 },
        ],
      },
      instruction: {
        options: { maxOperations: 1 },
        request: [
          'from $.inventory.items[0..1]',
          'replace .qty with 9',
        ].join('\n'),
      },
    },
  },
  {
    id: 'value-budget-fail',
    label: 'Value Budget',
    group: 'Failure Cases',
    variants: {
      structured: {
        options: { maxStringLength: 4 },
        request: {
          op: 'replace',
          target: '$.inventory.items[0].sku',
          value: 'ABCDEFGHIJ',
        },
      },
      instruction: {
        options: { maxStringLength: 4 },
        request: 'replace $.inventory.items[0].sku with "ABCDEFGHIJ"',
      },
    },
  },
  {
    id: 'capability-fail',
    label: 'Precondition Failure',
    group: 'Failure Cases',
    variants: {
      structured: {
        request: {
          operations: [
            { op: 'replace', target: '$.inventory.items[0].sku', value: 'A-101' },
          ],
          preconditions: [
            { expression: '$.inventory.items[0].sku == "Z-999"' },
          ],
        },
      },
      instruction: {
        request: [
          'require $.inventory.items[0].sku == "Z-999"',
          'replace $.inventory.items[0].sku with "A-101"',
        ].join('\n'),
      },
    },
  },
];

let defaultSource = '';
let lastPayload = null;
let activeSourceTab = 'input';
let activeDetailTab = 'diagnostics';

await loadDefaults();
renderExamples();
policyInput.value = JSON.stringify(defaultPolicy, null, 2);
renderPolicyControls();
renderDetailPanel();
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
  defaultSource = await fetchText('/fixtures/query-inventory.aeon', [
    'inventory = {',
    '  items:list<object> = [',
    '    { sku:string = "A-100" name:string = "Adapter" qty:int = 1 }',
    '    { sku:string = "B-200" name:string = "Bolt" qty:int = 3 }',
    '  ]',
    '}',
  ].join('\n'));
  sourceInput.value = defaultSource;
  sourceStatus.textContent = 'default aeon';
}

function renderExamples() {
  const groupedOptions = new Map();
  for (const example of examples) {
    const group = example.group ?? 'Examples';
    const groupOptions = groupedOptions.get(group) ?? [];
    const option = document.createElement('option');
    option.value = example.id;
    option.textContent = example.label;
    groupOptions.push(option);
    groupedOptions.set(group, groupOptions);
  }

  exampleSelect.replaceChildren(...Array.from(groupedOptions, ([label, options]) => {
    const group = document.createElement('optgroup');
    group.label = label;
    group.replaceChildren(...options);
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
  const payload = await mutateApi({
    source: sourceInput.value,
    requestSource: requestInput.value,
    requestKind: requestKind(),
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
  targetFormatInput.value = options.targetFormat ?? 'aeon';
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
