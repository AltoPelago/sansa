import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runMutationForWorkbench } from '../tools/mutate-web/runtime.mjs';
import { namespaceFromAeonSource } from '../tools/query-web/runtime.mjs';

let aeonRuntimeProbe;

async function hasAeonRuntime() {
  if (aeonRuntimeProbe !== undefined) return aeonRuntimeProbe;
  try {
    const result = await namespaceFromAeonSource('probe:string = "ok"');
    aeonRuntimeProbe = result.ok
      ? { ok: true }
      : { ok: false, message: result.errors?.[0]?.message ?? 'AEON runtime unavailable' };
  } catch (error) {
    aeonRuntimeProbe = {
      ok: false,
      message: error instanceof Error ? error.message : 'AEON runtime unavailable',
    };
  }
  return aeonRuntimeProbe;
}

function testAeonRuntime(name, fn) {
  test(name, async (t) => {
    const runtime = await hasAeonRuntime();
    if (!runtime.ok) {
      t.skip(runtime.message);
      return;
    }
    await fn(t);
  });
}

testAeonRuntime('mutate web runtime plans structured mutation requests', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      operations: [
        { op: 'replace', target: '$.inventory.items[0].sku', value: 'A-101' },
      ],
      preconditions: [
        { expression: '$.inventory.items[0].sku == "A-100"' },
      ],
      provenance: { source: 'test' },
    }),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.plan.operations[0].op, 'replace');
  assert.equal(result.plan.operations[0].target.canonicalAddress, '$.inventory.items[0].sku');
  assert.deepEqual(result.plan.sourceProvenance, { source: 'test' });
  assert.match(result.text, /operations: 1/);
});

testAeonRuntime('mutate web runtime plans instruction requests', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestKind: 'instruction',
    requestSource: [
      'because "manual correction"',
      'by "Bob"',
      'from $.inventory.items.*',
      'where .sku == "B-200"',
      'replace .qty with :int32, 10',
    ].join('\n'),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.requestKind, 'instruction');
  assert.equal(result.plan.operations[0].op, 'replace');
  assert.equal(result.plan.operations[0].target.canonicalAddress, '$.inventory.items[1].qty');
  assert.equal(result.plan.operations[0].datatype, 'int32');
  assert.equal(result.plan.sourceProvenance.reason, 'manual correction');
  assert.equal(result.plan.sourceProvenance.claimedAuthor, 'Bob');
  assert.equal(result.plan.operations[0].provenance, undefined);
  assert.deepEqual(result.loweredRequest, {
    op: 'replace',
    target: '$.inventory.items[1].qty',
    datatype: 'int32',
    kind: 'number',
    value: 10,
  });
  assert.match(result.text, /operations: 1/);
  assert.match(result.text, /because "manual correction"/);
  assert.match(result.text, /by "Bob"/);
});

testAeonRuntime('mutate web runtime applies mutations to an isolated source tree', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      op: 'replace',
      target: '$.inventory.items[0].sku',
      value: 'A-101',
    }),
    options: { requireAtomic: true },
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.result.operationResults[0].status, 'applied');
  assert.equal(result.result.operationResults[0].targetAddress, '$.inventory.items[0].sku');
  assert.match(result.source, /sku@\{origin:string = "catalog"\}:string = "A-101"/);
  assert.match(result.source, /^consent:toggle = yes/);
  assert.doesNotMatch(result.source, /^\$:object = \{/);
  assert.match(result.text, /applied: 1/);
  assert.doesNotMatch(result.text, /sku@\{origin:string = "catalog"\}:string = "A-101"/);

  const rendered = await namespaceFromAeonSource(result.source);
  assert.equal(rendered.ok, true, JSON.stringify(rendered.errors ?? []));
});

