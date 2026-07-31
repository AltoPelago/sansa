import assert from 'node:assert/strict';
import test from 'node:test';
import { lowerInstruction, parseInstruction, planInstruction, validateMutationPlanTarget } from '../src/index.js';

function parseOk(source) {
  const result = parseInstruction(source);
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  return result.instruction;
}

function parseBad(source, code) {
  const result = parseInstruction(source);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, code);
}

function lowerOk(source, ...args) {
  const result = lowerInstruction(source, ...args);
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  return result.request;
}

function lowerBad(source, code, ...args) {
  const result = lowerInstruction(source, ...args);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, code);
}

function planOk(source, namespace, options) {
  const result = planInstruction(source, namespace, options);
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  return result;
}

function planBad(source, namespace, phase, code, options) {
  const result = planInstruction(source, namespace, options);
  assert.equal(result.ok, false);
  assert.equal(result.phase, phase);
  assert.equal(result.errors[0].code, code);
  return result;
}

function binding({ address, name, index, value, representationKind = 'object', semanticType, children = [] }) {
  const entry = {
    address,
    ...(name === undefined ? {} : { name }),
    ...(index === undefined ? {} : { index }),
    ...(value === undefined ? {} : { value }),
    representationKind,
    ...(semanticType === undefined ? {} : { semanticType }),
    children,
  };
  for (const child of children) child.parent = entry;
  return entry;
}

function sampleNamespace() {
  const item0 = binding({
    address: '$.inventory.items[0]',
    index: 0,
    children: [
      binding({ address: '$.inventory.items[0].sku', name: 'sku', value: 'A-100', representationKind: 'string', semanticType: 'string' }),
      binding({ address: '$.inventory.items[0].qty', name: 'qty', value: 0, representationKind: 'number', semanticType: 'number' }),
      binding({
        address: '$.inventory.items[0].tags',
        name: 'tags',
        representationKind: 'list',
        children: [
          binding({ address: '$.inventory.items[0].tags[0]', index: 0, value: 'old', representationKind: 'string', semanticType: 'string' }),
          binding({ address: '$.inventory.items[0].tags[1]', index: 1, value: 'clearance', representationKind: 'string', semanticType: 'string' }),
        ],
      }),
    ],
  });
  const item1 = binding({
    address: '$.inventory.items[1]',
    index: 1,
    children: [
      binding({ address: '$.inventory.items[1].sku', name: 'sku', value: 'B-200', representationKind: 'string', semanticType: 'string' }),
      binding({ address: '$.inventory.items[1].qty', name: 'qty', value: 4, representationKind: 'number', semanticType: 'number' }),
      binding({
        address: '$.inventory.items[1].tags',
        name: 'tags',
        representationKind: 'list',
        children: [
          binding({ address: '$.inventory.items[1].tags[0]', index: 0, value: 'new', representationKind: 'string', semanticType: 'string' }),
        ],
      }),
    ],
  });
  const root = binding({
    address: '$',
    children: [
      binding({
        address: '$.inventory',
        name: 'inventory',
        children: [
          binding({ address: '$.inventory.items', name: 'items', representationKind: 'list', children: [item0, item1] }),
          binding({
            address: '$.inventory.otherTags',
            name: 'otherTags',
            representationKind: 'list',
            children: [
              binding({ address: '$.inventory.otherTags[0]', index: 0, value: 'other', representationKind: 'string', semanticType: 'string' }),
            ],
          }),
        ],
      }),
    ],
  });
  return {
    root,
    contextualRoot: item0,
    children: (entry) => entry.children,
    parent: (entry) => entry.parent,
  };
}

test('parses core instruction mutation verbs', () => {
  const create = parseOk('create $.inventory.status with "active"');
  assert.equal(create.mutation.verb, 'create');
  assert.equal(create.mutation.destination.kind, 'address');
  assert.equal(create.mutation.destination.canonical, '$.inventory.status');
  assert.equal(create.mutation.value.kind, 'string');
  assert.equal(create.canonical, 'create $.inventory.status with "active"');

  const replace = parseOk('replace $.inventory.qty with :int32 10');
  assert.equal(replace.mutation.verb, 'replace');
  assert.equal(replace.mutation.target.address.canonical, '$.inventory.qty');
  assert.equal(replace.mutation.value.datatype, 'int32');
  assert.equal(replace.mutation.value.kind, 'number');
  assert.equal(replace.canonical, 'replace $.inventory.qty with :int32, 10');

  const remove = parseOk('remove $.inventory.oldStatus');
  assert.equal(remove.mutation.verb, 'remove');
  assert.equal(remove.mutation.target.address.canonical, '$.inventory.oldStatus');

  const insert = parseOk('insert before $.tags[2] in $.tags with :string, "featured"');
  assert.equal(insert.mutation.verb, 'insert');
  assert.equal(insert.mutation.placement.kind, 'before');
  assert.equal(insert.mutation.placement.anchor.address.canonical, '$.tags[2]');
  assert.equal(insert.mutation.container.address.canonical, '$.tags');

  const insertAfter = parseOk('insert after $.tags[1] in $.tags with "clearance"');
  assert.equal(insertAfter.mutation.verb, 'insert');
  assert.equal(insertAfter.mutation.placement.kind, 'after');
  assert.equal(insertAfter.mutation.placement.anchor.address.canonical, '$.tags[1]');
  assert.equal(insertAfter.canonical, 'insert after $.tags[1] in $.tags with "clearance"');

  const append = parseOk('append $.tags with "sale"');
  assert.equal(append.mutation.verb, 'insert');
  assert.equal(append.mutation.placement.kind, 'last');
  assert.equal(append.mutation.container.address.canonical, '$.tags');
  assert.equal(append.canonical, 'insert last in $.tags with "sale"');
  assert.deepEqual(append.clauses, ['append']);

  const appendIn = parseOk('append in $.tags with "sale"');
  assert.equal(appendIn.mutation.verb, 'insert');
  assert.equal(appendIn.mutation.placement.kind, 'last');
  assert.equal(appendIn.mutation.container.address.canonical, '$.tags');
  assert.equal(appendIn.canonical, 'insert last in $.tags with "sale"');
  assert.deepEqual(appendIn.clauses, ['append']);

  const move = parseOk('move $.tags[0] after $.tags[2] in $.tags');
  assert.equal(move.mutation.verb, 'move');
  assert.equal(move.mutation.source.address.canonical, '$.tags[0]');
  assert.equal(move.mutation.placement.kind, 'after');

  const moveLast = parseOk('move $.tags[0] last in $.tags');
  assert.equal(moveLast.mutation.verb, 'move');
  assert.equal(moveLast.mutation.source.address.canonical, '$.tags[0]');
  assert.equal(moveLast.mutation.placement.kind, 'last');
  assert.equal(moveLast.canonical, 'move $.tags[0] last in $.tags');
});

