import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateQuery } from '../src/index.js';

function binding({
  address,
  name,
  index,
  semanticType,
  representationKind,
  value,
  children = [],
}) {
  return {
    address,
    ...(name === undefined ? {} : { name }),
    ...(index === undefined ? {} : { index }),
    ...(semanticType === undefined ? {} : { semanticType }),
    ...(representationKind === undefined ? {} : { representationKind }),
    ...(value === undefined ? {} : { value }),
    children,
  };
}

const item0 = binding({
  index: 0,
  address: '$.inventory.items[0]',
  representationKind: 'object',
  children: [
    binding({ name: 'sku', address: '$.inventory.items[0].sku', semanticType: 'string', representationKind: 'string', value: 'A-100' }),
    binding({ name: 'name', address: '$.inventory.items[0].name', semanticType: 'string', representationKind: 'string', value: 'Adapter' }),
    binding({ name: 'qty', address: '$.inventory.items[0].qty', semanticType: 'number', representationKind: 'number', value: 1 }),
    binding({ name: 'active', address: '$.inventory.items[0].active', semanticType: 'boolean', representationKind: 'boolean', value: true }),
    binding({
      name: 'roles',
      address: '$.inventory.items[0].roles',
      representationKind: 'list',
      children: [
        binding({ index: 0, address: '$.inventory.items[0].roles[0]', semanticType: 'string', representationKind: 'string', value: 'admin' }),
        binding({ index: 1, address: '$.inventory.items[0].roles[1]', semanticType: 'string', representationKind: 'string', value: 'user' }),
      ],
    }),
  ],
});

const item1 = binding({
  index: 1,
  address: '$.inventory.items[1]',
  representationKind: 'object',
  children: [
    binding({ name: 'sku', address: '$.inventory.items[1].sku', semanticType: 'string', representationKind: 'string', value: 'B-200' }),
    binding({ name: 'name', address: '$.inventory.items[1].name', semanticType: 'string', representationKind: 'string', value: 'Bracket' }),
    binding({ name: 'qty', address: '$.inventory.items[1].qty', semanticType: 'number', representationKind: 'number', value: 4 }),
    binding({ name: 'active', address: '$.inventory.items[1].active', semanticType: 'boolean', representationKind: 'boolean', value: true }),
    binding({
      name: 'roles',
      address: '$.inventory.items[1].roles',
      representationKind: 'list',
      children: [
        binding({ index: 0, address: '$.inventory.items[1].roles[0]', semanticType: 'string', representationKind: 'string', value: 'user' }),
      ],
    }),
  ],
});

const item2 = binding({
  index: 2,
  address: '$.inventory.items[2]',
  representationKind: 'object',
  children: [
    binding({ name: 'sku', address: '$.inventory.items[2].sku', semanticType: 'string', representationKind: 'string', value: 'C-300' }),
    binding({ name: 'name', address: '$.inventory.items[2].name', semanticType: 'string', representationKind: 'string', value: 'Coupler' }),
    binding({ name: 'qty', address: '$.inventory.items[2].qty', semanticType: 'number', representationKind: 'number', value: 8 }),
    binding({ name: 'active', address: '$.inventory.items[2].active', semanticType: 'boolean', representationKind: 'boolean', value: false }),
    binding({ name: 'roles', address: '$.inventory.items[2].roles', representationKind: 'list' }),
  ],
});

const item3 = binding({
  index: 3,
  address: '$.inventory.items[3]',
  representationKind: 'object',
  children: [
    binding({ name: 'sku', address: '$.inventory.items[3].sku', semanticType: 'string', representationKind: 'string', value: 'D-250' }),
    binding({ name: 'name', address: '$.inventory.items[3].name', semanticType: 'string', representationKind: 'string', value: 'Driver' }),
    binding({ name: 'qty', address: '$.inventory.items[3].qty', semanticType: 'number', representationKind: 'number', value: 4 }),
    binding({ name: 'active', address: '$.inventory.items[3].active', semanticType: 'boolean', representationKind: 'boolean', value: false }),
    binding({
      name: 'roles',
      address: '$.inventory.items[3].roles',
      representationKind: 'list',
      children: [
        binding({ index: 0, address: '$.inventory.items[3].roles[0]', semanticType: 'string', representationKind: 'string', value: 'admin' }),
        binding({ index: 1, address: '$.inventory.items[3].roles[1]', semanticType: 'string', representationKind: 'string', value: 'admin' }),
      ],
    }),
  ],
});

const root = binding({
  address: '$',
  representationKind: 'object',
  children: [
    binding({
      name: 'inventory',
      address: '$.inventory',
      representationKind: 'object',
      children: [
        binding({
          name: 'items',
          address: '$.inventory.items',
          representationKind: 'list',
          children: [item0, item1, item2, item3],
        }),
      ],
    }),
  ],
});

const namespace = {
  root,
  children: (entry) => entry.children,
};

test('evaluates query projection over filtered bindings', () => {
  const result = evaluateQuery([
    'from $.inventory.items.*',
    'where .qty >= 2 and .active == true',
    'select { sku = .sku qty = .qty }',
  ].join('\n'), namespace);

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(result.results.map((entry) => entry.binding.address), ['$.inventory.items[1]']);
  assert.deepEqual(result.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        sku: 'B-200',
        qty: 4,
      },
    },
  ]);
});

