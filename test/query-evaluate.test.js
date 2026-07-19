import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateQuery } from '../src/index.js';

function binding({
  address,
  name,
  index,
  semanticType,
  representationKind,
  scalarKind,
  nullReason,
  value,
  children = [],
}) {
  return {
    address,
    ...(name === undefined ? {} : { name }),
    ...(index === undefined ? {} : { index }),
    ...(semanticType === undefined ? {} : { semanticType }),
    ...(representationKind === undefined ? {} : { representationKind }),
    ...(scalarKind === undefined ? {} : { scalarKind }),
    ...(nullReason === undefined ? {} : { nullReason }),
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
    binding({ name: 'status', address: '$.inventory.items[0].status', semanticType: 'null<string>', representationKind: 'null', scalarKind: 'null', nullReason: 'notSet', value: null }),
    binding({ name: 'metric', address: '$.inventory.items[0].metric', semanticType: 'number', representationKind: 'number', value: 10 }),
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
    binding({ name: 'status', address: '$.inventory.items[1].status', semanticType: 'string', representationKind: 'string', value: 'active' }),
    binding({ name: 'id', address: '$.inventory.items[1].id', semanticType: 'string', representationKind: 'string', value: '4' }),
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
    binding({ name: 'metric', address: '$.inventory.items[2].metric', semanticType: 'nan<number>', representationKind: 'nan', scalarKind: 'nan', value: Number.NaN }),
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
    binding({ name: 'status', address: '$.inventory.items[3].status', semanticType: 'null<string>', representationKind: 'null', scalarKind: 'null', nullReason: 'notApplicable', value: null }),
    binding({ name: 'id', address: '$.inventory.items[3].id', semanticType: 'number', representationKind: 'number', value: 3 }),
    binding({ name: 'ceiling', address: '$.inventory.items[3].ceiling', semanticType: 'infinity<number>', representationKind: 'infinity', scalarKind: 'infinity', value: Infinity }),
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
  assert.deepEqual(result.results.map((entry) => entry.type), ['queryResult']);
  assert.deepEqual(result.results.map((entry) => entry.address), ['$.inventory.items[1]']);
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
  assert.equal(result.errors[0].phase, 'where');
  assert.equal(result.errors[0].candidateAddress, '$.inventory.items[0]');
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

test('distinguishes missing bindings from explicit null values', () => {
  const nullStatuses = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.status) and isNull(.status)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(nullStatuses.ok, true, JSON.stringify(nullStatuses.errors ?? []));
  assert.deepEqual(nullStatuses.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0]',
    '$.inventory.items[3]',
  ]);

  const notSetStatus = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.status) and isNullReason(.status, "notSet")',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(notSetStatus.ok, true, JSON.stringify(notSetStatus.errors ?? []));
  assert.deepEqual(notSetStatus.results.map((entry) => entry.binding.address), ['$.inventory.items[0]']);

  const missingStatus = evaluateQuery([
    'from $.inventory.items.*',
    'where absent(.status)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(missingStatus.ok, true, JSON.stringify(missingStatus.errors ?? []));
  assert.deepEqual(missingStatus.results.map((entry) => entry.binding.address), ['$.inventory.items[2]']);

  const unguardedMissingStatus = evaluateQuery([
    'from $.inventory.items[2]',
    'where isNull(.status)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(unguardedMissingStatus.ok, false);
  assert.equal(unguardedMissingStatus.errors[0].code, 'SANSA_QUERY_EVALUATE_MISSING_SCALAR');
});

test('evaluates NaN and Infinity predicates explicitly', () => {
  const nanMetric = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.metric) and isNaN(.metric)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(nanMetric.ok, true, JSON.stringify(nanMetric.errors ?? []));
  assert.deepEqual(nanMetric.results.map((entry) => entry.binding.address), ['$.inventory.items[2]']);

  const infiniteCeiling = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.ceiling) and isInfinity(.ceiling)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(infiniteCeiling.ok, true, JSON.stringify(infiniteCeiling.errors ?? []));
  assert.deepEqual(infiniteCeiling.results.map((entry) => entry.binding.address), ['$.inventory.items[3]']);

  const infinityComparison = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.ceiling%infinity) and .ceiling > 1000000',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(infinityComparison.ok, true, JSON.stringify(infinityComparison.errors ?? []));
  assert.deepEqual(infinityComparison.results.map((entry) => entry.binding.address), ['$.inventory.items[3]']);
});