test('parses candidate-relative instruction clauses', () => {
  const instruction = parseOk([
    'because "manual correction"',
    'by "Bob"',
    'from $.inventory.items.*',
    'where .qty == 0',
    'require .sku == "A-100"',
    'replace .qty with :int32, 10',
  ].join('\n'));

  assert.equal(instruction.from.address.canonical, '$.inventory.items.*');
  assert.equal(instruction.where.expression, '.qty == 0');
  assert.equal(instruction.requires[0].expression, '.sku == "A-100"');
  assert.deepEqual(instruction.provenance, { reason: 'manual correction', claimedAuthor: 'Bob' });
  assert.equal(instruction.mutation.target.address.canonical, '?.qty');
  assert.equal(instruction.canonical, [
    'because "manual correction"',
    'by "Bob"',
    'from $.inventory.items.*',
    'where .qty == 0',
    'require .sku == "A-100"',
    'replace .qty with :int32, 10',
  ].join('\n'));
});

test('parses instruction value literal families', () => {
  const color = parseOk('replace $.inventory.color with #fff');
  assert.equal(color.mutation.value.kind, 'hex');
  assert.equal(color.mutation.value.value, 'fff');

  const date = parseOk('replace $.inventory.release with 2026-10-10');
  assert.equal(date.mutation.value.kind, 'date');
  assert.equal(date.mutation.value.value, '2026-10-10');
  assert.equal(date.canonical, 'replace $.inventory.release with 2026-10-10');

  const selector = parseOk('replace $.inventory.selector with :sansa, $.inventory.items.*:number');
  assert.equal(selector.mutation.value.datatype, 'sansa');
  assert.equal(selector.mutation.value.kind, 'sansa');
  assert.equal(selector.mutation.value.value, '$.inventory.items.*:number');

  const csv = parseOk('create $.inventory.format with :csv[","], "sku,name"');
  assert.equal(csv.mutation.value.datatype, 'csv[","]');
  assert.equal(csv.mutation.value.kind, 'string');

  const separator = parseOk('create $.inventory.parts with :sep[|], ^"hello world"|"this, [is] fine"');
  assert.equal(separator.mutation.value.datatype, 'sep[|]');
  assert.equal(separator.mutation.value.kind, 'separator');
  assert.equal(separator.mutation.value.value, '"hello world"|"this, [is] fine"');

  const absent = parseOk('create $.inventory.status with :null<string>, !notApplicable');
  assert.equal(absent.mutation.value.datatype, 'null<string>');
  assert.equal(absent.mutation.value.kind, 'null');
  assert.equal(absent.mutation.value.value, 'notApplicable');

  const reference = parseOk('create $.inventory.copy with :number, ~target');
  assert.equal(reference.mutation.value.datatype, 'number');
  assert.equal(reference.mutation.value.kind, 'cloneReference');
  assert.equal(reference.mutation.value.value, 'target');
});

test('parses instruction container value literals', () => {
  const object = parseOk('create $.types.settings with :object, { enabled = true }');
  assert.equal(object.mutation.value.datatype, 'object');
  assert.equal(object.mutation.value.kind, 'object');
  assert.deepEqual(object.mutation.value.value, { enabled: true });

  const objectWithComma = parseOk('create $.types.settings with :object, { enabled = true, status = false }');
  assert.equal(objectWithComma.mutation.value.datatype, 'object');
  assert.equal(objectWithComma.mutation.value.kind, 'object');
  assert.deepEqual(objectWithComma.mutation.value.value, { enabled: true, status: false });
  assert.equal(objectWithComma.mutation.value.literal.canonical, '{ enabled = true status = false }');

  const objectWithTypedComma = parseOk('create $.types.settings with :object, { csv = :csv[","], "sku,name", status = false }');
  assert.equal(objectWithTypedComma.mutation.value.literal.fields[0].value.datatype, 'csv[","]');
  assert.equal(objectWithTypedComma.mutation.value.literal.fields[0].value.kind, 'string');
  assert.deepEqual(objectWithTypedComma.mutation.value.value, { csv: 'sku,name', status: false });

  const typedObjectResult = parseInstruction('create $.types.settings with :object, { csv = :csv[","], "sku,name", status = false }');
  assert.equal(typedObjectResult.ok, true);
  assert.deepEqual(
    typedObjectResult.warnings.map((warning) => warning.code),
    ['SANSA_INSTRUCTION_NESTED_VALUE_INTENT_FLATTENED'],
  );
  assert.equal(typedObjectResult.warnings[0].datatype, 'csv[","]');

  const list = parseOk('create $.types.aliases with :list<string>, ["adapter", "driver"]');
  assert.equal(list.mutation.value.datatype, 'list<string>');
  assert.equal(list.mutation.value.kind, 'list');
  assert.deepEqual(list.mutation.value.value, ['adapter', 'driver']);

  const typedListResult = parseInstruction('create $.types.values with :list, [:int32 3, :string "4"]');
  assert.equal(typedListResult.ok, true);
  assert.deepEqual(
    typedListResult.warnings.map((warning) => warning.code),
    [
      'SANSA_INSTRUCTION_NESTED_VALUE_INTENT_FLATTENED',
      'SANSA_INSTRUCTION_NESTED_VALUE_INTENT_FLATTENED',
    ],
  );

  const nestedCustomDatatypeResult = parseInstruction('create $.types.relationships with :object, { sibling = :relationship<sibling>[brother], "Bob" }');
  assert.equal(nestedCustomDatatypeResult.ok, true);
  assert.deepEqual(
    nestedCustomDatatypeResult.warnings.map((warning) => warning.code),
    ['SANSA_INSTRUCTION_NESTED_VALUE_INTENT_FLATTENED'],
  );
  assert.equal(nestedCustomDatatypeResult.warnings[0].datatype, 'relationship<sibling>[brother]');

  const untypedNestedFamiliesResult = parseInstruction('create $.types.settings with :object, { when = 2026-10-10 copy = ~target pair = ("sku", 7) }');
  assert.equal(untypedNestedFamiliesResult.ok, true);
  assert.deepEqual(
    untypedNestedFamiliesResult.warnings.map((warning) => `${warning.code}:${warning.kind}`),
    [
      'SANSA_INSTRUCTION_NESTED_VALUE_REPRESENTATION_FLATTENED:date',
      'SANSA_INSTRUCTION_NESTED_VALUE_REPRESENTATION_FLATTENED:cloneReference',
      'SANSA_INSTRUCTION_NESTED_VALUE_REPRESENTATION_FLATTENED:tuple',
    ],
  );

  parseBad(
    'create $.types.settings with :object, { when = :number, "2026-10-10" }',
    'SANSA_INSTRUCTION_NESTED_VALUE_INTENT_MISMATCH',
  );
  parseBad(
    'create $.types.settings with :object, { when = :date, "2026-10-10" }',
    'SANSA_INSTRUCTION_NESTED_VALUE_INTENT_MISMATCH',
  );

  const tuple = parseOk('create $.types.pairing with :tuple, ("sku", 7)');
  assert.equal(tuple.mutation.value.datatype, 'tuple');
  assert.equal(tuple.mutation.value.kind, 'tuple');
  assert.deepEqual(tuple.mutation.value.value, ['sku', 7]);

  const node = parseOk('create $.types.badge with :node, <badge("new", 3)>');
  assert.equal(node.mutation.value.datatype, 'node');
  assert.equal(node.mutation.value.kind, 'node');
  assert.deepEqual(node.mutation.value.value, { tag: 'badge', children: ['new', 3] });
});

