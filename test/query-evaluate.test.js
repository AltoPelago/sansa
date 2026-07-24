import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrenchValueSemanticsProfile, createNaturalAsciiValueSemanticsProfile, evaluateQuery } from '../src/index.js';

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
      name: 'name',
      address: '$.<"params">.name',
      semanticType: 'string',
      representationKind: 'string',
      value: 'Adapter',
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

const tableHeader = binding({
  name: 'header',
  address: '$.table.header',
  representationKind: 'list',
  children: [
    binding({ index: 0, address: '$.table.header[0]', semanticType: 'string', representationKind: 'string', value: 'name' }),
    binding({ index: 1, address: '$.table.header[1]', semanticType: 'string', representationKind: 'string', value: 'age' }),
  ],
});

const tableDuplicateHeader = binding({
  name: 'duplicateHeader',
  address: '$.table.duplicateHeader',
  representationKind: 'list',
  children: [
    binding({ index: 0, address: '$.table.duplicateHeader[0]', semanticType: 'string', representationKind: 'string', value: 'name' }),
    binding({ index: 1, address: '$.table.duplicateHeader[1]', semanticType: 'string', representationKind: 'string', value: 'name' }),
  ],
});

const tableContent = binding({
  name: 'content',
  address: '$.table.content',
  representationKind: 'list',
  children: [
    binding({
      index: 0,
      address: '$.table.content[0]',
      representationKind: 'tuple',
      children: [
        binding({ index: 0, address: '$.table.content[0][0]', semanticType: 'string', representationKind: 'string', value: 'Bob' }),
        binding({ index: 1, address: '$.table.content[0][1]', semanticType: 'number', representationKind: 'number', value: 22 }),
      ],
    }),
    binding({
      index: 1,
      address: '$.table.content[1]',
      representationKind: 'tuple',
      children: [
        binding({ index: 0, address: '$.table.content[1][0]', semanticType: 'string', representationKind: 'string', value: 'Alice' }),
        binding({ index: 1, address: '$.table.content[1][1]', semanticType: 'number', representationKind: 'number', value: 31 }),
      ],
    }),
  ],
});

const table = binding({
  name: 'table',
  address: '$.table',
  representationKind: 'object',
  children: [tableHeader, tableDuplicateHeader, tableContent],
});