testAeonRuntime('mutate web runtime applies instruction requests', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestKind: 'instruction',
    requestSource: [
      'from $.inventory.items.*',
      'where .sku == "B-200"',
      'replace .qty with :int32, 10',
    ].join('\n'),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.requestKind, 'instruction');
  assert.equal(result.result.operationResults[0].targetAddress, '$.inventory.items[1].qty');
  assert.match(result.source, /sku@\{origin:string = "catalog"\}:string = "B-200"/);
  assert.match(result.source, /qty:int32 = 10/);
  assert.match(result.text, /applied: 1/);

  const rendered = await namespaceFromAeonSource(result.source);
  assert.equal(rendered.ok, true, JSON.stringify(rendered.errors ?? []));
});

testAeonRuntime('mutate web runtime renders untyped temporal instruction replacements by literal family', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestKind: 'instruction',
    requestSource: [
      'from $.inventory.items[0]',
      'where .sku == "A-100"',
      'replace .sku with 2026-10-10',
    ].join('\n'),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.loweredRequest.kind, 'date');
  assert.equal(result.result.operationResults[0].affectedBinding.semanticType, 'date');
  assert.equal(result.result.operationResults[0].affectedBinding.representationKind, 'date');
  assert.match(result.source, /sku@\{origin:string = "catalog"\}:date = 2026-10-10/);
  assert.doesNotMatch(result.source, /sku:string = 2026-10-10/);

  const rendered = await namespaceFromAeonSource(result.source);
  assert.equal(rendered.ok, true, JSON.stringify(rendered.errors ?? []));
});

testAeonRuntime('mutate web runtime applies representative instruction example forms', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const examples = [
    {
      instruction: [
        'from $.inventory.items[0]',
        'where .sku == "A-100"',
        'replace .sku with "A-101"',
      ].join('\n'),
      match: /sku@\{origin:string = "catalog"\}:string = "A-101"/,
    },
    {
      instruction: [
        'from $.inventory.items.*',
        'where .sku == "A-100"',
        'require .qty == 1',
        'replace .qty with :int32, 10',
      ].join('\n'),
      match: /qty:int32 = 10/,
    },
    {
      instruction: [
        'from $.inventory.items.*',
        'where .sku == "C-300"',
        'create status with "pending"',
      ].join('\n'),
      match: /status:string = "pending"/,
    },
    {
      instruction: 'create $.types.color.@.selector with :sansa, $.inventory.items.*',
      match: /color@\{selector:sansa = \$\.inventory\.items\.\*\}:hex = #ff00aa/,
    },
    {
      instruction: 'create $.types.brand with :brandColor, #ff00aa',
      match: /brand:brandColor = #ff00aa/,
    },
    {
      instruction: 'insert last in $.inventory.items[1].roles with "admin"',
      match: /roles:list<string> = \[\s*"user"\s*"admin"\s*\]/,
    },
    {
      instruction: 'append $.inventory.items[1].roles with "admin"',
      match: /roles:list<string> = \[\s*"user"\s*"admin"\s*\]/,
    },
    {
      instruction: 'move $.inventory.items[0].roles[0] after $.inventory.items[0].roles[1] in $.inventory.items[0].roles',
      match: /roles:list<string> = \[\s*"user"\s*"admin"\s*\]/,
    },
    {
      instruction: 'remove $.inventory.items[2].metric',
      reject: /metric:nan<number> = NaN/,
    },
    {
      instruction: 'create $.types.versionCopyInstruction with :version, ^0.11.0',
      match: /versionCopyInstruction:version = \^0\.11\.0/,
    },
    {
      instruction: 'create $.types.absentCopyInstruction with :null<string>, !notApplicable',
      match: /absentCopyInstruction:null<string> = !notApplicable/,
    },
    {
      instruction: 'create $.cloneCopyInstruction with :number, ~target',
      match: /cloneCopyInstruction:number = ~target/,
    },
    {
      instruction: 'create $.types.settingsInstruction with :object, { enabled = true }',
      match: /settingsInstruction:object = \{\s*enabled:boolean = true\s*\}/,
    },
    {
      instruction: 'create $.types.settingsCommaInstruction with :object, { enabled = true, status = false }',
      match: /settingsCommaInstruction:object = \{\s*enabled:boolean = true\s*status:boolean = false\s*\}/,
    },
    {
      instruction: 'create $.types.aliasesInstruction with :list<string>, ["adapter", "driver"]',
      match: /aliasesInstruction:list<string> = \[\s*"adapter"\s*"driver"\s*\]/,
    },
    {
      instruction: 'create $.types.pairingInstruction with :tuple, ("sku", 7)',
      match: /pairingInstruction:tuple = \(\s*"sku"\s*7\s*\)/,
    },
    {
      instruction: 'create $.types.badgeInstruction with :node, <badge("new", 3)>',
      match: /badgeInstruction:node = <badge\(\s*"new"\s*3\s*\)>/,
    },
    {
      instruction: 'insert before $.inventory.items[1] in $.inventory.items with :object, { sku = "B-150" name = "Brace" qty = 4 category = "hardware" }',
      match: /sku:string = "B-150"/,
    },
    {
      instruction: 'move $.inventory.items[0] last in $.inventory.items',
      match: /items:list<object> = \[[\s\S]*sku@\{origin:string = "catalog"\}:string = "B-200"[\s\S]*sku@\{origin:string = "catalog"\}:string = "A-100"/,
    },
  ];

  for (const example of examples) {
    const result = await runMutationForWorkbench({
      source,
      mode: 'apply',
      requestKind: 'instruction',
      requestSource: example.instruction,
    });

    assert.equal(result.ok, true, `${example.instruction}\n${JSON.stringify(result.errors ?? [])}`);
    assert.equal(result.requestKind, 'instruction');
    assert.match(result.text, /applied: 1/);
    if (example.match) assert.match(result.source, example.match);
    if (example.reject) assert.doesNotMatch(result.source, example.reject);

    const rendered = await namespaceFromAeonSource(result.source);
    assert.equal(rendered.ok, true, `${example.instruction}\n${JSON.stringify(rendered.errors ?? [])}`);
  }
});