test('parses instruction comments and complex datatype intent', () => {
  const commented = parseOk([
    'because "manual correction" // source note',
    '/* choose selected item */',
    'replace $.inventory.qty with /* typed payload */ :int32, 10',
  ].join('\n'));
  assert.equal(commented.canonical, [
    'because "manual correction"',
    'replace $.inventory.qty with :int32, 10',
  ].join('\n'));

  const complexDatatype = parseOk('create $.relationship with :relationship<sibling>[brother], "Bob"');
  assert.equal(complexDatatype.mutation.value.datatype, 'relationship<sibling>[brother]');
  assert.equal(complexDatatype.mutation.value.kind, 'string');
  assert.equal(complexDatatype.canonical, 'create $.relationship with :relationship<sibling>[brother], "Bob"');

  const replaceWithoutDelimiter = parseOk('replace $.inventory.qty with :int32 10');
  assert.equal(replaceWithoutDelimiter.mutation.value.datatype, 'int32');
  assert.equal(replaceWithoutDelimiter.mutation.value.kind, 'number');
  assert.equal(replaceWithoutDelimiter.canonical, 'replace $.inventory.qty with :int32, 10');
});

test('lowers direct instructions to mutate request operations', () => {
  assert.deepEqual(lowerOk('create $.inventory.status with "active"'), {
    op: 'create',
    parent: '$.inventory',
    name: 'status',
    kind: 'string',
    value: 'active',
  });

  assert.deepEqual(lowerOk('create $.inventory.["display name"] with :string, "Adapter"'), {
    op: 'create',
    parent: '$.inventory',
    name: 'display name',
    datatype: 'string',
    kind: 'string',
    value: 'Adapter',
  });

  assert.deepEqual(lowerOk('create status with "active"'), {
    op: 'create',
    parent: '?',
    name: 'status',
    kind: 'string',
    value: 'active',
  });

  assert.deepEqual(lowerOk('replace $.inventory.qty with :int32, 10'), {
    op: 'replace',
    target: '$.inventory.qty',
    datatype: 'int32',
    kind: 'number',
    value: 10,
  });

  assert.deepEqual(lowerOk('remove $.inventory.oldStatus'), {
    op: 'remove',
    target: '$.inventory.oldStatus',
  });

  assert.deepEqual(lowerOk('insert last in $.tags with "sale"'), {
    op: 'insert',
    container: '$.tags',
    placement: 'last',
    kind: 'string',
    value: 'sale',
  });

  assert.deepEqual(lowerOk('insert first in $.tags with "new"'), {
    op: 'insert',
    container: '$.tags',
    placement: 'first',
    kind: 'string',
    value: 'new',
  });

  assert.deepEqual(lowerOk('insert after $.tags[1] in $.tags with "clearance"'), {
    op: 'insert',
    container: '$.tags',
    placement: { kind: 'after', anchor: '$.tags[1]' },
    kind: 'string',
    value: 'clearance',
  });

  assert.deepEqual(lowerOk('append in $.tags with "clearance"'), {
    op: 'insert',
    container: '$.tags',
    placement: 'last',
    kind: 'string',
    value: 'clearance',
  });

  assert.deepEqual(lowerOk('move $.tags[0] after $.tags[2] in $.tags'), {
    op: 'move',
    source: '$.tags[0]',
    container: '$.tags',
    placement: { kind: 'after', anchor: '$.tags[2]' },
  });

  assert.deepEqual(lowerOk('move $.tags[0] last in $.tags'), {
    op: 'move',
    source: '$.tags[0]',
    container: '$.tags',
    placement: 'last',
  });

  assert.deepEqual(lowerOk('create $.types.settings with :object, { enabled = true }'), {
    op: 'create',
    parent: '$.types',
    name: 'settings',
    datatype: 'object',
    kind: 'object',
    value: { enabled: true },
  });
});

test('preserves inert instruction provenance metadata while lowering', () => {
  const result = lowerInstruction([
    'because "manual correction"',
    'by "Bob"',
    'replace $.inventory.items[0].qty with :int32, 10',
  ].join('\n'));
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(result.provenance, { reason: 'manual correction', claimedAuthor: 'Bob' });
  assert.equal(result.request.provenance, undefined);
});

