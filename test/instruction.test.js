import assert from 'node:assert/strict';
import test from 'node:test';
import { lowerInstruction, parseInstruction } from '../src/index.js';

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

  const selector = parseOk('replace $.inventory.selector with :sansa, $.inventory.items.*:number');
  assert.equal(selector.mutation.value.datatype, 'sansa');
  assert.equal(selector.mutation.value.kind, 'sansa');
  assert.equal(selector.mutation.value.value, '$.inventory.items.*:number');

  const csv = parseOk('create $.inventory.format with :csv[","], "sku,name"');
  assert.equal(csv.mutation.value.datatype, 'csv[","]');
  assert.equal(csv.mutation.value.kind, 'string');
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