testAeonRuntime('mutate web runtime reports invalid mutation JSON', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: '{',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_WORKBENCH_INVALID_MUTATION_JSON');
});

testAeonRuntime('mutate web runtime reports instruction diagnostics', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestKind: 'instruction',
    requestSource: 'from $.inventory.items.*\nreplace .missing with "x"',
  });

  assert.equal(result.ok, false);
  assert.equal(result.requestKind, 'instruction');
  assert.equal(result.phase, 'lower');
  assert.equal(result.errors[0].code, 'SANSA_INSTRUCTION_TARGET_MISS');
  assert.match(result.text, /SANSA_INSTRUCTION_TARGET_MISS \[lower\]/);
});

testAeonRuntime('mutate web runtime reports create against non-container parents', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types.color',
      name: 'status',
      value: 'active',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_PARENT_NOT_CONTAINER');
  assert.match(result.text, /Create parent \$\.types\.color is not a container binding/);
});

testAeonRuntime('mutate web runtime creates attributes through attribute-space parents', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types.color.@',
      name: 'selector',
      datatype: 'sansa',
      value: '$.inventory.items.*',
    }),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.plan.operations[0].datatype, 'sansa');
  assert.match(result.source, /color@\{selector:sansa = \$\.inventory\.items\.\*\}:hex = #ff00aa/);
  assert.match(result.text, /applied: 1/);

  const rendered = await namespaceFromAeonSource(result.source);
  assert.equal(rendered.ok, true, JSON.stringify(rendered.errors ?? []));
});

