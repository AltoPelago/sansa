export const defaultPolicy = {
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

export const mutateExamples = [
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

const mutateExampleExpectationOverrides = {
  'replace-sku:structured': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: replace $.inventory.items[0].sku', 'preconditions: 1'],
  },
  'replace-sku:instruction': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: replace $.inventory.items[0].sku', 'because "manual correction"', 'by "Bob"'],
  },
  'replace-qty:instruction': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: replace $.inventory.items[1].qty'],
  },
  'guarded-replace-qty:structured': {
    ok: false,
    code: 'SANSA_MUTATE_PRECONDITION_FAILED',
  },
  'create-status:instruction': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: create $.inventory.items[2]'],
  },
  'create-attribute:instruction': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: create $.types.color.@'],
  },
  'append-typed-role:instruction': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: insert $.inventory.items[1].roles'],
  },
  'target-aeon-generic-fail:instruction': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE',
    targetFormat: 'aeon',
    datatype: 'string<null>',
  },
  'target-json-attribute-fail:structured': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE',
    targetFormat: 'json',
  },
  'target-json-attribute-fail:instruction': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE',
    targetFormat: 'json',
  },
  'target-json-typed-sansa-fail:structured': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE',
    targetFormat: 'json',
    datatype: 'sansa',
  },
  'target-json-typed-sansa-fail:instruction': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE',
    targetFormat: 'json',
    datatype: 'sansa',
  },
  'target-json-parameterized-list-fail:instruction': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE',
    targetFormat: 'json',
    datatype: 'list<string>',
  },
  'target-json-parameterized-object-fail:instruction': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE',
    targetFormat: 'json',
    datatype: 'object<node>',
  },
  'target-json-tuple-fail:instruction': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE',
    targetFormat: 'json',
    datatype: 'tuple',
  },
  'target-json-node-fail:instruction': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE',
    targetFormat: 'json',
    datatype: 'node',
  },
  'target-json-reference-fail:instruction': {
    ok: false,
    phase: 'target',
    code: 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE',
    targetFormat: 'json',
    datatype: 'cloneReference',
  },
  'instruction-duplicate-object-field-fail:instruction': {
    ok: false,
    phase: 'parse',
    code: 'SANSA_INSTRUCTION_PARSE_FAILED',
  },
  'instruction-literal-only-fail:instruction': {
    ok: false,
    phase: 'parse',
    code: 'SANSA_INSTRUCTION_PARSE_FAILED',
  },
  'instruction-invalid-create-name-fail:instruction': {
    ok: false,
    phase: 'parse',
    code: 'SANSA_INSTRUCTION_PARSE_FAILED',
  },
  'budget-fail:structured': {
    ok: false,
    phase: 'plan',
    code: 'SANSA_MUTATE_BUDGET_EXCEEDED',
    budget: 'maxOperations',
  },
  'budget-fail:instruction': {
    ok: false,
    phase: 'plan',
    code: 'SANSA_MUTATE_BUDGET_EXCEEDED',
    budget: 'maxOperations',
  },
  'value-budget-fail:structured': {
    ok: false,
    phase: 'plan',
    code: 'SANSA_MUTATE_BUDGET_EXCEEDED',
    budget: 'maxStringLength',
  },
  'value-budget-fail:instruction': {
    ok: false,
    phase: 'plan',
    code: 'SANSA_MUTATE_BUDGET_EXCEEDED',
    budget: 'maxStringLength',
  },
  'capability-fail:structured': {
    ok: false,
    code: 'SANSA_MUTATE_PRECONDITION_FAILED',
  },
  'capability-fail:instruction': {
    ok: false,
    phase: 'plan',
    code: 'SANSA_MUTATE_PRECONDITION_FAILED',
  },
  'target-aeon-container-generic-ok:instruction': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: create $.types'],
  },
  'target-json-container-ok:instruction': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: create $.types'],
  },
  'insert-item:instruction': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: insert $.inventory.items'],
  },
  'move-item:instruction': {
    ok: true,
    operationCount: 1,
    textIncludes: ['0: move $.inventory.items[0]'],
  },
  'create-scalars:structured': {
    ok: true,
    operationCount: 4,
    textIncludes: ['operations: 4', '3: create $'],
  },
  'create-containers:structured': {
    ok: true,
    operationCount: 4,
    textIncludes: ['operations: 4'],
  },
};

for (const example of mutateExamples) {
  for (const [kind, variant] of Object.entries(example.variants)) {
    variant.expected = mutateExampleExpectationOverrides[`${example.id}:${kind}`] ?? { ok: true };
  }
}

export const mutateExampleGroups = Array.from(mutateExamples.reduce((groups, example) => {
  const group = example.group ?? 'Examples';
  const entries = groups.get(group) ?? [];
  entries.push(example);
  groups.set(group, entries);
  return groups;
}, new Map()), ([label, examples]) => ({ label, examples }));

export function firstMutateExampleId() {
  return mutateExamples[0]?.id ?? '';
}