test('evaluates offset and limit after filtering', () => {
  const result = evaluateQuery([
    'from $.inventory.items.*',
    'where .qty >= 1',
    'offset 1',
    'limit 1',
    'select .sku',
  ].join('\n'), namespace);

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(result.results.map((entry) => entry.binding.address), ['$.inventory.items[1]']);
  assert.deepEqual(result.results.map((entry) => entry.value.bindings.map((binding) => binding.address)), [
    ['$.inventory.items[1].sku'],
  ]);
});

test('evaluates stable order by before offset and limit', () => {
  const result = evaluateQuery([
    'from $.inventory.items.*',
    'order by .qty desc',
    'offset 1',
    'limit 2',
    'select .sku',
  ].join('\n'), namespace);

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(result.results.map((entry) => entry.binding.address), [
    '$.inventory.items[1]',
    '$.inventory.items[3]',
  ]);
  assert.deepEqual(result.results.map((entry) => entry.value.bindings.map((binding) => binding.address)), [
    ['$.inventory.items[1].sku'],
    ['$.inventory.items[3].sku'],
  ]);
});

test('rejects non-boolean where expressions', () => {
  const result = evaluateQuery('from $.inventory.items.*\nwhere .sku\nselect .sku', namespace);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN');
});

test('evaluates any all and none cardinality predicates', () => {
  const anyAdmin = evaluateQuery([
    'from $.inventory.items.*',
    'where any(.roles.* == "admin")',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(anyAdmin.ok, true, JSON.stringify(anyAdmin.errors ?? []));
  assert.deepEqual(anyAdmin.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0]',
    '$.inventory.items[3]',
  ]);

  const allAdmin = evaluateQuery([
    'from $.inventory.items.*',
    'where all(.roles.* == "admin")',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(allAdmin.ok, true, JSON.stringify(allAdmin.errors ?? []));
  assert.deepEqual(allAdmin.results.map((entry) => entry.binding.address), [
    '$.inventory.items[2]',
    '$.inventory.items[3]',
  ]);

  const noneAdmin = evaluateQuery([
    'from $.inventory.items.*',
    'where none(.roles.* == "admin")',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(noneAdmin.ok, true, JSON.stringify(noneAdmin.errors ?? []));
  assert.deepEqual(noneAdmin.results.map((entry) => entry.binding.address), [
    '$.inventory.items[1]',
    '$.inventory.items[2]',
  ]);
});

test('evaluates exists and absent presence predicates', () => {
  const existingRoles = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.roles)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(existingRoles.ok, true, JSON.stringify(existingRoles.errors ?? []));
  assert.deepEqual(existingRoles.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0]',
    '$.inventory.items[1]',
    '$.inventory.items[2]',
    '$.inventory.items[3]',
  ]);

  const emptyRoles = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.roles) and absent(.roles.*)',
    'select { sku = .sku name = .name }',
  ].join('\n'), namespace);
  assert.equal(emptyRoles.ok, true, JSON.stringify(emptyRoles.errors ?? []));
  assert.deepEqual(emptyRoles.results.map((entry) => entry.binding.address), ['$.inventory.items[2]']);
  assert.deepEqual(emptyRoles.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        sku: 'C-300',
        name: 'Coupler',
      },
    },
  ]);

  const missingField = evaluateQuery([
    'from $.inventory.items.*',
    'where absent(.deletedAt)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(missingField.ok, true, JSON.stringify(missingField.errors ?? []));
  assert.deepEqual(missingField.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0]',
    '$.inventory.items[1]',
    '$.inventory.items[2]',
    '$.inventory.items[3]',
  ]);
});

test('evaluates built-in string functions', () => {
  const filtered = evaluateQuery([
    'from $.inventory.items.*',
    'where contains(.sku, "B")',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(filtered.ok, true, JSON.stringify(filtered.errors ?? []));
  assert.deepEqual(filtered.results.map((entry) => entry.binding.address), ['$.inventory.items[1]']);

  const projected = evaluateQuery([
    'from $.inventory.items.*',
    'where startsWith(.sku, "A") or startsWith(.sku, "B")',
    'select { code = lower(.sku) label = concat("item:", .sku) }',
  ].join('\n'), namespace);
  assert.equal(projected.ok, true, JSON.stringify(projected.errors ?? []));
  assert.deepEqual(projected.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        code: 'a-100',
        label: 'item:A-100',
      },
    },
    {
      type: 'object',
      value: {
        code: 'b-200',
        label: 'item:B-200',
      },
    },
  ]);
});

test('rejects unsupported and invalid function calls explicitly', () => {
  const unsupported = evaluateQuery('from $.inventory.items.*\nselect endsWith(.sku, "B")', namespace);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION');

  const invalidArity = evaluateQuery('from $.inventory.items.*\nselect lower(.sku, "x")', namespace);
  assert.equal(invalidArity.ok, false);
  assert.equal(invalidArity.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const invalidType = evaluateQuery('from $.inventory.items.*\nselect contains(.qty, "4")', namespace);
  assert.equal(invalidType.ok, false);
  assert.equal(invalidType.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
});