testAeonRuntime('mutate web runtime creates typed AEON containers', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      operations: [
        { op: 'create', parent: '$.types', name: 'settings', datatype: 'object', value: { enabled: true } },
        { op: 'create', parent: '$.types', name: 'aliases', datatype: 'list<string>', value: ['adapter', 'driver'] },
        { op: 'create', parent: '$.types', name: 'pairing', datatype: 'tuple', value: ['sku', 7] },
        { op: 'create', parent: '$.types', name: 'badge', datatype: 'node', value: { tag: 'badge', children: ['new', 3] } },
      ],
    }),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.match(result.source, /settings:object = \{/);
  assert.match(result.source, /aliases:list<string> = \[/);
  assert.match(result.source, /pairing:tuple = \(/);
  assert.match(result.source, /badge:node = <badge\(/);
  assert.match(result.source, /nodeValue:node = <tag\(/);

  const rendered = await namespaceFromAeonSource(result.source);
  assert.equal(rendered.ok, true, JSON.stringify(rendered.errors ?? []));
});

testAeonRuntime('mutate web runtime applies kind as representation separately from datatype', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types',
      name: 'brand',
      datatype: 'brandColor',
      kind: 'hex',
      value: 'ff00aa',
    }),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.plan.operations[0].datatype, 'brandColor');
  assert.equal(result.plan.operations[0].kind, 'hex');
  assert.match(result.source, /brand:brandColor = #ff00aa/);

  const rendered = await namespaceFromAeonSource(result.source);
  assert.equal(rendered.ok, true, JSON.stringify(rendered.errors ?? []));
});

testAeonRuntime('mutate web runtime materializes typed scalar literal families', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      operations: [
        { op: 'create', parent: '$.types', name: 'brandColor', datatype: 'brandColor', kind: 'hex', value: 'ff00aa' },
        { op: 'create', parent: '$.types', name: 'maskCopy', datatype: 'radix[16]', value: 'ff00aa' },
        { op: 'create', parent: '$.types', name: 'encoded', datatype: 'encoding', value: 'QmFzZTY0IQ==' },
        { op: 'create', parent: '$.types', name: 'versionCopy', datatype: 'version', kind: 'sep', value: '0.11.0' },
        { op: 'create', parent: '$.types', name: 'selectorCopy', datatype: 'sansa', value: '$.inventory.items.*' },
        { op: 'create', parent: '$.types', name: 'releaseCopy', datatype: 'date', value: '2026-07-26' },
        { op: 'create', parent: '$.types', name: 'consentCopy', datatype: 'toggle', value: 'yes' },
        { op: 'create', parent: '$.types', name: 'absentCopy', datatype: 'null<string>', kind: 'null', value: 'notApplicable' },
        { op: 'create', parent: '$.types', name: 'metricCopy', datatype: 'nan<number>', kind: 'nan', value: null },
        { op: 'create', parent: '$.types', name: 'ceilingCopy', datatype: 'infinity<number>', kind: 'infinity', value: '-Infinity' },
        { op: 'create', parent: '$', name: 'cloneCopy', datatype: 'number', kind: 'cloneReference', value: 'target' },
        { op: 'create', parent: '$', name: 'pointerCopy', datatype: 'number', kind: 'pointerReference', value: 'target' },
      ],
    }),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  const bindingsByAddress = new Map(result.result.operationResults.map((entry) => [
    entry.resultingAddress,
    entry.affectedBinding,
  ]));
  assert.equal(bindingsByAddress.get('$.types.absentCopy').semanticType, 'null<string>');
  assert.equal(bindingsByAddress.get('$.types.absentCopy').representationKind, 'null');
  assert.equal(bindingsByAddress.get('$.types.absentCopy').scalarKind, 'null');
  assert.equal(bindingsByAddress.get('$.types.absentCopy').nullReason, 'notApplicable');
  assert.equal(bindingsByAddress.get('$.types.metricCopy').value, 'NaN');
  assert.equal(bindingsByAddress.get('$.types.metricCopy').scalarKind, 'nan');
  assert.equal(bindingsByAddress.get('$.types.ceilingCopy').value, '-Infinity');
  assert.equal(bindingsByAddress.get('$.cloneCopy').representationKind, 'cloneReference');
  assert.equal(bindingsByAddress.get('$.cloneCopy').scalarKind, 'referenceForm');
  assert.deepEqual(bindingsByAddress.get('$.cloneCopy').value, {
    type: 'CloneReference',
    canonical: '~target',
  });
  assert.match(result.source, /brandColor:brandColor = #ff00aa/);
  assert.match(result.source, /maskCopy:radix\[16\] = %ff00aa/);
  assert.match(result.source, /encoded:encoding = &QmFzZTY0IQ==/);
  assert.match(result.source, /versionCopy:version = \^0\.11\.0/);
  assert.match(result.source, /selectorCopy:sansa = \$\.inventory\.items\.\*/);
  assert.match(result.source, /releaseCopy:date = 2026-07-26/);
  assert.match(result.source, /consentCopy:toggle = yes/);
  assert.match(result.source, /absentCopy:null<string> = !notApplicable/);
  assert.match(result.source, /metricCopy:nan<number> = NaN/);
  assert.match(result.source, /ceilingCopy:infinity<number> = -Infinity/);
  assert.match(result.source, /cloneCopy:number = ~target/);
  assert.match(result.source, /pointerCopy:number = ~>target/);

  const rendered = await namespaceFromAeonSource(result.source);
  assert.equal(rendered.ok, true, JSON.stringify(rendered.errors ?? []));
});