test('lowers query-shaped instructions through namespace candidates', () => {
  const namespace = sampleNamespace();

  assert.deepEqual(lowerOk([
    'from $.inventory.items.*',
    'where .qty == 0',
    'replace .qty with :int32, 10',
  ].join('\n'), namespace), {
    op: 'replace',
    target: '$.inventory.items[0].qty',
    datatype: 'int32',
    kind: 'number',
    value: 10,
  });

  assert.deepEqual(lowerOk([
    'from $.inventory.items.*',
    'create status with "active"',
  ].join('\n'), namespace), [
    { op: 'create', parent: '$.inventory.items[0]', name: 'status', kind: 'string', value: 'active' },
    { op: 'create', parent: '$.inventory.items[1]', name: 'status', kind: 'string', value: 'active' },
  ]);

  assert.deepEqual(lowerOk([
    'from $.inventory.items.*',
    'insert after .tags[0] in .tags with "sale"',
  ].join('\n'), namespace), [
    {
      op: 'insert',
      container: '$.inventory.items[0].tags',
      placement: { kind: 'after', anchor: '$.inventory.items[0].tags[0]' },
      kind: 'string',
      value: 'sale',
    },
    {
      op: 'insert',
      container: '$.inventory.items[1].tags',
      placement: { kind: 'after', anchor: '$.inventory.items[1].tags[0]' },
      kind: 'string',
      value: 'sale',
    },
  ]);

  assert.deepEqual(lowerOk([
    'from $.inventory.items.*',
    'where .sku == "A-100"',
    'require .qty == 0',
    'replace .qty with :int32, 10',
  ].join('\n'), namespace), {
    operations: [
      {
        op: 'replace',
        target: '$.inventory.items[0].qty',
        datatype: 'int32',
        kind: 'number',
        value: 10,
      },
    ],
    preconditions: [
      {
        expression: '.qty == 0',
        target: '$.inventory.items[0]',
      },
    ],
  });

  assert.deepEqual(lowerOk([
    'from $.inventory.items.*',
    'where .qty == 0',
    'remove .sku',
  ].join('\n'), namespace), {
    op: 'remove',
    target: '$.inventory.items[0].sku',
  });

  assert.deepEqual(lowerOk([
    'from $.inventory.items.*',
    'append in .tags with "new"',
  ].join('\n'), namespace), [
    {
      op: 'insert',
      container: '$.inventory.items[0].tags',
      placement: 'last',
      kind: 'string',
      value: 'new',
    },
    {
      op: 'insert',
      container: '$.inventory.items[1].tags',
      placement: 'last',
      kind: 'string',
      value: 'new',
    },
  ]);

  assert.deepEqual(lowerOk([
    'from $.inventory.items.*',
    'move .tags[0] first in .tags',
  ].join('\n'), namespace), [
    {
      op: 'move',
      source: '$.inventory.items[0].tags[0]',
      container: '$.inventory.items[0].tags',
      placement: 'first',
    },
    {
      op: 'move',
      source: '$.inventory.items[1].tags[0]',
      container: '$.inventory.items[1].tags',
      placement: 'first',
    },
  ]);

  assert.deepEqual(lowerOk([
    'from $.inventory.items.*',
    'where .sku == "A-100"',
    'require .qty == 0',
    'require .sku == "A-100"',
    'replace .qty with :int32, 10',
  ].join('\n'), namespace), {
    operations: [
      {
        op: 'replace',
        target: '$.inventory.items[0].qty',
        datatype: 'int32',
        kind: 'number',
        value: 10,
      },
    ],
    preconditions: [
      {
        expression: '.qty == 0',
        target: '$.inventory.items[0]',
      },
      {
        expression: '.sku == "A-100"',
        target: '$.inventory.items[0]',
      },
    ],
  });
});