const containers = binding({
  name: 'containers',
  address: '$.containers',
  semanticType: 'object',
  representationKind: 'object',
  children: [
    binding({
      name: 'record',
      address: '$.containers.record',
      semanticType: 'obj',
      representationKind: 'object',
      children: [
        binding({ name: 'id', address: '$.containers.record.id', semanticType: 'number', representationKind: 'number', value: 1 }),
      ],
    }),
    binding({
      name: 'packet',
      address: '$.containers.packet',
      semanticType: 'envelope',
      representationKind: 'object',
      children: [
        binding({ name: 'ok', address: '$.containers.packet.ok', semanticType: 'boolean', representationKind: 'boolean', value: true }),
      ],
    }),
    binding({
      name: 'series',
      address: '$.containers.series',
      semanticType: 'list<number>',
      representationKind: 'list',
      children: [
        binding({ index: 0, address: '$.containers.series[0]', semanticType: 'number', representationKind: 'number', value: 1 }),
        binding({ index: 1, address: '$.containers.series[1]', semanticType: 'number', representationKind: 'number', value: 2 }),
      ],
    }),
    binding({
      name: 'pair',
      address: '$.containers.pair',
      semanticType: 'tuple',
      representationKind: 'tuple',
      children: [
        binding({ index: 0, address: '$.containers.pair[0]', semanticType: 'string', representationKind: 'string', value: 'x' }),
        binding({ index: 1, address: '$.containers.pair[1]', semanticType: 'number', representationKind: 'number', value: 1 }),
      ],
    }),
    binding({
      name: 'nodeValue',
      address: '$.containers.nodeValue',
      semanticType: 'node',
      representationKind: 'node',
      nodeTag: 'tag',
      children: [
        binding({ index: 0, address: '$.containers.nodeValue[0]', semanticType: 'string', representationKind: 'string', value: 'hello' }),
      ],
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
    binding({ name: 'consent', address: '$.consent', semanticType: 'toggle', representationKind: 'toggle', scalarKind: 'toggle', value: 'yes' }),
    binding({ name: 'fallbackConsent', address: '$.fallbackConsent', semanticType: 'toggle', representationKind: 'toggle', scalarKind: 'toggle', value: 'on' }),
    binding({ name: 'target', address: '$.target', semanticType: 'number', representationKind: 'number', value: 7 }),
    binding({
      name: 'targetClone',
      address: '$.targetClone',
      semanticType: 'number',
      representationKind: 'cloneReference',
      scalarKind: 'referenceForm',
      value: { type: 'CloneReference', path: ['target'], canonical: '~target' },
    }),
    binding({
      name: 'targetPointer',
      address: '$.targetPointer',
      semanticType: 'number',
      representationKind: 'pointerReference',
      scalarKind: 'referenceForm',
      value: { type: 'PointerReference', path: ['target'], canonical: '~>target' },
    }),
    binding({
      name: 'types',
      address: '$.types',
      representationKind: 'object',
      children: [
        binding({ name: 'archiveDate', address: '$.types.archiveDate', semanticType: 'date', representationKind: 'date', scalarKind: 'date', value: '2024-12-31' }),
        binding({ name: 'released', address: '$.types.released', semanticType: 'date', representationKind: 'date', scalarKind: 'date', value: '2026-07-25' }),
        binding({ name: 'window', address: '$.types.window', semanticType: 'time', representationKind: 'time', scalarKind: 'time', value: '09:30:00Z' }),
        binding({ name: 'stamp', address: '$.types.stamp', semanticType: 'datetime', representationKind: 'datetime', scalarKind: 'datetime', value: '2026-07-25T09:30:00Z' }),
        binding({ name: 'zone', address: '$.types.zone', semanticType: 'zrut', representationKind: 'zrut', scalarKind: 'zrut', value: '2026-07-25T09:30:00Z&Australia/Melbourne' }),
        binding({ name: 'count', address: '$.types.count', semanticType: 'int32', representationKind: 'number', value: 2 }),
        binding({ name: 'capacity', address: '$.types.capacity', semanticType: 'uint64', representationKind: 'number', value: 8 }),
        binding({ name: 'ratio', address: '$.types.ratio', semanticType: 'float64', representationKind: 'number', value: 2.5 }),
        binding({ name: 'aliasNumber', address: '$.types.aliasNumber', semanticType: 'n', representationKind: 'number', value: 9 }),
        binding({ name: 'approved', address: '$.types.approved', semanticType: 'bool', representationKind: 'boolean', value: true }),
        binding({ name: 'note', address: '$.types.note', semanticType: 'trimtick', representationKind: 'string', value: 'hello trimtick' }),
        binding({ name: 'summary', address: '$.types.summary', semanticType: 'prose', representationKind: 'string', value: 'hello prose' }),
        binding({ name: 'payloadBase64', address: '$.types.payloadBase64', semanticType: 'base64', representationKind: 'encoding', scalarKind: 'encoding', value: 'QmFzZTY0IQ==' }),
        binding({ name: 'payloadEmbed', address: '$.types.payloadEmbed', semanticType: 'embed', representationKind: 'encoding', scalarKind: 'encoding', value: 'QmFzZTY0IQ==' }),
        binding({ name: 'payloadInline', address: '$.types.payloadInline', semanticType: 'inline', representationKind: 'encoding', scalarKind: 'encoding', value: 'QmFzZTY0IQ==' }),
        binding({ name: 'semver', address: '$.types.semver', semanticType: 'kadot', representationKind: 'separator', scalarKind: 'separator', value: '3.14.15' }),
      ],
    }),
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
    table,
    containers,
  ],
});

const namespace = {
  root,
  children: (entry) => entry.children,
  localSpace: (entry, name) => entry.localSpaces?.[name],
};

const stringOrderingRoot = binding({
  address: '$',
  representationKind: 'object',
  children: [
    binding({
      name: 'labels',
      address: '$.labels',
      representationKind: 'list',
      children: [
        binding({
          index: 0,
          address: '$.labels[0]',
          representationKind: 'object',
          children: [
            binding({ name: 'value', address: '$.labels[0].value', semanticType: 'string', representationKind: 'string', value: 'z' }),
          ],
        }),
        binding({
          index: 1,
          address: '$.labels[1]',
          representationKind: 'object',
          children: [
            binding({ name: 'value', address: '$.labels[1].value', semanticType: 'string', representationKind: 'string', value: 'ä' }),
          ],
        }),
        binding({
          index: 2,
          address: '$.labels[2]',
          representationKind: 'object',
          children: [
            binding({ name: 'value', address: '$.labels[2].value', semanticType: 'string', representationKind: 'string', value: 'a' }),
          ],
        }),
      ],
    }),
  ],
});

const stringOrderingNamespace = {
  root: stringOrderingRoot,
  children: (entry) => entry.children,
};

const frenchOrderingRoot = binding({
  address: '$',
  representationKind: 'object',
  children: [
    binding({
      name: 'labels',
      address: '$.labels',
      representationKind: 'list',
      children: [
        binding({
          index: 0,
          address: '$.labels[0]',
          representationKind: 'object',
          children: [
            binding({ name: 'value', address: '$.labels[0].value', semanticType: 'string', representationKind: 'string', value: 'zebre' }),
          ],
        }),
        binding({
          index: 1,
          address: '$.labels[1]',
          representationKind: 'object',
          children: [
            binding({ name: 'value', address: '$.labels[1].value', semanticType: 'string', representationKind: 'string', value: 'éclair' }),
          ],
        }),
      ],
    }),
  ],
});

const frenchOrderingNamespace = {
  root: frenchOrderingRoot,
  children: (entry) => entry.children,
};

const naturalOrderingRoot = binding({
  address: '$',
  representationKind: 'object',
  children: [
    binding({
      name: 'parts',
      address: '$.parts',
      representationKind: 'list',
      children: [
        binding({
          index: 0,
          address: '$.parts[0]',
          representationKind: 'object',
          children: [
            binding({ name: 'value', address: '$.parts[0].value', semanticType: 'string', representationKind: 'string', value: 'part-10' }),
          ],
        }),
        binding({
          index: 1,
          address: '$.parts[1]',
          representationKind: 'object',
          children: [
            binding({ name: 'value', address: '$.parts[1].value', semanticType: 'string', representationKind: 'string', value: 'part-2' }),
          ],
        }),
        binding({
          index: 2,
          address: '$.parts[2]',
          representationKind: 'object',
          children: [
            binding({ name: 'value', address: '$.parts[2].value', semanticType: 'string', representationKind: 'string', value: 'part-1' }),
          ],
        }),
      ],
    }),
  ],
});

const naturalOrderingNamespace = {
  root: naturalOrderingRoot,
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
  assert.deepEqual(result.results.map((entry) => entry.candidateAddress), ['$.inventory.items[1]']);
  assert.deepEqual(result.results.map((entry) => entry.valueAddress), [undefined]);
  assert.deepEqual(result.results.map((entry) => entry.kind), ['derived']);
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

test('evaluates query sources with position range selectors', () => {
  const result = evaluateQuery([
    'from $.inventory.items[1..2]',
    'select .sku',
  ].join('\n'), namespace);

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(result.results.map((entry) => entry.binding.address), [
    '$.inventory.items[1]',
    '$.inventory.items[2]',
  ]);
  assert.deepEqual(result.results.map((entry) => entry.candidateAddress), [
    '$.inventory.items[1]',
    '$.inventory.items[2]',
  ]);
  assert.deepEqual(result.results.map((entry) => entry.valueAddress), [
    '$.inventory.items[1].sku',
    '$.inventory.items[2].sku',
  ]);
  assert.deepEqual(result.results.map((entry) => entry.kind), ['binding', 'binding']);
  assert.deepEqual(result.results.map((entry) => entry.value.bindings.map((binding) => binding.address)), [
    ['$.inventory.items[1].sku'],
    ['$.inventory.items[2].sku'],
  ]);
});

test('keeps multi-binding projections inside one candidate result record', () => {
  const result = evaluateQuery([
    'from $.inventory.items[0]',
    'select .roles.*',
  ].join('\n'), namespace);

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(result.results.map((entry) => entry.address), ['$.inventory.items[0]']);
  assert.deepEqual(result.results.map((entry) => entry.candidateAddress), ['$.inventory.items[0]']);
  assert.deepEqual(result.results.map((entry) => entry.valueAddress), [undefined]);
  assert.deepEqual(result.results.map((entry) => entry.kind), ['binding']);
  assert.deepEqual(result.results.map((entry) => entry.value.bindings.map((binding) => binding.address)), [
    ['$.inventory.items[0].roles[0]', '$.inventory.items[0].roles[1]'],
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

test('reports query budget exhaustion without implicit truncation', () => {
  const from = evaluateQuery('from $.inventory.items.*\nselect .sku', namespace, {
    budget: { maxFromBindings: 3 },
  });
  assert.equal(from.ok, false);
  assert.equal(from.errors[0].code, 'SANSA_QUERY_BUDGET_EXCEEDED');
  assert.equal(from.errors[0].phase, 'from');
  assert.equal(from.errors[0].budget, 'maxFromBindings');
  assert.equal(from.errors[0].limit, 3);
  assert.equal(from.errors[0].observed, 4);
  assert.deepEqual(from.results, []);

  const where = evaluateQuery('from $.inventory.items.*\nwhere .active == true\nselect .sku', namespace, {
    budget: { maxWhereCandidates: 3 },
  });
  assert.equal(where.ok, false);
  assert.equal(where.errors[0].code, 'SANSA_QUERY_BUDGET_EXCEEDED');
  assert.equal(where.errors[0].phase, 'where');
  assert.equal(where.errors[0].budget, 'maxWhereCandidates');

  const order = evaluateQuery('from $.inventory.items.*\norder by .sku asc\nselect .sku', namespace, {
    budget: { maxOrderCandidates: 3 },
  });
  assert.equal(order.ok, false);
  assert.equal(order.errors[0].code, 'SANSA_QUERY_BUDGET_EXCEEDED');
  assert.equal(order.errors[0].phase, 'order');
  assert.equal(order.errors[0].budget, 'maxOrderCandidates');

  const select = evaluateQuery('from $.inventory.items.*\nlimit 4\nselect .sku', namespace, {
    budget: { maxResultRecords: 3 },
  });
  assert.equal(select.ok, false);
  assert.equal(select.errors[0].code, 'SANSA_QUERY_BUDGET_EXCEEDED');
  assert.equal(select.errors[0].phase, 'select');
  assert.equal(select.errors[0].budget, 'maxResultRecords');
  assert.deepEqual(select.results, []);
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

test('evaluates string ordering by Unicode scalar value', () => {
  const ordered = evaluateQuery([
    'from $.labels.*',
    'order by .value asc',
    'select .value',
  ].join('\n'), stringOrderingNamespace);

  assert.equal(ordered.ok, true, JSON.stringify(ordered.errors ?? []));
  assert.deepEqual(ordered.results.map((entry) => entry.binding.address), [
    '$.labels[2]',
    '$.labels[0]',
    '$.labels[1]',
  ]);

  const compared = evaluateQuery([
    'from $.labels.*',
    'where .value > "z"',
    'select .value',
  ].join('\n'), stringOrderingNamespace);

  assert.equal(compared.ok, true, JSON.stringify(compared.errors ?? []));
  assert.deepEqual(compared.results.map((entry) => entry.binding.address), ['$.labels[1]']);
});

test('evaluates string ordering with an explicit French value-semantics profile', () => {
  const codepointOrdered = evaluateQuery([
    'from $.labels.*',
    'order by .value asc',
    'select .value',
  ].join('\n'), frenchOrderingNamespace);

  assert.equal(codepointOrdered.ok, true, JSON.stringify(codepointOrdered.errors ?? []));
  assert.deepEqual(codepointOrdered.results.map((entry) => entry.binding.address), [
    '$.labels[0]',
    '$.labels[1]',
  ]);

  const frenchOrdered = evaluateQuery([
    'from $.labels.*',
    'order by .value asc',
    'select upper(.value)',
  ].join('\n'), frenchOrderingNamespace, {
    valueSemantics: createFrenchValueSemanticsProfile(),
  });

  assert.equal(frenchOrdered.ok, true, JSON.stringify(frenchOrdered.errors ?? []));
  assert.deepEqual(frenchOrdered.results.map((entry) => entry.binding.address), [
    '$.labels[1]',
    '$.labels[0]',
  ]);
  assert.deepEqual(frenchOrdered.results.map((entry) => entry.value.value), ['ÉCLAIR', 'ZEBRE']);
});

test('evaluates natural ASCII numeric-region string ordering with an explicit profile', () => {
  const codepointOrdered = evaluateQuery([
    'from $.parts.*',
    'order by .value asc',
    'select .value',
  ].join('\n'), naturalOrderingNamespace);

  assert.equal(codepointOrdered.ok, true, JSON.stringify(codepointOrdered.errors ?? []));
  assert.deepEqual(codepointOrdered.results.map((entry) => entry.binding.address), [
    '$.parts[2]',
    '$.parts[0]',
    '$.parts[1]',
  ]);

  const naturalOrdered = evaluateQuery([
    'from $.parts.*',
    'order by .value asc',
    'select .value',
  ].join('\n'), naturalOrderingNamespace, {
    valueSemantics: createNaturalAsciiValueSemanticsProfile(),
  });

  assert.equal(naturalOrdered.ok, true, JSON.stringify(naturalOrdered.errors ?? []));
  assert.deepEqual(naturalOrdered.results.map((entry) => entry.binding.address), [
    '$.parts[2]',
    '$.parts[1]',
    '$.parts[0]',
  ]);
  assert.deepEqual(naturalOrdered.results.map((entry) => entry.value.bindings[0].value), [
    'part-1',
    'part-2',
    'part-10',
  ]);
});

test('rejects incomplete custom value-semantics profiles in query evaluation', () => {
  const result = evaluateQuery([
    'from $.labels.*',
    'order by .value asc',
    'select .value',
  ].join('\n'), frenchOrderingNamespace, {
    valueSemantics: {
      compareStrings: () => 0,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_QUERY_INVALID_VALUE_SEMANTICS_PROFILE');
  assert.equal(result.errors[0].phase, 'policy');
  assert.match(result.errors[0].message, /compareStrings, lowerString, and upperString together/);
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

  const anyContains = evaluateQuery([
    'from $.inventory.items.*',
    'where any(contains(.roles.*, "min"))',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(anyContains.ok, true, JSON.stringify(anyContains.errors ?? []));
  assert.deepEqual(anyContains.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0]',
    '$.inventory.items[3]',
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

test('evaluates isValue as a missing-aware concrete-value guard', () => {
  const concreteStatuses = evaluateQuery([
    'from $.inventory.items.*',
    'where isValue(.status)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(concreteStatuses.ok, true, JSON.stringify(concreteStatuses.errors ?? []));
  assert.deepEqual(concreteStatuses.results.map((entry) => entry.binding.address), ['$.inventory.items[1]']);

  const concreteNumbers = evaluateQuery([
    'from $.inventory.items.*',
    'where isValue(.qty)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(concreteNumbers.ok, true, JSON.stringify(concreteNumbers.errors ?? []));
  assert.deepEqual(concreteNumbers.results.map((entry) => entry.binding.address), [
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
  assert.deepEqual(specialValues.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0]',
    '$.inventory.items[3]',
  ]);

  const containerValue = evaluateQuery([
    'from $.inventory.items[0]',
    'where isValue(.roles)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(containerValue.ok, true, JSON.stringify(containerValue.errors ?? []));
  assert.deepEqual(containerValue.results.map((entry) => entry.binding.address), ['$.inventory.items[0]']);

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
  const nullStatusSemanticFilter = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.status#null) and isNullReason(.status, "notSet")',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(nullStatusSemanticFilter.ok, true, JSON.stringify(nullStatusSemanticFilter.errors ?? []));
  assert.deepEqual(nullStatusSemanticFilter.results.map((entry) => entry.binding.address), ['$.inventory.items[0]']);

  const nanMetric = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.metric) and isNaN(.metric)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(nanMetric.ok, true, JSON.stringify(nanMetric.errors ?? []));
  assert.deepEqual(nanMetric.results.map((entry) => entry.binding.address), ['$.inventory.items[2]']);

  const nanMetricSemanticFilter = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.metric#nan) and isNaN(.metric)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(nanMetricSemanticFilter.ok, true, JSON.stringify(nanMetricSemanticFilter.errors ?? []));
  assert.deepEqual(nanMetricSemanticFilter.results.map((entry) => entry.binding.address), ['$.inventory.items[2]']);

  const infiniteCeiling = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.ceiling) and isInfinity(.ceiling)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(infiniteCeiling.ok, true, JSON.stringify(infiniteCeiling.errors ?? []));
  assert.deepEqual(infiniteCeiling.results.map((entry) => entry.binding.address), ['$.inventory.items[3]']);

  const infiniteCeilingSemanticFilter = evaluateQuery([
    'from $.inventory.items.*',
    'where exists(.ceiling#infinity) and isInfinity(.ceiling)',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(infiniteCeilingSemanticFilter.ok, true, JSON.stringify(infiniteCeilingSemanticFilter.errors ?? []));
  assert.deepEqual(infiniteCeilingSemanticFilter.results.map((entry) => entry.binding.address), ['$.inventory.items[3]']);

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

  const intSemanticFilterComparison = evaluateQuery([
    'from $.types.*#int32',
    'where . >= 2',
    'select .',
  ].join('\n'), namespace);
  assert.equal(intSemanticFilterComparison.ok, true, JSON.stringify(intSemanticFilterComparison.errors ?? []));
  assert.deepEqual(intSemanticFilterComparison.results.map((entry) => entry.binding.address), ['$.types.count']);

  const numericSubtypeComparison = evaluateQuery([
    'from $.types',
    'where .count < .ratio and .capacity > .ratio',
    'select .count',
  ].join('\n'), namespace);
  assert.equal(numericSubtypeComparison.ok, true, JSON.stringify(numericSubtypeComparison.errors ?? []));
  assert.deepEqual(numericSubtypeComparison.results.map((entry) => entry.binding.address), ['$.types']);

  const numberAliasFilterComparison = evaluateQuery([
    'from $.types.*#n',
    'where . > $.types.count',
    'select .',
  ].join('\n'), namespace);
  assert.equal(numberAliasFilterComparison.ok, true, JSON.stringify(numberAliasFilterComparison.errors ?? []));
  assert.deepEqual(numberAliasFilterComparison.results.map((entry) => entry.binding.address), ['$.types.aliasNumber']);

  const boolAliasFilterComparison = evaluateQuery([
    'from $.types.*#bool',
    'where . == true',
    'select .',
  ].join('\n'), namespace);
  assert.equal(boolAliasFilterComparison.ok, true, JSON.stringify(boolAliasFilterComparison.errors ?? []));
  assert.deepEqual(boolAliasFilterComparison.results.map((entry) => entry.binding.address), ['$.types.approved']);

  const stringFamilyAliasComparison = evaluateQuery([
    'from $.types.*#prose',
    'where . == "hello prose"',
    'select .',
  ].join('\n'), namespace);
  assert.equal(stringFamilyAliasComparison.ok, true, JSON.stringify(stringFamilyAliasComparison.errors ?? []));
  assert.deepEqual(stringFamilyAliasComparison.results.map((entry) => entry.binding.address), ['$.types.summary']);

  const encodingAliasComparison = evaluateQuery([
    'from $.types.*#base64',
    'where . == &QmFzZTY0IQ==',
    'select .',
  ].join('\n'), namespace);
  assert.equal(encodingAliasComparison.ok, true, JSON.stringify(encodingAliasComparison.errors ?? []));
  assert.deepEqual(encodingAliasComparison.results.map((entry) => entry.binding.address), ['$.types.payloadBase64']);

  const separatorAliasComparison = evaluateQuery([
    'from $.types.*#kadot',
    'where . > ^3.0.0',
    'select .',
  ].join('\n'), namespace);
  assert.equal(separatorAliasComparison.ok, true, JSON.stringify(separatorAliasComparison.errors ?? []));
  assert.deepEqual(separatorAliasComparison.results.map((entry) => entry.binding.address), ['$.types.semver']);

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

  const toggleEquality = evaluateQuery([
    'from $.consent',
    'where . == yes',
    'select .',
  ].join('\n'), namespace);
  assert.equal(toggleEquality.ok, true, JSON.stringify(toggleEquality.errors ?? []));
  assert.deepEqual(toggleEquality.results.map((entry) => entry.binding.address), ['$.consent']);

  const toggleSpellingIsNotCoerced = evaluateQuery([
    'from $.fallbackConsent',
    'where . == yes',
    'select .',
  ].join('\n'), namespace);
  assert.equal(toggleSpellingIsNotCoerced.ok, true, JSON.stringify(toggleSpellingIsNotCoerced.errors ?? []));
  assert.deepEqual(toggleSpellingIsNotCoerced.results.map((entry) => entry.binding.address), []);

  const toggleBooleanComparison = evaluateQuery([
    'from $.consent',
    'where . == true',
    'select .',
  ].join('\n'), namespace);
  assert.equal(toggleBooleanComparison.ok, false);
  assert.equal(toggleBooleanComparison.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const temporalLiteralComparison = evaluateQuery([
    'from $.types.*#date',
    'where . > 2025-01-01',
    'select .',
  ].join('\n'), namespace);
  assert.equal(temporalLiteralComparison.ok, true, JSON.stringify(temporalLiteralComparison.errors ?? []));
  assert.deepEqual(temporalLiteralComparison.results.map((entry) => entry.binding.address), ['$.types.released']);

  const temporalOrder = evaluateQuery([
    'from $.types.*#date',
    'order by . desc',
    'select .',
  ].join('\n'), namespace);
  assert.equal(temporalOrder.ok, true, JSON.stringify(temporalOrder.errors ?? []));
  assert.deepEqual(temporalOrder.results.map((entry) => entry.binding.address), [
    '$.types.released',
    '$.types.archiveDate',
  ]);

  const timeLiteralComparison = evaluateQuery([
    'from $.types.window',
    'where . >= 09:00:00Z',
    'select .',
  ].join('\n'), namespace);
  assert.equal(timeLiteralComparison.ok, true, JSON.stringify(timeLiteralComparison.errors ?? []));
  assert.deepEqual(timeLiteralComparison.results.map((entry) => entry.binding.address), ['$.types.window']);

  const datetimeLiteralComparison = evaluateQuery([
    'from $.types.stamp',
    'where . == 2026-07-25T09:30:00Z',
    'select .',
  ].join('\n'), namespace);
  assert.equal(datetimeLiteralComparison.ok, true, JSON.stringify(datetimeLiteralComparison.errors ?? []));
  assert.deepEqual(datetimeLiteralComparison.results.map((entry) => entry.binding.address), ['$.types.stamp']);

  const zrutLiteralComparison = evaluateQuery([
    'from $.types.zone',
    'where . == 2026-07-25T09:30:00Z&Australia/Melbourne',
    'select .',
  ].join('\n'), namespace);
  assert.equal(zrutLiteralComparison.ok, true, JSON.stringify(zrutLiteralComparison.errors ?? []));
  assert.deepEqual(zrutLiteralComparison.results.map((entry) => entry.binding.address), ['$.types.zone']);

  const temporalCrossFamilyComparison = evaluateQuery([
    'from $.types.stamp',
    'where . > $.types.released',
    'select .',
  ].join('\n'), namespace);
  assert.equal(temporalCrossFamilyComparison.ok, false);
  assert.equal(temporalCrossFamilyComparison.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const referenceFormEquality = evaluateQuery([
    'from $.targetClone',
    'where . == $.targetClone',
    'select .',
  ].join('\n'), namespace);
  assert.equal(referenceFormEquality.ok, true, JSON.stringify(referenceFormEquality.errors ?? []));
  assert.deepEqual(referenceFormEquality.results.map((entry) => entry.binding.address), ['$.targetClone']);

  const referenceFormKindIsNotCoerced = evaluateQuery([
    'from $.targetPointer',
    'where . == $.targetClone',
    'select .',
  ].join('\n'), namespace);
  assert.equal(referenceFormKindIsNotCoerced.ok, true, JSON.stringify(referenceFormKindIsNotCoerced.errors ?? []));
  assert.deepEqual(referenceFormKindIsNotCoerced.results.map((entry) => entry.binding.address), []);

  const followedValueComparison = evaluateQuery([
    'from $.targetClone',
    'where follow(.) == 7',
    'select follow(.)',
  ].join('\n'), namespace);
  assert.equal(followedValueComparison.ok, true, JSON.stringify(followedValueComparison.errors ?? []));
  assert.deepEqual(followedValueComparison.results.map((entry) => entry.binding.address), ['$.targetClone']);
  assert.deepEqual(followedValueComparison.results.map((entry) => (
    entry.value.type === 'bindingSet' ? entry.value.bindings.map((binding) => binding.address) : null
  )), [['$.target']]);

  const followRejectsNonReference = evaluateQuery([
    'from $.target',
    'where follow(.) == 7',
    'select .',
  ].join('\n'), namespace);
  assert.equal(followRejectsNonReference.ok, false);
  assert.equal(followRejectsNonReference.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const listStructuralEquality = evaluateQuery([
    'from $.table',
    'where .header == .header',
    'select .header',
  ].join('\n'), namespace);
  assert.equal(listStructuralEquality.ok, true, JSON.stringify(listStructuralEquality.errors ?? []));
  assert.deepEqual(listStructuralEquality.results.map((entry) => entry.binding.address), ['$.table']);
  assert.deepEqual(listStructuralEquality.results.map((entry) => (
    entry.value.type === 'bindingSet' ? entry.value.bindings.map((binding) => binding.address) : null
  )), [['$.table.header']]);

  const listStructuralInequality = evaluateQuery([
    'from $.table',
    'where .header != .duplicateHeader',
    'select .duplicateHeader',
  ].join('\n'), namespace);
  assert.equal(listStructuralInequality.ok, true, JSON.stringify(listStructuralInequality.errors ?? []));
  assert.deepEqual(listStructuralInequality.results.map((entry) => entry.binding.address), ['$.table']);

  const differentContainerKinds = evaluateQuery([
    'from $.table',
    'where .header == .content[0]',
    'select .',
  ].join('\n'), namespace);
  assert.equal(differentContainerKinds.ok, false);
  assert.equal(differentContainerKinds.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const containerOrdering = evaluateQuery([
    'from $.table',
    'where .header > .header',
    'select .',
  ].join('\n'), namespace);
  assert.equal(containerOrdering.ok, false);
  assert.equal(containerOrdering.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const objectSemanticFilter = evaluateQuery([
    'from $.containers#object',
    'select .',
  ].join('\n'), namespace);
  assert.equal(objectSemanticFilter.ok, true, JSON.stringify(objectSemanticFilter.errors ?? []));
  assert.deepEqual(objectSemanticFilter.results.map((entry) => entry.binding.address), ['$.containers']);

  const objectAliasSemanticFilter = evaluateQuery([
    'from $.containers.*#obj',
    'select .',
  ].join('\n'), namespace);
  assert.equal(objectAliasSemanticFilter.ok, true, JSON.stringify(objectAliasSemanticFilter.errors ?? []));
  assert.deepEqual(objectAliasSemanticFilter.results.map((entry) => entry.binding.address), ['$.containers.record']);

  const envelopeSemanticFilter = evaluateQuery([
    'from $.containers.*#envelope',
    'select .',
  ].join('\n'), namespace);
  assert.equal(envelopeSemanticFilter.ok, true, JSON.stringify(envelopeSemanticFilter.errors ?? []));
  assert.deepEqual(envelopeSemanticFilter.results.map((entry) => entry.binding.address), ['$.containers.packet']);

  const listSemanticFilter = evaluateQuery([
    'from $.containers.*#list',
    'select .',
  ].join('\n'), namespace);
  assert.equal(listSemanticFilter.ok, true, JSON.stringify(listSemanticFilter.errors ?? []));
  assert.deepEqual(listSemanticFilter.results.map((entry) => entry.binding.address), ['$.containers.series']);

  const tupleSemanticFilter = evaluateQuery([
    'from $.containers.*#tuple',
    'select .',
  ].join('\n'), namespace);
  assert.equal(tupleSemanticFilter.ok, true, JSON.stringify(tupleSemanticFilter.errors ?? []));
  assert.deepEqual(tupleSemanticFilter.results.map((entry) => entry.binding.address), ['$.containers.pair']);

  const nodeSemanticFilter = evaluateQuery([
    'from $.containers.*#node',
    'select .',
  ].join('\n'), namespace);
  assert.equal(nodeSemanticFilter.ok, true, JSON.stringify(nodeSemanticFilter.errors ?? []));
  assert.deepEqual(nodeSemanticFilter.results.map((entry) => entry.binding.address), ['$.containers.nodeValue']);

  const nodeComparisonNamespace = {
    root: {
      address: '$',
      representationKind: 'object',
      children: [
        {
          name: 'nodeA',
          address: '$.nodeA',
          representationKind: 'node',
          nodeTag: 'tag',
          attributeSpace: {
            address: '$.nodeA.@',
            representationKind: 'attributeSpace',
            children: [
              { name: 'role', address: '$.nodeA.@.role', semanticType: 'string', representationKind: 'string', value: 'primary' },
            ],
          },
          children: [
            { index: 0, address: '$.nodeA[0]', semanticType: 'string', representationKind: 'string', value: 'hello' },
          ],
        },
        {
          name: 'nodeB',
          address: '$.nodeB',
          representationKind: 'node',
          nodeTag: 'tag',
          attributeSpace: {
            address: '$.nodeB.@',
            representationKind: 'attributeSpace',
            children: [
              { name: 'role', address: '$.nodeB.@.role', semanticType: 'string', representationKind: 'string', value: 'primary' },
            ],
          },
          children: [
            { index: 0, address: '$.nodeB[0]', semanticType: 'string', representationKind: 'string', value: 'hello' },
          ],
        },
        {
          name: 'nodeC',
          address: '$.nodeC',
          representationKind: 'node',
          nodeTag: 'tag',
          attributeSpace: {
            address: '$.nodeC.@',
            representationKind: 'attributeSpace',
            children: [
              { name: 'role', address: '$.nodeC.@.role', semanticType: 'string', representationKind: 'string', value: 'secondary' },
            ],
          },
          children: [
            { index: 0, address: '$.nodeC[0]', semanticType: 'string', representationKind: 'string', value: 'hello' },
          ],
        },
      ],
    },
    children: (entry) => entry.children ?? [],
    attributeSpace: (entry) => entry.attributeSpace,
  };
  const nodeStructuralEquality = evaluateQuery([
    'from $',
    'where $.nodeA == $.nodeB',
    'select $.nodeA',
  ].join('\n'), nodeComparisonNamespace);
  assert.equal(nodeStructuralEquality.ok, true, JSON.stringify(nodeStructuralEquality.errors ?? []));
  assert.deepEqual(nodeStructuralEquality.results.map((entry) => entry.binding.address), ['$']);

  const nodeAttributeInequality = evaluateQuery([
    'from $',
    'where $.nodeA != $.nodeC',
    'select $.nodeC',
  ].join('\n'), nodeComparisonNamespace);
  assert.equal(nodeAttributeInequality.ok, true, JSON.stringify(nodeAttributeInequality.errors ?? []));
  assert.deepEqual(nodeAttributeInequality.results.map((entry) => entry.binding.address), ['$']);

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

  const shortCircuitRoot = binding({
    address: '$',
    representationKind: 'object',
    children: [
      binding({
        name: 'roles',
        address: '$.roles',
        representationKind: 'list',
        children: [
          binding({ index: 0, address: '$.roles[0]', semanticType: 'string', representationKind: 'string', value: 'admin' }),
          binding({ index: 1, address: '$.roles[1]', semanticType: 'null<string>', representationKind: 'null', scalarKind: 'null', nullReason: 'notSet', value: null }),
        ],
      }),
      binding({
        name: 'badRoles',
        address: '$.badRoles',
        representationKind: 'list',
        children: [
          binding({ index: 0, address: '$.badRoles[0]', semanticType: 'string', representationKind: 'string', value: 'user' }),
          binding({ index: 1, address: '$.badRoles[1]', semanticType: 'null<string>', representationKind: 'null', scalarKind: 'null', nullReason: 'notSet', value: null }),
        ],
      }),
    ],
  });
  const shortCircuitNamespace = {
    root: shortCircuitRoot,
    children: (entry) => entry.children,
  };
  const matchBeforeNull = evaluateQuery('from $ where "admin" in $.roles.* select $.roles', shortCircuitNamespace);
  assert.equal(matchBeforeNull.ok, true, JSON.stringify(matchBeforeNull.errors ?? []));
  assert.equal(matchBeforeNull.results.length, 1);

  const nullBeforeMatch = evaluateQuery('from $ where "admin" in $.badRoles.* select $.badRoles', shortCircuitNamespace);
  assert.equal(nullBeforeMatch.ok, false);
  assert.equal(nullBeforeMatch.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

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

test('evaluates resolveChild over addressable containers', () => {
  const projected = evaluateQuery([
    'from $.inventory.items.*',
    'where .qty >= 4',
    'select { sku = .sku category = resolveChild($.inventory.categoryLabels, .category) }',
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
    'select resolveChild(.roles, 1)',
  ].join('\n'), namespace);
  assert.equal(position.ok, true, JSON.stringify(position.errors ?? []));
  assert.deepEqual(position.results[0].value.bindings.map((binding) => binding.address), ['$.inventory.items[0].roles[1]']);

  const missingTarget = evaluateQuery([
    'from $.inventory.items[0]',
    'select resolveChild($.inventory.categoryLabels, "unknown")',
  ].join('\n'), namespace);
  assert.equal(missingTarget.ok, true, JSON.stringify(missingTarget.errors ?? []));
  assert.deepEqual(missingTarget.results[0].value.bindings, []);

  const missingTargetInProjection = evaluateQuery([
    'from $.inventory.items[0]',
    'select { category = resolveChild($.inventory.categoryLabels, "unknown") }',
  ].join('\n'), namespace);
  assert.equal(missingTargetInProjection.ok, false);
  assert.equal(missingTargetInProjection.errors[0].code, 'SANSA_QUERY_EVALUATE_MISSING_SCALAR');

  const multipleBase = evaluateQuery([
    'from $.inventory.items[0]',
    'select resolveChild($.inventory.items.*, .category)',
  ].join('\n'), namespace);
  assert.equal(multipleBase.ok, false);
  assert.equal(multipleBase.errors[0].code, 'SANSA_QUERY_EVALUATE_CARDINALITY');

  const multipleKey = evaluateQuery([
    'from $.inventory.items[0]',
    'select resolveChild($.inventory.categoryLabels, .roles.*)',
  ].join('\n'), namespace);
  assert.equal(multipleKey.ok, false);
  assert.equal(multipleKey.errors[0].code, 'SANSA_QUERY_EVALUATE_CARDINALITY');

  const invalidKey = evaluateQuery([
    'from $.inventory.items[0]',
    'select resolveChild($.inventory.categoryLabels, true)',
  ].join('\n'), namespace);
  assert.equal(invalidKey.ok, false);
  assert.equal(invalidKey.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const invalidBase = evaluateQuery([
    'from $.inventory.items[0]',
    'select resolveChild("labels", .category)',
  ].join('\n'), namespace);
  assert.equal(invalidBase.ok, false);
  assert.equal(invalidBase.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const oldName = evaluateQuery([
    'from $.inventory.items[0]',
    'select lookup($.inventory.categoryLabels, .category)',
  ].join('\n'), namespace);
  assert.equal(oldName.ok, false);
  assert.equal(oldName.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION');
});

test('evaluates objectFrom over paired binding sets', () => {
  const projected = evaluateQuery([
    'from $.table.content.*',
    'select objectFrom($.table.header.*, .*)',
  ].join('\n'), namespace);
  assert.equal(projected.ok, true, JSON.stringify(projected.errors ?? []));
  assert.deepEqual(projected.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        name: 'Bob',
        age: 22,
      },
    },
    {
      type: 'object',
      value: {
        name: 'Alice',
        age: 31,
      },
    },
  ]);

  const ageOnly = evaluateQuery([
    'from $.table.content.*',
    'select objectFrom($.table.header[1], .[1])',
  ].join('\n'), namespace);
  assert.equal(ageOnly.ok, true, JSON.stringify(ageOnly.errors ?? []));
  assert.deepEqual(ageOnly.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        age: 22,
      },
    },
    {
      type: 'object',
      value: {
        age: 31,
      },
    },
  ]);

  const ageValues = evaluateQuery([
    'from $.table.content.*',
    'select .[1]',
  ].join('\n'), namespace);
  assert.equal(ageValues.ok, true, JSON.stringify(ageValues.errors ?? []));
  assert.deepEqual(ageValues.results.map((entry) => entry.value.bindings.map((binding) => binding.address)), [
    ['$.table.content[0][1]'],
    ['$.table.content[1][1]'],
  ]);

  const mismatched = evaluateQuery([
    'from $.table.content[0]',
    'select objectFrom($.table.header[0..0], .*)',
  ].join('\n'), namespace);
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.errors[0].code, 'SANSA_QUERY_EVALUATE_CARDINALITY');

  const duplicateKey = evaluateQuery([
    'from $.table.content[0]',
    'select objectFrom($.table.duplicateHeader.*, .*)',
  ].join('\n'), namespace);
  assert.equal(duplicateKey.ok, false);
  assert.equal(duplicateKey.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const invalidArgument = evaluateQuery([
    'from $.table.content[0]',
    'select objectFrom("name", .*)',
  ].join('\n'), namespace);
  assert.equal(invalidArgument.ok, false);
  assert.equal(invalidArgument.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
});

test('evaluates experimental fieldsFrom over paired binding sets', () => {
  const ageOnly = evaluateQuery([
    'from $.table.content.*',
    'select fieldsFrom($.table.header.*, .*, "age")',
  ].join('\n'), namespace);
  assert.equal(ageOnly.ok, true, JSON.stringify(ageOnly.errors ?? []));
  assert.deepEqual(ageOnly.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        age: 22,
      },
    },
    {
      type: 'object',
      value: {
        age: 31,
      },
    },
  ]);

  const bothFields = evaluateQuery([
    'from $.table.content.*',
    'select fieldsFrom($.table.header.*, .*, "name", "age")',
  ].join('\n'), namespace);
  assert.equal(bothFields.ok, true, JSON.stringify(bothFields.errors ?? []));
  assert.deepEqual(bothFields.results.map((entry) => entry.value), [
    {
      type: 'object',
      value: {
        name: 'Bob',
        age: 22,
      },
    },
    {
      type: 'object',
      value: {
        name: 'Alice',
        age: 31,
      },
    },
  ]);

  const missingField = evaluateQuery([
    'from $.table.content[0]',
    'select fieldsFrom($.table.header.*, .*, "email")',
  ].join('\n'), namespace);
  assert.equal(missingField.ok, false);
  assert.equal(missingField.errors[0].code, 'SANSA_QUERY_EVALUATE_MISSING_SCALAR');

  const duplicateRequestedField = evaluateQuery([
    'from $.table.content[0]',
    'select fieldsFrom($.table.header.*, .*, "age", "age")',
  ].join('\n'), namespace);
  assert.equal(duplicateRequestedField.ok, false);
  assert.equal(duplicateRequestedField.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const duplicateSourceHeader = evaluateQuery([
    'from $.table.content[0]',
    'select fieldsFrom($.table.duplicateHeader.*, .*, "name")',
  ].join('\n'), namespace);
  assert.equal(duplicateSourceHeader.ok, false);
  assert.equal(duplicateSourceHeader.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
});

test('gates experimental transform extensions explicitly', () => {
  const disabledObjectFrom = evaluateQuery([
    'from $.table.content[0]',
    'select objectFrom($.table.header.*, .*)',
  ].join('\n'), namespace, { extensions: { transform: false } });
  assert.equal(disabledObjectFrom.ok, false);
  assert.equal(disabledObjectFrom.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION');
  assert.equal(disabledObjectFrom.errors[0].extension, 'sansa.transform.objectFrom');

  const disabledFieldsFrom = evaluateQuery([
    'from $.table.content[0]',
    'select fieldsFrom($.table.header.*, .*, "age")',
  ].join('\n'), namespace, { enabledExtensions: ['sansa.transform.objectFrom'] });
  assert.equal(disabledFieldsFrom.ok, false);
  assert.equal(disabledFieldsFrom.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION');
  assert.equal(disabledFieldsFrom.errors[0].extension, 'sansa.transform.fieldsFrom');

  const explicitlyEnabled = evaluateQuery([
    'from $.table.content.*',
    'select objectFrom($.table.header[1], .[1])',
  ].join('\n'), namespace, { enabledExtensions: ['sansa.transform.objectFrom'] });
  assert.equal(explicitlyEnabled.ok, true, JSON.stringify(explicitlyEnabled.errors ?? []));
  assert.deepEqual(explicitlyEnabled.results.map((entry) => entry.value.value), [
    { age: 22 },
    { age: 31 },
  ]);
});

test('applies validation query policy restrictions before evaluation', () => {
  const safe = evaluateQuery([
    'from $.inventory.items.*',
    'where .qty >= 4',
    'select .sku',
  ].join('\n'), namespace, { policy: 'validation' });
  assert.equal(safe.ok, true, JSON.stringify(safe.errors ?? []));
  assert.deepEqual(safe.results.map((entry) => entry.value.bindings.map((binding) => binding.address)), [
    ['$.inventory.items[1].sku'],
    ['$.inventory.items[2].sku'],
    ['$.inventory.items[3].sku'],
  ]);

  const ordered = evaluateQuery([
    'from $.inventory.items.*',
    'order by .sku asc',
    'select .sku',
  ].join('\n'), namespace, { policy: { mode: 'validation' } });
  assert.equal(ordered.ok, false);
  assert.equal(ordered.errors[0].code, 'SANSA_QUERY_POLICY_VIOLATION');
  assert.equal(ordered.errors[0].phase, 'policy');

  const limited = evaluateQuery([
    'from $.inventory.items.*',
    'limit 1',
    'select .sku',
  ].join('\n'), namespace, { policy: { validation: true } });
  assert.equal(limited.ok, false);
  assert.equal(limited.errors[0].code, 'SANSA_QUERY_POLICY_VIOLATION');

  const offset = evaluateQuery([
    'from $.inventory.items.*',
    'offset 1',
    'select .sku',
  ].join('\n'), namespace, { policy: 'validation' });
  assert.equal(offset.ok, false);
  assert.equal(offset.errors[0].code, 'SANSA_QUERY_POLICY_VIOLATION');

  const projected = evaluateQuery([
    'from $.inventory.items.*',
    'select { sku = .sku qty = .qty }',
  ].join('\n'), namespace, { policy: 'validation' });
  assert.equal(projected.ok, false);
  assert.equal(projected.errors[0].code, 'SANSA_QUERY_POLICY_VIOLATION');

  const transform = evaluateQuery([
    'from $.table.content[0]',
    'select objectFrom($.table.header.*, .*)',
  ].join('\n'), namespace, { policy: 'validation' });
  assert.equal(transform.ok, false);
  assert.equal(transform.errors[0].code, 'SANSA_QUERY_POLICY_VIOLATION');
  assert.equal(transform.errors[0].extension, 'sansa.transform.objectFrom');
});

test('evaluates path over structured address literal values', () => {
  const scalarParam = evaluateQuery([
    'from $.inventory.items.*',
    'where .name == $.<"params">.name',
    'select .sku',
  ].join('\n'), namespace);
  assert.equal(scalarParam.ok, true, JSON.stringify(scalarParam.errors ?? []));
  assert.deepEqual(scalarParam.results[0].value.bindings.map((binding) => binding.address), ['$.inventory.items[0].sku']);

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

  const nanPrimary = evaluateQuery([
    'from $.inventory.items[2]',
    'select fallback(.metric, "missing")',
  ].join('\n'), namespace);
  assert.equal(nanPrimary.ok, true, JSON.stringify(nanPrimary.errors ?? []));
  assert.equal(Number.isNaN(nanPrimary.results[0].value.value), true);

  const infinityPrimary = evaluateQuery([
    'from $.inventory.items[3]',
    'select fallback(.ceiling, "missing")',
  ].join('\n'), namespace);
  assert.equal(infinityPrimary.ok, true, JSON.stringify(infinityPrimary.errors ?? []));
  assert.equal(infinityPrimary.results[0].value.value, Infinity);

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

  const currentRole = evaluateQuery([
    'from $.inventory.items.*.roles.*',
    'where contains(., "min")',
    'select .',
  ].join('\n'), namespace);
  assert.equal(currentRole.ok, true, JSON.stringify(currentRole.errors ?? []));
  assert.deepEqual(currentRole.results.map((entry) => entry.binding.address), [
    '$.inventory.items[0].roles[0]',
    '$.inventory.items[3].roles[0]',
    '$.inventory.items[3].roles[1]',
  ]);
  assert.deepEqual(currentRole.results.map((entry) => entry.value.bindings.map((binding) => binding.address)), [
    ['$.inventory.items[0].roles[0]'],
    ['$.inventory.items[3].roles[0]'],
    ['$.inventory.items[3].roles[1]'],
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

  const onlyReserved = evaluateQuery('from $.inventory.items.*\nwhere only(.roles.* == "admin")\nselect .sku', namespace);
  assert.equal(onlyReserved.ok, false);
  assert.equal(onlyReserved.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION');

  const unsupportedWithBindingSetArgs = evaluateQuery('from $.table.content.*\nselect objectfrom($.table.header.*, .*)', namespace);
  assert.equal(unsupportedWithBindingSetArgs.ok, false);
  assert.equal(unsupportedWithBindingSetArgs.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION');

  const invalidArity = evaluateQuery('from $.inventory.items.*\nselect lower(.sku, "x")', namespace);
  assert.equal(invalidArity.ok, false);
  assert.equal(invalidArity.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');

  const invalidType = evaluateQuery('from $.inventory.items.*\nselect contains(.qty, "4")', namespace);
  assert.equal(invalidType.ok, false);
  assert.equal(invalidType.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
});