testAeonRuntime('mutate web runtime rejects scalar values that cannot render as requested kinds', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types',
      name: 'consentCopy',
      datatype: 'toggle',
      value: 'maybe',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'target');
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.match(result.text, /Toggle literals must be one of yes, no, on, or off/);
  assert.doesNotMatch(result.source, /consentCopy:toggle/);
});

testAeonRuntime('mutate web runtime forwards value budget options', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'replace',
      target: '$.inventory.items[0].sku',
      value: 'ABCDEFGHIJ',
    }),
    options: { maxStringLength: 4 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_BUDGET_EXCEEDED');
  assert.equal(result.errors[0].phase, 'plan');
  assert.equal(result.errors[0].budget, 'maxStringLength');
  assert.equal(result.errors[0].limit, 4);
  assert.equal(result.errors[0].observed, 10);
});

testAeonRuntime('mutate web runtime enforces experimental mutation policy allow rules', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const policy = {
    default: 'deny',
    rules: [
      {
        allow: true,
        operations: ['replace'],
        target: '$.inventory.items.*.qty',
        datatypes: ['number', 'int32'],
      },
    ],
  };
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestKind: 'instruction',
    requestSource: [
      'from $.inventory.items.*',
      'where .sku == "B-200"',
      'replace .qty with :int32, 10',
    ].join('\n'),
    options: { policySource: JSON.stringify(policy) },
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.plan.operations[0].target.canonicalAddress, '$.inventory.items[1].qty');
});

testAeonRuntime('mutate web runtime policy authorizes instruction operations with require preconditions', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const policy = {
    default: 'deny',
    rules: [
      {
        allow: true,
        operations: ['replace'],
        target: '$.inventory.items.*.qty',
        datatypes: ['number', 'int32'],
      },
    ],
  };
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestKind: 'instruction',
    requestSource: [
      'from $.inventory.items.*',
      'where .sku == "A-100"',
      'require .qty == 1',
      'replace .qty with :int32, 10',
    ].join('\n'),
    options: { policySource: JSON.stringify(policy) },
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.plan.operations[0].target.canonicalAddress, '$.inventory.items[0].qty');
  assert.equal(result.plan.preconditions[0].target.canonicalAddress, '$.inventory.items[0]');
  assert.match(result.text, /preconditions: 1/);
});

testAeonRuntime('mutate web runtime denies mutations outside the experimental policy surface', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const policy = {
    default: 'deny',
    rules: [
      {
        allow: true,
        operations: ['replace'],
        target: '$.inventory.items.*.qty',
        datatype: 'number',
      },
    ],
  };
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types',
      name: 'policyDeniedStatus',
      value: 'active',
    }),
    options: { policySource: JSON.stringify(policy) },
  });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'policy');
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_POLICY_DENIED');
  assert.equal(result.errors[0].operationIndex, 0);
  assert.match(result.text, /SANSA_MUTATE_POLICY_DENIED \[policy\] operation 0/);
  assert.doesNotMatch(result.source, /policyDeniedStatus:string = "active"/);
});