test('plans lowered instructions through the mutate planner', () => {
  const namespace = sampleNamespace();

  const replace = planOk([
    'from $.inventory.items.*',
    'where .qty == 0',
    'replace .qty with :int32, 10',
  ].join('\n'), namespace);
  assert.equal(replace.plan.operations.length, 1);
  assert.equal(replace.plan.operations[0].op, 'replace');
  assert.equal(replace.plan.operations[0].target.canonicalAddress, '$.inventory.items[0].qty');
  assert.equal(replace.plan.operations[0].datatype, 'int32');
  assert.equal(replace.plan.operations[0].value, 10);
  assert.equal(replace.plan.sourceProvenance.type, 'SansaInstruction');

  const attributed = planOk([
    'because "manual correction"',
    'by "Bob"',
    'replace $.inventory.items[0].qty with :int32, 10',
  ].join('\n'), namespace);
  assert.equal(attributed.plan.sourceProvenance.type, 'SansaInstruction');
  assert.equal(attributed.plan.sourceProvenance.reason, 'manual correction');
  assert.equal(attributed.plan.sourceProvenance.claimedAuthor, 'Bob');
  assert.equal(attributed.plan.operations[0].provenance, undefined);

  const nestedIntent = planOk('create $.inventory.nestedIntent with :object, { csv = :csv[","], "sku,name" }', namespace);
  assert.equal(nestedIntent.plan.operations[0].datatype, 'object');
  assert.equal(nestedIntent.plan.operations[0].kind, 'object');
  assert.deepEqual(nestedIntent.plan.operations[0].value, { csv: 'sku,name' });
  assert.deepEqual(
    nestedIntent.warnings.map((warning) => warning.code),
    ['SANSA_INSTRUCTION_NESTED_VALUE_INTENT_FLATTENED'],
  );

  const guarded = planOk([
    'from $.inventory.items.*',
    'where .sku == "A-100"',
    'require .qty == 0',
    'replace .qty with :int32, 10',
  ].join('\n'), namespace);
  assert.deepEqual(guarded.plan.preconditions.map((precondition) => ({
    expression: precondition.expression,
    canonical: precondition.canonical,
    target: precondition.target.canonicalAddress,
  })), [
    { expression: '.qty == 0', canonical: '.qty == 0', target: '$.inventory.items[0]' },
  ]);

  const create = planOk([
    'from $.inventory.items.*',
    'create status with "active"',
  ].join('\n'), namespace);
  assert.deepEqual(create.plan.operations.map((operation) => ({
    op: operation.op,
    parent: operation.parent.canonicalAddress,
    name: operation.name,
    value: operation.value,
  })), [
    { op: 'create', parent: '$.inventory.items[0]', name: 'status', value: 'active' },
    { op: 'create', parent: '$.inventory.items[1]', name: 'status', value: 'active' },
  ]);

  const append = planOk('append in $.inventory.items[0].tags with :csv[","], "new,tag"', namespace);
  assert.equal(append.plan.operations.length, 1);
  assert.equal(append.plan.operations[0].op, 'insert');
  assert.equal(append.plan.operations[0].container.canonicalAddress, '$.inventory.items[0].tags');
  assert.equal(append.plan.operations[0].placement.kind, 'last');
  assert.equal(append.plan.operations[0].datatype, 'csv[","]');
  assert.equal(append.plan.operations[0].kind, 'string');
  assert.equal(append.plan.operations[0].value, 'new,tag');

  const typedReplace = planOk('replace $.inventory.items[0].sku with :string, "A-101"', namespace);
  assert.equal(typedReplace.plan.operations[0].op, 'replace');
  assert.equal(typedReplace.plan.operations[0].target.canonicalAddress, '$.inventory.items[0].sku');
  assert.equal(typedReplace.plan.operations[0].datatype, 'string');
  assert.equal(typedReplace.plan.operations[0].kind, 'string');
  assert.equal(typedReplace.plan.operations[0].value, 'A-101');

  const date = planOk('create $.inventory.released with :date, 2026-10-10', namespace);
  assert.equal(date.plan.operations[0].op, 'create');
  assert.equal(date.plan.operations[0].parent.canonicalAddress, '$.inventory');
  assert.equal(date.plan.operations[0].name, 'released');
  assert.equal(date.plan.operations[0].datatype, 'date');
  assert.equal(date.plan.operations[0].kind, 'date');
  assert.equal(date.plan.operations[0].value, '2026-10-10');

  const datetime = planOk('create $.inventory.availableAt with :datetime, 2026-10-10T09Z', namespace);
  assert.equal(datetime.plan.operations[0].op, 'create');
  assert.equal(datetime.plan.operations[0].parent.canonicalAddress, '$.inventory');
  assert.equal(datetime.plan.operations[0].name, 'availableAt');
  assert.equal(datetime.plan.operations[0].datatype, 'datetime');
  assert.equal(datetime.plan.operations[0].kind, 'datetime');
  assert.equal(datetime.plan.operations[0].value, '2026-10-10T09Z');

  const selector = planOk('create $.inventory.selectorProbe with :sansa, $.inventory.items[0..1].sku', namespace);
  assert.equal(selector.plan.operations[0].op, 'create');
  assert.equal(selector.plan.operations[0].parent.canonicalAddress, '$.inventory');
  assert.equal(selector.plan.operations[0].name, 'selectorProbe');
  assert.equal(selector.plan.operations[0].datatype, 'sansa');
  assert.equal(selector.plan.operations[0].kind, 'sansa');
  assert.equal(selector.plan.operations[0].value, '$.inventory.items[0..1].sku');
});

