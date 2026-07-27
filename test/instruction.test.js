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

  const move = parseOk('move $.tags[0] after $.tags[2] in $.tags');
  assert.equal(move.mutation.verb, 'move');
  assert.equal(move.mutation.source.address.canonical, '$.tags[0]');
  assert.equal(move.mutation.placement.kind, 'after');
});

test('parses candidate-relative instruction clauses', () => {
  const instruction = parseOk([
    'from $.inventory.items.*',
    'where .qty == 0',
    'replace .qty with :int32, 10',
  ].join('\n'));

  assert.equal(instruction.from.address.canonical, '$.inventory.items.*');
  assert.equal(instruction.where.expression, '.qty == 0');
  assert.equal(instruction.mutation.target.address.canonical, '?.qty');
  assert.equal(instruction.canonical, [
    'from $.inventory.items.*',
    'where .qty == 0',
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

  const list = parseOk('create $.types.aliases with :list<string>, ["adapter", "driver"]');
  assert.equal(list.mutation.value.datatype, 'list<string>');
  assert.equal(list.mutation.value.kind, 'list');
  assert.deepEqual(list.mutation.value.value, ['adapter', 'driver']);

  const tuple = parseOk('create $.types.pairing with :tuple, ("sku", 7)');
  assert.equal(tuple.mutation.value.datatype, 'tuple');
  assert.equal(tuple.mutation.value.kind, 'tuple');
  assert.deepEqual(tuple.mutation.value.value, ['sku', 7]);

  const node = parseOk('create $.types.badge with :node, <badge("new", 3)>');
  assert.equal(node.mutation.value.datatype, 'node');
  assert.equal(node.mutation.value.kind, 'node');
  assert.deepEqual(node.mutation.value.value, { tag: 'badge', children: ['new', 3] });
});

test('lowers direct instructions to mutate request operations', () => {
  assert.deepEqual(lowerOk('create $.inventory.status with "active"'), {
    op: 'create',
    parent: '$.inventory',
    name: 'status',
    kind: 'string',
    value: 'active',
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

  assert.deepEqual(lowerOk('move $.tags[0] after $.tags[2] in $.tags'), {
    op: 'move',
    source: '$.tags[0]',
    container: '$.tags',
    placement: { kind: 'after', anchor: '$.tags[2]' },
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
});

test('validates instruction plans against target surfaces after planning', () => {
  const namespace = sampleNamespace();

  const compatible = planOk('replace $.inventory.items[0].sku with "B-200"', namespace);
  const compatibleTarget = validateMutationPlanTarget(compatible.plan, 'aeon');
  assert.equal(compatibleTarget.ok, true, JSON.stringify(compatibleTarget.errors ?? []));

  const jsonIncompatible = planOk('create $.inventory.selectorProbe with :sansa, $.inventory.items.*', namespace);
  const jsonTarget = validateMutationPlanTarget(jsonIncompatible.plan, 'json');
  assert.equal(jsonTarget.ok, false);
  assert.equal(jsonTarget.errors[0].phase, 'target');
  assert.equal(jsonTarget.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');
  assert.equal(jsonTarget.errors[0].targetFormat, 'json');
  assert.equal(jsonTarget.errors[0].datatype, 'sansa');
});

test('preserves instruction lower and mutate plan failure phases', () => {
  const namespace = sampleNamespace();

  planBad('from $.inventory.items.*\nreplace .missing with "x"', namespace, 'lower', 'SANSA_INSTRUCTION_TARGET_MISS');

  const duplicate = planBad([
    'from $.inventory.items.*',
    'create sku with "duplicate"',
  ].join('\n'), namespace, 'plan', 'SANSA_MUTATE_TARGET_EXISTS');
  assert.deepEqual(duplicate.loweredRequest, [
    { op: 'create', parent: '$.inventory.items[0]', name: 'sku', kind: 'string', value: 'duplicate' },
    { op: 'create', parent: '$.inventory.items[1]', name: 'sku', kind: 'string', value: 'duplicate' },
  ]);
});

test('rejects invalid instruction parse seeds', () => {
  parseBad('', 'SANSA_INSTRUCTION_EMPTY');
  parseBad('from $.inventory.items.*', 'SANSA_INSTRUCTION_EXPECTED_MUTATION');
  parseBad('rename $.inventory.sku to code', 'SANSA_INSTRUCTION_UNSUPPORTED_VERB');
  parseBad('create $.inventory.status, "active"', 'SANSA_INSTRUCTION_EXPECTED_WITH');
  parseBad('from $.items.*\norder by .sku\nreplace .qty with 1', 'SANSA_INSTRUCTION_UNSUPPORTED_QUERY_CLAUSE');
  parseBad('from $.a\nfrom $.b\nreplace .qty with 1', 'SANSA_INSTRUCTION_DUPLICATE_CLAUSE');
  parseBad('replace .qty with 10\nremove .oldQty', 'SANSA_INSTRUCTION_MULTIPLE_MUTATION_VERBS');
  parseBad('insert "sale" after $.tags[1]', 'SANSA_INSTRUCTION_EXPECTED_WITH');
  parseBad('replace $.inventory.qty with .other', 'SANSA_INSTRUCTION_INVALID_VALUE_LITERAL');
});

test('surfaces initial lowering boundary diagnostics', () => {
  lowerBad('create $.tags[2] with "sale"', 'SANSA_INSTRUCTION_CREATE_DESTINATION_NOT_MEMBER');
  lowerBad('from $.inventory\ncreate status with "active"', 'SANSA_INSTRUCTION_LOWERING_REQUIRES_NAMESPACE');
  lowerBad('from $.inventory.items.*\nreplace .missing with "x"', 'SANSA_INSTRUCTION_TARGET_MISS', sampleNamespace());
});
