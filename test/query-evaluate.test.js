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
  localSpaces,
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
    ...(localSpaces === undefined ? {} : { localSpaces }),
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
    binding({ name: 'category', address: '$.inventory.items[0].category', semanticType: 'string', representationKind: 'string', value: 'hardware' }),
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
    binding({ name: 'category', address: '$.inventory.items[1].category', semanticType: 'string', representationKind: 'string', value: 'hardware' }),
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
    binding({ name: 'category', address: '$.inventory.items[2].category', semanticType: 'string', representationKind: 'string', value: 'hardware' }),
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
    binding({ name: 'category', address: '$.inventory.items[3].category', semanticType: 'string', representationKind: 'string', value: 'tooling' }),
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

const params = binding({
  address: '$.<"params">',
  representationKind: 'object',
  children: [
    binding({
      name: 'field',
      address: '$.<"params">.field',
      semanticType: 'sansa',
      representationKind: 'sansa',
      value: { type: 'SansaAddressLiteral', address: '?.sku' },
    }),
    binding({
      name: 'active',
      address: '$.<"params">.active',
      semanticType: 'sansa',
      representationKind: 'sansa',
      value: { type: 'SansaAddressLiteral', address: '?.active' },
    }),
    binding({
      name: 'sort',
      address: '$.<"params">.sort',
      semanticType: 'sansa',
      representationKind: 'sansa',
      value: { type: 'SansaAddressLiteral', address: '?.qty' },
    }),
    binding({
      name: 'label',
      address: '$.<"params">.label',
      semanticType: 'sansa',
      representationKind: 'sansa',
      value: { type: 'SansaAddressLiteral', address: '$.inventory.categoryLabels.tooling' },
    }),
    binding({
      name: 'source',
      address: '$.<"params">.source',
      semanticType: 'sansa',
      representationKind: 'sansa',
      value: { type: 'SansaAddressLiteral', address: '$.inventory.items.*' },
    }),
    binding({
      name: 'fieldText',
      address: '$.<"params">.fieldText',
      semanticType: 'string',
      representationKind: 'string',
      value: '?.sku',
    }),
    binding({
      name: 'sourceText',
      address: '$.<"params">.sourceText',
      semanticType: 'string',
      representationKind: 'string',
      value: '$.inventory.items.*',
    }),
    binding({
      name: 'badPath',
      address: '$.<"params">.badPath',
      semanticType: 'sansa',
      representationKind: 'sansa',
      value: { type: 'SansaAddressLiteral', address: '$.items[01]' },
    }),
  ],
});

const root = binding({
  address: '$',
  representationKind: 'object',
  localSpaces: {
    params,
  },
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
        binding({
          name: 'categoryLabels',
          address: '$.inventory.categoryLabels',
          representationKind: 'object',
          children: [
            binding({ name: 'hardware', address: '$.inventory.categoryLabels.hardware', semanticType: 'string', representationKind: 'string', value: 'Hardware' }),
            binding({ name: 'tooling', address: '$.inventory.categoryLabels.tooling', semanticType: 'string', representationKind: 'string', value: 'Tooling' }),
          ],
        }),
      ],
    }),
  ],
});