testAeonRuntime('mutate web runtime supports explicit experimental policy deny rules', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const policy = {
    default: 'allow',
    rules: [
      {
        allow: false,
        operations: ['replace'],
        target: '$.inventory.items.*.sku',
      },
    ],
  };
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'replace',
      target: '$.inventory.items[0].sku',
      value: 'A-101',
    }),
    options: { policySource: JSON.stringify(policy) },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_POLICY_DENIED');
  assert.equal(result.errors[0].ruleIndex, 0);
});

testAeonRuntime('mutate web runtime requires explicit experimental policy decisions', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const policy = {
    default: 'deny',
    rules: [
      {
        operations: ['replace'],
        target: '$.inventory.items.*.sku',
      },
    ],
  };
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'replace',
      target: '$.inventory.items[0].sku',
      value: 'A-101',
    }),
    options: { policySource: JSON.stringify(policy) },
  });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'policy');
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_POLICY_INVALID');
  assert.equal(result.errors[0].ruleIndex, 0);
  assert.match(result.text, /allow as true or false/);
});

testAeonRuntime('mutate web runtime policy authorizes without rewriting planned intent', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const policy = {
    default: 'deny',
    rules: [
      {
        allow: true,
        operations: ['replace'],
        target: '$.inventory.items.*.status',
        values: ['pending'],
        rewrite: { value: 'active' },
      },
    ],
  };
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      op: 'replace',
      target: '$.inventory.items[1].status',
      value: 'pending',
    }),
    options: { policySource: JSON.stringify(policy) },
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.match(result.source, /status:string = "pending"/);
  assert.doesNotMatch(result.source, /status:string = "active"/);
});

testAeonRuntime('mutate web runtime reports invalid experimental mutation policy input', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'replace',
      target: '$.inventory.items[0].sku',
      value: 'A-101',
    }),
    options: { policySource: '{' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'policy');
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_POLICY_INVALID_JSON');
});

testAeonRuntime('mutate web runtime rejects AEON-invalid container member names', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types',
      name: 'settings',
      datatype: 'object',
      value: { '': '' },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'target');
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(result.errors[0].targetFormat, 'aeon');
  assert.match(result.text, /Keys must not be empty/);
  assert.doesNotMatch(result.source, /settings:object/);
});

testAeonRuntime('mutate web runtime rejects datatypes outside the AEON target surface', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestKind: 'instruction',
    requestSource: 'create $.types.textProbe with :string<null>, ""',
  });

  assert.equal(result.ok, false);
  assert.equal(result.phase, 'target');
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(result.errors[0].targetFormat, 'aeon');
  assert.equal(result.errors[0].datatype, 'string<null>');
  assert.match(result.text, /does not allow generic parameters on datatype 'string'/);
});

testAeonRuntime('mutate web runtime applies JSON-compatible target surface checks', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const compatible = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'replace',
      target: '$.inventory.items[0].sku',
      value: 'A-101',
    }),
    options: { targetFormat: 'json' },
  });

  assert.equal(compatible.ok, true, JSON.stringify(compatible.errors ?? []));

  const attribute = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types.color.@',
      name: 'selector',
      datatype: 'sansa',
      value: '$.inventory.items.*',
    }),
    options: { targetFormat: 'json' },
  });

  assert.equal(attribute.ok, false);
  assert.equal(attribute.phase, 'target');
  assert.equal(attribute.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE');
  assert.equal(attribute.errors[0].targetFormat, 'json');
  assert.match(attribute.text, /cannot represent AEON attribute-space mutations/);

  const typed = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types',
      name: 'selectorJsonProbe',
      datatype: 'sansa',
      value: '$.inventory.items.*',
    }),
    options: { targetFormat: 'json' },
  });

  assert.equal(typed.ok, false);
  assert.equal(typed.phase, 'target');
  assert.equal(typed.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(typed.errors[0].datatype, 'sansa');
  assert.match(typed.text, /Target 'json' does not support datatype 'sansa'/);
});
