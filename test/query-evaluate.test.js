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
    binding({ name: 'qty', address: '$.inventory.items[0].qty', semanticType: 'number', representationKind: 'number', value: 1 }),
    binding({ name: 'active', address: '$.inventory.items[0].active', semanticType: 'boolean', representationKind: 'boolean', value: true }),
  ],
});

const item1 = binding({
  index: 1,
  address: '$.inventory.items[1]',
  representationKind: 'object',
  children: [
    binding({ name: 'sku', address: '$.inventory.items[1].sku', semanticType: 'string', representationKind: 'string', value: 'B-200' }),
    binding({ name: 'qty', address: '$.inventory.items[1].qty', semanticType: 'number', representationKind: 'number', value: 4 }),
    binding({ name: 'active', address: '$.inventory.items[1].active', semanticType: 'boolean', representationKind: 'boolean', value: true }),
  ],
});

const item2 = binding({
  index: 2,
  address: '$.inventory.items[2]',
  representationKind: 'object',
  children: [
    binding({ name: 'sku', address: '$.inventory.items[2].sku', semanticType: 'string', representationKind: 'string', value: 'C-300' }),
    binding({ name: 'qty', address: '$.inventory.items[2].qty', semanticType: 'number', representationKind: 'number', value: 8 }),
    binding({ name: 'active', address: '$.inventory.items[2].active', semanticType: 'boolean', representationKind: 'boolean', value: false }),
  ],
});

const item3 = binding({
  index: 3,
  address: '$.inventory.items[3]',
  representationKind: 'object',
  children: [
    binding({ name: 'sku', address: '$.inventory.items[3].sku', semanticType: 'string', representationKind: 'string', value: 'D-250' }),
    binding({ name: 'qty', address: '$.inventory.items[3].qty', semanticType: 'number', representationKind: 'number', value: 4 }),
    binding({ name: 'active', address: '$.inventory.items[3].active', semanticType: 'boolean', representationKind: 'boolean', value: false }),
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

test('rejects unsupported evaluator features explicitly', () => {
  const called = evaluateQuery('from $.inventory.items.*\nselect contains(.sku, "B")', namespace);
  assert.equal(called.ok, false);
  assert.equal(called.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION');

  const cardinality = evaluateQuery('from $.inventory.items.*\nselect any(.sku == "B-200")', namespace);
  assert.equal(cardinality.ok, false);
  assert.equal(cardinality.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_CARDINALITY');
});

test('rejects non-boolean where expressions', () => {
  const result = evaluateQuery('from $.inventory.items.*\nwhere .sku\nselect .sku', namespace);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN');
});