const namespace = {
  root,
  children: (entry) => entry.children,
  localSpace: (entry, name) => entry.localSpaces?.[name],
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

test('evaluates isValue as a missing-aware ordinary scalar guard', () => {
  const ordinaryStatuses = evaluateQuery([
    'from $.inventory.items.*',
    'where isValue(.status)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(ordinaryStatuses.ok, true, JSON.stringify(ordinaryStatuses.errors ?? []));
  assert.deepEqual(ordinaryStatuses.results.map((entry) => entry.binding.address), ['$.inventory.items[1]']);

  const ordinaryNumbers = evaluateQuery([
    'from $.inventory.items.*',
    'where isValue(.qty)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(ordinaryNumbers.ok, true, JSON.stringify(ordinaryNumbers.errors ?? []));
  assert.deepEqual(ordinaryNumbers.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0]',
    '$.inventory.items[1]',
    '$.inventory.items[2]',
    '$.inventory.items[3]',
  ]);

  const missingValue = evaluateQuery([
    'from $.inventory.items[2]',
    'where isValue(.status)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(missingValue.ok, true, JSON.stringify(missingValue.errors ?? []));
  assert.deepEqual(missingValue.results, []);

  const specialValues = evaluateQuery([
    'from $.inventory.items.*',
    'where isValue(.metric) or isValue(.ceiling)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(specialValues.ok, true, JSON.stringify(specialValues.errors ?? []));
  assert.deepEqual(specialValues.results.map((entry) => entry.binding.address), ['$.inventory.items[0]']);

  const containerValue = evaluateQuery([
    'from $.inventory.items[0]',
    'where isValue(.roles)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(containerValue.ok, true, JSON.stringify(containerValue.errors ?? []));
  assert.deepEqual(containerValue.results, []);

  const multipleValues = evaluateQuery([
    'from $.inventory.items[0]',
    'where isValue(.roles.*)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(multipleValues.ok, false);
  assert.equal(multipleValues.errors[0].code, 'SANSA_QUERY_EVALUATE_CARDINALITY');

  const literalValue = evaluateQuery([
    'from $.inventory.items[0]',
    'where isValue("sku")',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(literalValue.ok, true, JSON.stringify(literalValue.errors ?? []));
  assert.deepEqual(literalValue.results.map((entry) => entry.binding.address), ['$.inventory.items[0]']);
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

test('evaluates unary not over boolean expressions', () => {
  const directBoolean = evaluateQuery([
    'from $.inventory.items.*',
    'where not .active',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(directBoolean.ok, true, JSON.stringify(directBoolean.errors ?? []));
  assert.deepEqual(directBoolean.results.map((entry) => entry.binding.address), [
    '$.inventory.items[2]',
    '$.inventory.items[3]',
  ]);

  const groupedComparison = evaluateQuery([
    'from $.inventory.items.*',
    'where not (.qty >= 4)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(groupedComparison.ok, true, JSON.stringify(groupedComparison.errors ?? []));
  assert.deepEqual(groupedComparison.results.map((entry) => entry.binding.address), ['$.inventory.items[0]']);

  const missingStatus = evaluateQuery([
    'from $.inventory.items.*',
    'where not exists(.status)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(missingStatus.ok, true, JSON.stringify(missingStatus.errors ?? []));
  assert.deepEqual(missingStatus.results.map((entry) => entry.binding.address), ['$.inventory.items[2]']);
});

test('evaluates scalar membership over binding sets', () => {
  const adminRole = evaluateQuery([
    'from $.inventory.items.*',
    'where "admin" in .roles.*',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(adminRole.ok, true, JSON.stringify(adminRole.errors ?? []));
  assert.deepEqual(adminRole.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0]',
    '$.inventory.items[3]',
  ]);

  const notAdminRole = evaluateQuery([
    'from $.inventory.items.*',
    'where not ("admin" in .roles.*)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(notAdminRole.ok, true, JSON.stringify(notAdminRole.errors ?? []));
  assert.deepEqual(notAdminRole.results.map((entry) => entry.binding.address), [
    '$.inventory.items[1]',
    '$.inventory.items[2]',
  ]);

  const invalidRight = evaluateQuery([
    'from $.inventory.items[0]',
    'where "admin" in "admin"',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(invalidRight.ok, false);
  assert.equal(invalidRight.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const emptyRight = evaluateQuery([
    'from $.inventory.items[2]',
    'where "admin" in .roles.*',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(emptyRight.ok, true, JSON.stringify(emptyRight.errors ?? []));
  assert.deepEqual(emptyRight.results, []);

  const missingLeft = evaluateQuery([
    'from $.inventory.items[0]',
    'where .deletedAt in .roles.*',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(missingLeft.ok, false);
  assert.equal(missingLeft.errors[0].code, 'SANSA_QUERY_EVALUATE_MISSING_SCALAR');

  const multipleLeft = evaluateQuery([
    'from $.inventory.items[0]',
    'where .roles.* in .roles.*',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(multipleLeft.ok, false);
  assert.equal(multipleLeft.errors[0].code, 'SANSA_QUERY_EVALUATE_CARDINALITY');

  const nullRight = evaluateQuery([
    'from $.inventory.items[0]',
    'where "admin" in .status',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(nullRight.ok, false);
  assert.equal(nullRight.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const nanRight = evaluateQuery([
    'from $.inventory.items[2]',
    'where 8 in .metric',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(nanRight.ok, false);
  assert.equal(nanRight.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const infinityRight = evaluateQuery([
    'from $.inventory.items[3]',
    'where .ceiling in .ceiling',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(infinityRight.ok, true, JSON.stringify(infinityRight.errors ?? []));
  assert.deepEqual(infinityRight.results.map((entry) => entry.binding.address), ['$.inventory.items[3]']);
});

test('evaluates lookup over addressable containers', () => {
  const projected = evaluateQuery([
    'from $.inventory.items.*',
    'where .qty >= 4',
    'select { sku = .sku category = lookup($.inventory.categoryLabels, .category) }',
  ].join('\n'), namespace);
  assert.equal(projected.ok, true, JSON.stringify(projected.errors ?? []));
  assert.deepEqual(projected.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        sku: 'B-200',
        category: 'Hardware',
      },
    },
    {
      type: 'object',
      value: {
        sku: 'C-300',
        category: 'Hardware',
      },
    },
    {
      type: 'object',
      value: {
        sku: 'D-250',
        category: 'Tooling',
      },
    },
  ]);

  const position = evaluateQuery([
    'from $.inventory.items[0]',
    'select lookup(.roles, 1)',
  ].join('\n'), namespace);
  assert.equal(position.ok, true, JSON.stringify(position.errors ?? []));
  assert.deepEqual(position.results[0].value.bindings.map((binding) => binding.address), ['$.inventory.items[0].roles[1]']);

  const missingTarget = evaluateQuery([
    'from $.inventory.items[0]',
    'select lookup($.inventory.categoryLabels, "unknown")',
  ].join('\n'), namespace);
  assert.equal(missingTarget.ok, true, JSON.stringify(missingTarget.errors ?? []));
  assert.deepEqual(missingTarget.results[0].value.bindings, []);

  const missingTargetInProjection = evaluateQuery([
    'from $.inventory.items[0]',
    'select { category = lookup($.inventory.categoryLabels, "unknown") }',
  ].join('\n'), namespace);
  assert.equal(missingTargetInProjection.ok, false);
  assert.equal(missingTargetInProjection.errors[0].code, 'SANSA_QUERY_EVALUATE_MISSING_SCALAR');

  const multipleBase = evaluateQuery([
    'from $.inventory.items[0]',
    'select lookup($.inventory.items.*, .category)',
  ].join('\n'), namespace);
  assert.equal(multipleBase.ok, false);
  assert.equal(multipleBase.errors[0].code, 'SANSA_QUERY_EVALUATE_CARDINALITY');

  const multipleKey = evaluateQuery([
    'from $.inventory.items[0]',
    'select lookup($.inventory.categoryLabels, .roles.*)',
  ].join('\n'), namespace);
  assert.equal(multipleKey.ok, false);
  assert.equal(multipleKey.errors[0].code, 'SANSA_QUERY_EVALUATE_CARDINALITY');

  const invalidKey = evaluateQuery([
    'from $.inventory.items[0]',
    'select lookup($.inventory.categoryLabels, true)',
  ].join('\n'), namespace);
  assert.equal(invalidKey.ok, false);
  assert.equal(invalidKey.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const invalidBase = evaluateQuery([
    'from $.inventory.items[0]',
    'select lookup("labels", .category)',
  ].join('\n'), namespace);
  assert.equal(invalidBase.ok, false);
  assert.equal(invalidBase.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
});

test('evaluates path over structured address literal values', () => {
  const selected = evaluateQuery([
    'from $.inventory.items[1]',
    'select path($.<"params">.field)',
  ].join('\n'), namespace);
  assert.equal(selected.ok, true, JSON.stringify(selected.errors ?? []));
  assert.deepEqual(selected.results[0].value.bindings.map((binding) => binding.address), ['$.inventory.items[1].sku']);

  const projected = evaluateQuery([
    'from $.inventory.items.*',
    'where path($.<"params">.active) == false',
    'order by path($.<"params">.sort) desc',
    'select { sku = path($.<"params">.field) qty = .qty }',
  ].join('\n'), namespace);
  assert.equal(projected.ok, true, JSON.stringify(projected.errors ?? []));
  assert.deepEqual(projected.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        sku: 'C-300',
        qty: 8,
      },
    },
    {
      type: 'object',
      value: {
        sku: 'D-250',
        qty: 4,
      },
    },
  ]);

  const absolute = evaluateQuery([
    'from $',
    'select path($.<"params">.label)',
  ].join('\n'), namespace);
  assert.equal(absolute.ok, true, JSON.stringify(absolute.errors ?? []));
  assert.deepEqual(absolute.results[0].value.bindings.map((binding) => binding.address), ['$.inventory.categoryLabels.tooling']);

  const stringValue = evaluateQuery([
    'from $.inventory.items[0]',
    'select path($.<"params">.fieldText)',
  ].join('\n'), namespace);
  assert.equal(stringValue.ok, false);
  assert.equal(stringValue.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL');

  const invalidAddressLiteral = evaluateQuery([
    'from $.inventory.items[0]',
    'select path($.<"params">.badPath)',
  ].join('\n'), namespace);
  assert.equal(invalidAddressLiteral.ok, false);
  assert.equal(invalidAddressLiteral.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL');

  const invalidArity = evaluateQuery([
    'from $.inventory.items[0]',
    'select path($.<"params">.field, $.<"params">.sort)',
  ].join('\n'), namespace);
  assert.equal(invalidArity.ok, false);
  assert.equal(invalidArity.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
});

test('evaluates dynamic from path source expressions', () => {
  const selected = evaluateQuery([
    'from path($.<"params">.source)',
    'where .qty >= 4',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(selected.ok, true, JSON.stringify(selected.errors ?? []));
  assert.deepEqual(selected.results.map((entry) => entry.binding.address), [
    '$.inventory.items[1]',
    '$.inventory.items[2]',
    '$.inventory.items[3]',
  ]);
  assert.deepEqual(selected.results.map((entry) => entry.value.bindings.map((binding) => binding.address)), [
    ['$.inventory.items[1].sku'],
    ['$.inventory.items[2].sku'],
    ['$.inventory.items[3].sku'],
  ]);

  const stringSource = evaluateQuery([
    'from path($.<"params">.sourceText)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(stringSource.ok, false);
  assert.equal(stringSource.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL');
  assert.equal(stringSource.errors[0].phase, 'from');

  const valuePredicate = evaluateQuery([
    'from path($.<"params">.source)',
    'where isValue(path($.<"params">.active))',
    'select path($.<"params">.field)',
  ].join('\n'), namespace);
  assert.equal(valuePredicate.ok, true, JSON.stringify(valuePredicate.errors ?? []));
  assert.deepEqual(valuePredicate.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0]',
    '$.inventory.items[1]',
    '$.inventory.items[2]',
    '$.inventory.items[3]',
  ]);
});

test('evaluates fallback over missing scalar values', () => {
  const projected = evaluateQuery([
    'from $.inventory.items.*',
    'select { sku = .sku status = fallback(.status, "missing") }',
  ].join('\n'), namespace);
  assert.equal(projected.ok, true, JSON.stringify(projected.errors ?? []));
  assert.deepEqual(projected.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        sku: 'A-100',
        status: null,
      },
    },
    {
      type: 'object',
      value: {
        sku: 'B-200',
        status: 'active',
      },
    },
    {
      type: 'object',
      value: {
        sku: 'C-300',
        status: 'missing',
      },
    },
    {
      type: 'object',
      value: {
        sku: 'D-250',
        status: null,
      },
    },
  ]);

  const missingFunctionPrimary = evaluateQuery([
    'from $.inventory.items[0]',
    'select fallback(lower(.deletedAt), "none")',
  ].join('\n'), namespace);
  assert.equal(missingFunctionPrimary.ok, true, JSON.stringify(missingFunctionPrimary.errors ?? []));
  assert.equal(missingFunctionPrimary.results[0].value.value, 'none');

  const lazyReplacement = evaluateQuery([
    'from $.inventory.items[1]',
    'select fallback(.status, .deletedAt)',
  ].join('\n'), namespace);
  assert.equal(lazyReplacement.ok, true, JSON.stringify(lazyReplacement.errors ?? []));
  assert.equal(lazyReplacement.results[0].value.value, 'active');

  const containsMissing = evaluateQuery([
    'from $.inventory.items.*',
    'where contains(fallback(.description, ""), "developer")',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(containsMissing.ok, true, JSON.stringify(containsMissing.errors ?? []));
  assert.deepEqual(containsMissing.results, []);

  const multiplePrimary = evaluateQuery([
    'from $.inventory.items[0]',
    'select fallback(.roles.*, "none")',
  ].join('\n'), namespace);
  assert.equal(multiplePrimary.ok, false);
  assert.equal(multiplePrimary.errors[0].code, 'SANSA_QUERY_EVALUATE_CARDINALITY');

  const missingReplacement = evaluateQuery([
    'from $.inventory.items[0]',
    'select fallback(.deletedAt, .alsoDeletedAt)',
  ].join('\n'), namespace);
  assert.equal(missingReplacement.ok, false);
  assert.equal(missingReplacement.errors[0].code, 'SANSA_QUERY_EVALUATE_MISSING_SCALAR');

  const invalidArity = evaluateQuery([
    'from $.inventory.items[0]',
    'select fallback(.status)',
  ].join('\n'), namespace);
  assert.equal(invalidArity.ok, false);
  assert.equal(invalidArity.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
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
    'select { code = lower(.sku) name = upper(.name) label = concat("item:", .sku) }',
  ].join('\n'), namespace);
  assert.equal(projected.ok, true, JSON.stringify(projected.errors ?? []));
  assert.deepEqual(projected.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        code: 'a-100',
        name: 'ADAPTER',
        label: 'item:A-100',
      },
    },
    {
      type: 'object',
      value: {
        code: 'b-200',
        name: 'BRACKET',
        label: 'item:B-200',
      },
    },
  ]);

  const suffixFiltered = evaluateQuery([
    'from $.inventory.items.*',
    'where endsWith(.sku, "00")',
    'select { sku = .sku code = lower(.sku) label = concat("item:", .sku) }',
  ].join('\n'), namespace);
  assert.equal(suffixFiltered.ok, true, JSON.stringify(suffixFiltered.errors ?? []));
  assert.deepEqual(suffixFiltered.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        sku: 'A-100',
        code: 'a-100',
        label: 'item:A-100',
      },
    },
    {
      type: 'object',
      value: {
        sku: 'B-200',
        code: 'b-200',
        label: 'item:B-200',
      },
    },
    {
      type: 'object',
      value: {
        sku: 'C-300',
        code: 'c-300',
        label: 'item:C-300',
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
  const unsupported = evaluateQuery('from $.inventory.items.*\nselect matches(.sku, "B")', namespace);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION');

  const invalidArity = evaluateQuery('from $.inventory.items.*\nselect lower(.sku, "x")', namespace);
  assert.equal(invalidArity.ok, false);
  assert.equal(invalidArity.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const invalidType = evaluateQuery('from $.inventory.items.*\nselect contains(.qty, "4")', namespace);
  assert.equal(invalidType.ok, false);
  assert.equal(invalidType.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
});