test('rejects NaN in scalar comparison and ordering', () => {
  const comparison = evaluateQuery([
    'from $.inventory.items[2]',
    'where .metric == .metric',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(comparison.ok, false);
  assert.equal(comparison.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const order = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.metric)',
    'order by .metric asc',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(order.ok, false);
  assert.equal(order.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');
  assert.equal(order.errors[0].phase, 'order');
  assert.equal(order.errors[0].candidateAddress, '$.inventory.items[2]');
});

test('follows the comparison policy matrix', () => {
  const numberComparison = evaluateQuery([
    'from $.inventory.items[0]',
    'where .qty < 2',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(numberComparison.ok, true, JSON.stringify(numberComparison.errors ?? []));
  assert.deepEqual(numberComparison.results.map((entry) => entry.binding.address), ['$.inventory.items[0]']);

  const stringEquality = evaluateQuery([
    'from $.inventory.items.*',
    'where .sku == "B-200"',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(stringEquality.ok, true, JSON.stringify(stringEquality.errors ?? []));
  assert.deepEqual(stringEquality.results.map((entry) => entry.binding.address), ['$.inventory.items[1]']);

  const booleanEquality = evaluateQuery([
    'from $.inventory.items.*',
    'where .active == false',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(booleanEquality.ok, true, JSON.stringify(booleanEquality.errors ?? []));
  assert.deepEqual(booleanEquality.results.map((entry) => entry.binding.address), [
    '$.inventory.items[2]',
    '$.inventory.items[3]',
  ]);

  const infinityComparison = evaluateQuery([
    'from $.inventory.items[3]',
    'where .ceiling > 1000000',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(infinityComparison.ok, true, JSON.stringify(infinityComparison.errors ?? []));
  assert.deepEqual(infinityComparison.results.map((entry) => entry.binding.address), ['$.inventory.items[3]']);

  const nullComparison = evaluateQuery([
    'from $.inventory.items[0]',
    'where .status == .status',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(nullComparison.ok, false);
  assert.equal(nullComparison.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const booleanOrdering = evaluateQuery([
    'from $.inventory.items[0]',
    'where .active > false',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(booleanOrdering.ok, false);
  assert.equal(booleanOrdering.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');
});

test('uses semantic filters as comparison guards', () => {
  const guarded = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.id#number) and .id > 2',
    'select { sku = .sku name = .name }',
  ].join('\n'), namespace);
  assert.equal(guarded.ok, true, JSON.stringify(guarded.errors ?? []));
  assert.deepEqual(guarded.results.map((entry) => entry.binding.address), ['$.inventory.items[3]']);
  assert.deepEqual(guarded.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        sku: 'D-250',
        name: 'Driver',
      },
    },
  ]);

  const unguarded = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.id) and .id > 2',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(unguarded.ok, false);
  assert.equal(unguarded.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');
});

test('short-circuits boolean evaluation', () => {
  const andResult = evaluateQuery([
    'from $.inventory.items[2]',
    'where .active == true and .deletedAt == "never evaluated"',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(andResult.ok, true, JSON.stringify(andResult.errors ?? []));
  assert.equal(andResult.results.length, 0);

  const orResult = evaluateQuery([
    'from $.inventory.items[0]',
    'where .active == true or .deletedAt == "never evaluated"',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(orResult.ok, true, JSON.stringify(orResult.errors ?? []));
  assert.deepEqual(orResult.results.map((entry) => entry.binding.address), ['$.inventory.items[0]']);
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

test('applies ordinary function argument semantics', () => {
  const missing = evaluateQuery([
    'from $.inventory.items[0]',
    'select lower(.deletedAt)',
  ].join('\n'), namespace);
  assert.equal(missing.ok, false);
  assert.equal(missing.errors[0].code, 'SANSA_QUERY_EVALUATE_MISSING_SCALAR');

  const cardinality = evaluateQuery([
    'from $.inventory.items[0]',
    'select lower(.roles.*)',
  ].join('\n'), namespace);
  assert.equal(cardinality.ok, false);
  assert.equal(cardinality.errors[0].code, 'SANSA_QUERY_EVALUATE_CARDINALITY');

  const explicitNull = evaluateQuery([
    'from $.inventory.items[0]',
    'select lower(.status)',
  ].join('\n'), namespace);
  assert.equal(explicitNull.ok, false);
  assert.equal(explicitNull.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const nan = evaluateQuery([
    'from $.inventory.items[2]',
    'select lower(.metric)',
  ].join('\n'), namespace);
  assert.equal(nan.ok, false);
  assert.equal(nan.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const infinity = evaluateQuery([
    'from $.inventory.items[3]',
    'select lower(.ceiling)',
  ].join('\n'), namespace);
  assert.equal(infinity.ok, false);
  assert.equal(infinity.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
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