test('validates instruction plans against target surfaces after planning', () => {
  const namespace = sampleNamespace();

  const compatible = planOk('replace $.inventory.items[0].sku with "B-200"', namespace);
  const compatibleTarget = validateMutationPlanTarget(compatible.plan, 'aeon');
  assert.equal(compatibleTarget.ok, true, JSON.stringify(compatibleTarget.errors ?? []));

  const aeonParameterizedList = planOk('create $.inventory.aliases with :list<string>, ["adapter", "driver"]', namespace);
  const aeonParameterizedListTarget = validateMutationPlanTarget(aeonParameterizedList.plan, 'aeon');
  assert.equal(aeonParameterizedListTarget.ok, true, JSON.stringify(aeonParameterizedListTarget.errors ?? []));

  const jsonObjectCompatible = planOk('create $.inventory.settings with :object, { enabled = true }', namespace);
  const jsonObjectTarget = validateMutationPlanTarget(jsonObjectCompatible.plan, 'json');
  assert.equal(jsonObjectTarget.ok, true, JSON.stringify(jsonObjectTarget.errors ?? []));

  const jsonListCompatible = planOk('create $.inventory.aliasesJson with :list, ["adapter", "driver"]', namespace);
  const jsonListTarget = validateMutationPlanTarget(jsonListCompatible.plan, 'json');
  assert.equal(jsonListTarget.ok, true, JSON.stringify(jsonListTarget.errors ?? []));

  const jsonIncompatible = planOk('create $.inventory.selectorProbe with :sansa, $.inventory.items.*', namespace);
  const jsonTarget = validateMutationPlanTarget(jsonIncompatible.plan, 'json');
  assert.equal(jsonTarget.ok, false);
  assert.equal(jsonTarget.errors[0].phase, 'target');
  assert.equal(jsonTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(jsonTarget.errors[0].targetFormat, 'json');
  assert.equal(jsonTarget.errors[0].datatype, 'sansa');

  const jsonParameterizedListIncompatible = planOk('create $.inventory.aliasesTypedJson with :list<string>, ["adapter"]', namespace);
  const jsonParameterizedListTarget = validateMutationPlanTarget(jsonParameterizedListIncompatible.plan, 'json');
  assert.equal(jsonParameterizedListTarget.ok, false);
  assert.equal(jsonParameterizedListTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(jsonParameterizedListTarget.errors[0].targetFormat, 'json');
  assert.equal(jsonParameterizedListTarget.errors[0].datatype, 'list<string>');

  const aeonToggleStringIncompatible = planOk('create $.inventory.badToggle with :toggle, "maybe"', namespace);
  const aeonToggleStringTarget = validateMutationPlanTarget(aeonToggleStringIncompatible.plan, 'aeon');
  assert.equal(aeonToggleStringTarget.ok, false);
  assert.equal(aeonToggleStringTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonToggleStringTarget.errors[0].targetFormat, 'aeon');
  assert.equal(aeonToggleStringTarget.errors[0].datatype, 'toggle');
  assert.equal(aeonToggleStringTarget.errors[0].valuePath, 'operations[0].value');

  const aeonDateStringIncompatible = planOk('create $.inventory.badDate with :date, "2026-10-10"', namespace);
  const aeonDateStringTarget = validateMutationPlanTarget(aeonDateStringIncompatible.plan, 'aeon');
  assert.equal(aeonDateStringTarget.ok, false);
  assert.equal(aeonDateStringTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonDateStringTarget.errors[0].targetFormat, 'aeon');
  assert.equal(aeonDateStringTarget.errors[0].datatype, 'date');
  assert.equal(aeonDateStringTarget.errors[0].valuePath, 'operations[0].value');

  const aeonNestedDateString = planOk('create $.inventory.nestedDateString with :object, { when = :date, 2026-10-10 }', namespace);
  assert.deepEqual(
    aeonNestedDateString.warnings.map((warning) => warning.code),
    ['SANSA_INSTRUCTION_NESTED_VALUE_INTENT_FLATTENED'],
  );
  assert.deepEqual(aeonNestedDateString.plan.operations[0].value, { when: '2026-10-10' });
  const aeonNestedDateStringTarget = validateMutationPlanTarget(aeonNestedDateString.plan, 'aeon');
  assert.equal(aeonNestedDateStringTarget.ok, true, JSON.stringify(aeonNestedDateStringTarget.errors ?? []));

  const jsonNestedReference = planOk('create $.inventory.nestedReference with :object, { copy = ~target }', namespace);
  assert.deepEqual(
    jsonNestedReference.warnings.map((warning) => warning.code),
    ['SANSA_INSTRUCTION_NESTED_VALUE_REPRESENTATION_FLATTENED'],
  );
  assert.deepEqual(jsonNestedReference.plan.operations[0].value, { copy: 'target' });
  const jsonNestedReferenceTarget = validateMutationPlanTarget(jsonNestedReference.plan, 'json');
  assert.equal(jsonNestedReferenceTarget.ok, true, JSON.stringify(jsonNestedReferenceTarget.errors ?? []));

  const jsonNestedTuple = planOk('create $.inventory.nestedPair with :object, { pair = :tuple, ("sku", 7) }', namespace);
  assert.deepEqual(
    jsonNestedTuple.warnings.map((warning) => warning.code),
    ['SANSA_INSTRUCTION_NESTED_VALUE_INTENT_FLATTENED'],
  );
  assert.deepEqual(jsonNestedTuple.plan.operations[0].value, { pair: ['sku', 7] });
  const jsonNestedTupleTarget = validateMutationPlanTarget(jsonNestedTuple.plan, 'json');
  assert.equal(jsonNestedTupleTarget.ok, true, JSON.stringify(jsonNestedTupleTarget.errors ?? []));

  const aeonNestedCustomDatatype = planOk('create $.inventory.nestedRelationship with :object, { sibling = :relationship<sibling>[brother], "Bob" }', namespace);
  assert.deepEqual(
    aeonNestedCustomDatatype.warnings.map((warning) => warning.code),
    ['SANSA_INSTRUCTION_NESTED_VALUE_INTENT_FLATTENED'],
  );
  assert.deepEqual(aeonNestedCustomDatatype.plan.operations[0].value, { sibling: 'Bob' });
  const aeonNestedCustomDatatypeTarget = validateMutationPlanTarget(aeonNestedCustomDatatype.plan, 'aeon');
  assert.equal(aeonNestedCustomDatatypeTarget.ok, true, JSON.stringify(aeonNestedCustomDatatypeTarget.errors ?? []));

  const aeonSansaSelectorCompatible = planOk('create $.inventory.selectorProbeAeon with :sansa, $.inventory.items.*.sku', namespace);
  const aeonSansaSelectorTarget = validateMutationPlanTarget(aeonSansaSelectorCompatible.plan, 'aeon');
  assert.equal(aeonSansaSelectorTarget.ok, true, JSON.stringify(aeonSansaSelectorTarget.errors ?? []));

  const aeonReferenceSelectorIncompatible = planOk('create $.inventory.badReference with :number, ~target.*', namespace);
  const aeonReferenceSelectorTarget = validateMutationPlanTarget(aeonReferenceSelectorIncompatible.plan, 'aeon');
  assert.equal(aeonReferenceSelectorTarget.ok, false);
  assert.equal(aeonReferenceSelectorTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonReferenceSelectorTarget.errors[0].targetFormat, 'aeon');
  assert.equal(aeonReferenceSelectorTarget.errors[0].valuePath, 'operations[0].value');

  const aeonInvalidRadixDatatype = planOk('create $.inventory.badRadix with :radix[03], %101', namespace);
  const aeonInvalidRadixDatatypeTarget = validateMutationPlanTarget(aeonInvalidRadixDatatype.plan, 'aeon');
  assert.equal(aeonInvalidRadixDatatypeTarget.ok, false);
  assert.equal(aeonInvalidRadixDatatypeTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonInvalidRadixDatatypeTarget.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidRadixDatatypeTarget.errors[0].datatype, 'radix[03]');

  const aeonUnsupportedRadixAlias = planOk('create $.inventory.badRadixAlias with :radix16, %10', namespace);
  const aeonUnsupportedRadixAliasTarget = validateMutationPlanTarget(aeonUnsupportedRadixAlias.plan, 'aeon');
  assert.equal(aeonUnsupportedRadixAliasTarget.ok, false);
  assert.equal(aeonUnsupportedRadixAliasTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonUnsupportedRadixAliasTarget.errors[0].targetFormat, 'aeon');
  assert.equal(aeonUnsupportedRadixAliasTarget.errors[0].datatype, 'radix16');

  const aeonEncodingStringIncompatible = planOk('create $.inventory.badEncoding with :base64, "abc+/=="', namespace);
  const aeonEncodingStringTarget = validateMutationPlanTarget(aeonEncodingStringIncompatible.plan, 'aeon');
  assert.equal(aeonEncodingStringTarget.ok, false);
  assert.equal(aeonEncodingStringTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE');
  assert.equal(aeonEncodingStringTarget.errors[0].targetFormat, 'aeon');
  assert.equal(aeonEncodingStringTarget.errors[0].datatype, 'base64');
  assert.equal(aeonEncodingStringTarget.errors[0].valuePath, 'operations[0].value');

  const aeonQuotedSeparatorCompatible = planOk('create $.inventory.parts with :sep[|], ^"hello world"|"this, [is] fine"', namespace);
  const aeonQuotedSeparatorTarget = validateMutationPlanTarget(aeonQuotedSeparatorCompatible.plan, 'aeon');
  assert.equal(aeonQuotedSeparatorTarget.ok, true, JSON.stringify(aeonQuotedSeparatorTarget.errors ?? []));

  const aeonInvalidSeparatorDatatype = planOk('create $.inventory.badSeparator with :sep[","], ^"hello, world"', namespace);
  const aeonInvalidSeparatorDatatypeTarget = validateMutationPlanTarget(aeonInvalidSeparatorDatatype.plan, 'aeon');
  assert.equal(aeonInvalidSeparatorDatatypeTarget.ok, false);
  assert.equal(aeonInvalidSeparatorDatatypeTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonInvalidSeparatorDatatypeTarget.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidSeparatorDatatypeTarget.errors[0].datatype, 'sep[","]');

  const aeonInvalidKadotMetadata = planOk('create $.inventory.badKadot with :kadot[.], ^1.2.3', namespace);
  const aeonInvalidKadotMetadataTarget = validateMutationPlanTarget(aeonInvalidKadotMetadata.plan, 'aeon');
  assert.equal(aeonInvalidKadotMetadataTarget.ok, false);
  assert.equal(aeonInvalidKadotMetadataTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonInvalidKadotMetadataTarget.errors[0].targetFormat, 'aeon');
  assert.equal(aeonInvalidKadotMetadataTarget.errors[0].datatype, 'kadot[.]');

  const tupleIncompatible = planOk('create $.inventory.pair with :tuple, ("sku", 7)', namespace);
  const tupleTarget = validateMutationPlanTarget(tupleIncompatible.plan, 'json');
  assert.equal(tupleTarget.ok, false);
  assert.equal(tupleTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(tupleTarget.errors[0].targetFormat, 'json');
  assert.equal(tupleTarget.errors[0].datatype, 'tuple');

  const nodeIncompatible = planOk('create $.inventory.badge with :node, <badge("new", 3)>', namespace);
  const nodeTarget = validateMutationPlanTarget(nodeIncompatible.plan, 'json');
  assert.equal(nodeTarget.ok, false);
  assert.equal(nodeTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(nodeTarget.errors[0].targetFormat, 'json');
  assert.equal(nodeTarget.errors[0].datatype, 'node');

  const referenceIncompatible = planOk('create $.inventory.copy with :number, ~target', namespace);
  const referenceTarget = validateMutationPlanTarget(referenceIncompatible.plan, 'json');
  assert.equal(referenceTarget.ok, false);
  assert.equal(referenceTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(referenceTarget.errors[0].targetFormat, 'json');
  assert.equal(referenceTarget.errors[0].datatype, 'cloneReference');

  const aeonParameterizedObject = planOk('create $.inventory.settingsGeneric with :object<node>, { enabled = true }', namespace);
  const aeonParameterizedObjectTarget = validateMutationPlanTarget(aeonParameterizedObject.plan, 'aeon');
  assert.equal(aeonParameterizedObjectTarget.ok, true, JSON.stringify(aeonParameterizedObjectTarget.errors ?? []));

  const aeonParameterizedTuple = planOk('create $.inventory.pairGeneric with :tuple<string>, ("sku", "A-100")', namespace);
  const aeonParameterizedTupleTarget = validateMutationPlanTarget(aeonParameterizedTuple.plan, 'aeon');
  assert.equal(aeonParameterizedTupleTarget.ok, true, JSON.stringify(aeonParameterizedTupleTarget.errors ?? []));

  const aeonParameterizedNode = planOk('create $.inventory.badgeGeneric with :node<node>, <badge(<label("new")>)>', namespace);
  const aeonParameterizedNodeTarget = validateMutationPlanTarget(aeonParameterizedNode.plan, 'aeon');
  assert.equal(aeonParameterizedNodeTarget.ok, true, JSON.stringify(aeonParameterizedNodeTarget.errors ?? []));

  const aeonCustomNodeProfile = planOk('create $.inventory.htmlDoc with :node<html>, <html(<body>)>', namespace);
  const aeonCustomNodeProfileTarget = validateMutationPlanTarget(aeonCustomNodeProfile.plan, 'aeon');
  assert.equal(aeonCustomNodeProfileTarget.ok, true, JSON.stringify(aeonCustomNodeProfileTarget.errors ?? []));

  const aeonReservedNodeChildClaim = planOk('create $.inventory.badNodeString with :node<string>, <title("Hello")>', namespace);
  const aeonReservedNodeChildClaimTarget = validateMutationPlanTarget(aeonReservedNodeChildClaim.plan, 'aeon');
  assert.equal(aeonReservedNodeChildClaimTarget.ok, false);
  assert.equal(aeonReservedNodeChildClaimTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(aeonReservedNodeChildClaimTarget.errors[0].targetFormat, 'aeon');
  assert.equal(aeonReservedNodeChildClaimTarget.errors[0].datatype, 'node<string>');
});

test('preserves instruction lower and mutate plan failure phases', () => {
  const namespace = sampleNamespace();

  planBad('from $.inventory.items.*\nreplace .missing with "x"', namespace, 'lower', 'SANSA_INSTRUCTION_TARGET_MISS');

  const failedRequire = planBad([
    'from $.inventory.items.*',
    'require .qty == 0',
    'replace .qty with :int32, 10',
  ].join('\n'), namespace, 'plan', 'SANSA_MUTATE_PRECONDITION_FAILED');
  assert.deepEqual(failedRequire.loweredRequest.preconditions.map((precondition) => precondition.target), [
    '$.inventory.items[0]',
    '$.inventory.items[1]',
  ]);

  const duplicate = planBad([
    'from $.inventory.items.*',
    'create sku with "duplicate"',
  ].join('\n'), namespace, 'plan', 'SANSA_MUTATE_TARGET_EXISTS');
  assert.deepEqual(duplicate.loweredRequest, [
    { op: 'create', parent: '$.inventory.items[0]', name: 'sku', kind: 'string', value: 'duplicate' },
    { op: 'create', parent: '$.inventory.items[1]', name: 'sku', kind: 'string', value: 'duplicate' },
  ]);

  planBad('from $.inventory.items.*\nremove .missing', namespace, 'lower', 'SANSA_INSTRUCTION_TARGET_MISS');
  planBad('from $.inventory.items.*\nappend .sku with "x"', namespace, 'plan', 'SANSA_MUTATE_CONTAINER_NOT_ORDERED');
  planBad('from $.inventory.items.*\ninsert after .tags[99] in .tags with "x"', namespace, 'lower', 'SANSA_INSTRUCTION_TARGET_MISS');
  planBad('insert before $.inventory.otherTags[0] in $.inventory.items[0].tags with "x"', namespace, 'plan', 'SANSA_MUTATE_INVALID_ANCHOR');
  planBad('from $.inventory.items.*\nmove .tags[99] first in .tags', namespace, 'lower', 'SANSA_INSTRUCTION_TARGET_MISS');
  planBad('from $.inventory.items.*\nmove .sku first in .sku', namespace, 'plan', 'SANSA_MUTATE_CONTAINER_NOT_ORDERED');
  planBad('move $.inventory.items[0].tags[0] last in $.inventory.otherTags', namespace, 'plan', 'SANSA_MUTATE_INVALID_MOVE_CONTAINER');
  planBad(
    'move $.inventory.items[0].tags[0] before $.inventory.items[0].tags[0] in $.inventory.items[0].tags',
    namespace,
    'plan',
    'SANSA_MUTATE_INVALID_MOVE_ANCHOR',
  );
});

test('rejects invalid instruction parse seeds', () => {
  parseBad('', 'SANSA_INSTRUCTION_EMPTY');
  parseBad('from $.inventory.items.*', 'SANSA_INSTRUCTION_EXPECTED_MUTATION');
  parseBad('rename $.inventory.sku to code', 'SANSA_INSTRUCTION_UNSUPPORTED_VERB');
  parseBad('create $.inventory.status, "active"', 'SANSA_INSTRUCTION_EXPECTED_WITH');
  parseBad('from $.items.*\norder by .sku\nreplace .qty with 1', 'SANSA_INSTRUCTION_UNSUPPORTED_QUERY_CLAUSE');
  parseBad('from $.a\nfrom $.b\nreplace .qty with 1', 'SANSA_INSTRUCTION_DUPLICATE_CLAUSE');
  parseBad('because "one"\nbecause "two"\nreplace $.qty with 1', 'SANSA_INSTRUCTION_DUPLICATE_CLAUSE');
  parseBad('by "Bob"\nbecause "manual correction"\nreplace $.qty with 1', 'SANSA_INSTRUCTION_INVALID_CLAUSE_ORDER');
  parseBad('because Bob\nreplace $.qty with 1', 'SANSA_INSTRUCTION_EXPECTED_BECAUSE_TEXT');
  parseBad('by\nreplace $.qty with 1', 'SANSA_INSTRUCTION_EXPECTED_BY_TEXT');
  parseBad('from $.a\nrequire\nreplace .qty with 1', 'SANSA_INSTRUCTION_EXPECTED_REQUIRE_EXPRESSION');
  parseBad('replace .qty with 10\nremove .oldQty', 'SANSA_INSTRUCTION_MULTIPLE_MUTATION_VERBS');
  parseBad('create $.inventory.status with "active"\ncreate $.inventory.flag with true', 'SANSA_INSTRUCTION_MULTIPLE_MUTATION_VERBS');
  parseBad('insert "sale" after $.tags[1]', 'SANSA_INSTRUCTION_EXPECTED_WITH');
  parseBad('replace $.inventory.qty with .other', 'SANSA_INSTRUCTION_INVALID_VALUE_LITERAL');
  parseBad('replace $.qty with 1 /* unterminated', 'SANSA_INSTRUCTION_UNTERMINATED_BLOCK_COMMENT');
  parseBad('create "" with "x"', 'SANSA_INSTRUCTION_INVALID_CREATE_DESTINATION');
  parseBad('create "display" extra with "x"', 'SANSA_INSTRUCTION_INVALID_CREATE_DESTINATION');
  parseBad('create $.x with :object, { enabled = true', 'SANSA_INSTRUCTION_INVALID_VALUE_LITERAL');
  parseBad('create $.x with :object, { enabled = true enabled = false }', 'SANSA_INSTRUCTION_DUPLICATE_OBJECT_FIELD');
  parseBad('create $.x with :list, ["a", , "b"]', 'SANSA_INSTRUCTION_EXPECTED_VALUE');
  parseBad('create $.x with :tuple, ("a", )', 'SANSA_INSTRUCTION_EXPECTED_VALUE');
  parseBad('create $.x with :string,', 'SANSA_INSTRUCTION_EXPECTED_VALUE');
  parseBad('create $.x with :object, { label = :string, }', 'SANSA_INSTRUCTION_EXPECTED_VALUE');
  parseBad('create $.x with :node, <123("a")>', 'SANSA_INSTRUCTION_INVALID_NODE_LITERAL');
  parseBad('create $.x with :list<string|number>, [1]', 'SANSA_INSTRUCTION_INVALID_DATATYPE');
  parseBad('replace $.x with lower("A")', 'SANSA_INSTRUCTION_INVALID_VALUE_LITERAL');
  parseBad('replace $.x with "a" in $.list.*', 'SANSA_INSTRUCTION_INVALID_VALUE_LITERAL');
  parseBad('create $.x with :sep, ^root/main', 'SANSA_QUERY_INVALID_SEPARATOR_LITERAL');
  parseBad('create $.x with :date, 2025-02-29', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
  parseBad('create $.x with :time, 24:00', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
  parseBad('create $.x with :zrut, 2025-01-01T09Z&Europe//Brussels', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
});

test('surfaces initial lowering boundary diagnostics', () => {
  lowerBad('create $.tags[2] with "sale"', 'SANSA_INSTRUCTION_CREATE_DESTINATION_NOT_MEMBER');
  lowerBad('create $.inventory.("display*") with "Adapter"', 'SANSA_INSTRUCTION_CREATE_DESTINATION_NOT_MEMBER');
  lowerBad('from $.inventory\ncreate status with "active"', 'SANSA_INSTRUCTION_LOWERING_REQUIRES_NAMESPACE');
  lowerBad('from $.inventory.items.*\nreplace .missing with "x"', 'SANSA_INSTRUCTION_TARGET_MISS', sampleNamespace());
});

test('surfaces direct require precondition failures during planning', () => {
  planBad([
    'require $.inventory.items[0].sku == "Z-999"',
    'replace $.inventory.items[0].sku with "A-101"',
  ].join('\n'), sampleNamespace(), 'plan', 'SANSA_MUTATE_PRECONDITION_FAILED');
});
