import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAddress, resolveAddress } from '../src/index.js';

function binding({
  address,
  name,
  index,
  semanticType,
  representationKind,
  children = [],
  attributeSpace,
  localSpaces,
}) {
  return {
    address,
    ...(name === undefined ? {} : { name }),
    ...(index === undefined ? {} : { index }),
    ...(semanticType === undefined ? {} : { semanticType }),
    ...(representationKind === undefined ? {} : { representationKind }),
    children,
    ...(attributeSpace === undefined ? {} : { attributeSpace }),
    ...(localSpaces === undefined ? {} : { localSpaces }),
  };
}

function addresses(result) {
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  return result.bindings.map((entry) => entry.address);
}

const sku0 = binding({ name: 'sku', address: '$.inventory.items[0].sku', semanticType: 'string', representationKind: 'string' });
const qty0 = binding({ name: 'qty', address: '$.inventory.items[0].qty', semanticType: 'number', representationKind: 'number' });
const sku1 = binding({ name: 'sku', address: '$.inventory.items[1].sku', semanticType: 'string', representationKind: 'string' });
const qty1 = binding({ name: 'qty', address: '$.inventory.items[1].qty', semanticType: 'number', representationKind: 'number' });
const status1 = binding({ name: 'status', address: '$.inventory.items[1].status', semanticType: 'boolean', representationKind: 'bool' });
const item0 = binding({ index: 0, address: '$.inventory.items[0]', representationKind: 'object', children: [sku0, qty0] });
const item1 = binding({ index: 1, address: '$.inventory.items[1]', representationKind: 'object', children: [sku1, qty1, status1] });
const items = binding({ name: 'items', address: '$.inventory.items', representationKind: 'list', children: [item0, item1] });
const itemA1 = binding({ name: 'itemA1', address: '$.inventory.itemA1', representationKind: 'object' });
const itemB2 = binding({ name: 'itemB2', address: '$.inventory.itemB2', representationKind: 'object' });
const archive = binding({ name: 'archive', address: '$.inventory.archive', representationKind: 'object' });
const catalogSkuIndex = binding({ name: 'skuIndex', address: '$.inventory.<"catalog">.skuIndex', representationKind: 'object' });
const catalogSpace = binding({ address: '$.inventory.<"catalog">', representationKind: 'object', children: [catalogSkuIndex] });
const inventory = binding({
  name: 'inventory',
  address: '$.inventory',
  representationKind: 'object',
  children: [items, itemA1, itemB2, archive],
  localSpaces: { catalog: catalogSpace },
});
const readingUnit = binding({ name: 'unit', address: '$.reading.@.unit', semanticType: 'string', representationKind: 'string' });
const readingAttributes = binding({ address: '$.reading.@', representationKind: 'object', children: [readingUnit] });
const reading = binding({
  name: 'reading',
  address: '$.reading',
  semanticType: 'measurement<number>',
  representationKind: 'number',
  attributeSpace: readingAttributes,
});
const root = binding({ address: '$', representationKind: 'object', children: [inventory, reading] });

const namespace = {
  root,
  children: (entry) => entry.children,
  attributeSpace: (entry) => entry.attributeSpace,
};

const localSpaceNamespace = {
  ...namespace,
  localSpace: (entry, name) => entry.localSpaces?.[name],
};

const parents = new Map([
  [root, null],
  [inventory, root],
  [items, inventory],
  [item0, items],
  [sku0, item0],
  [qty0, item0],
  [item1, items],
  [sku1, item1],
  [qty1, item1],
  [status1, item1],
  [itemA1, inventory],
  [itemB2, inventory],
  [archive, inventory],
  [reading, root],
  [readingAttributes, reading],
  [readingUnit, readingAttributes],
]);

const parentNamespace = {
  ...namespace,
  parent: (entry) => parents.get(entry),
};

test('resolves exact absolute addresses to zero or one binding', () => {
  assert.deepEqual(addresses(resolveAddress('$.inventory.items[1].sku', namespace)), ['$.inventory.items[1].sku']);
  assert.deepEqual(addresses(resolveAddress('$.inventory.items[2].sku', namespace)), []);
});

test('resolves direct and descendant expansion selectors', () => {
  assert.deepEqual(addresses(resolveAddress('$.inventory.items.*', namespace)), [
    '$.inventory.items[0]',
    '$.inventory.items[1]',
  ]);
  assert.deepEqual(addresses(resolveAddress('$.inventory.**', namespace)), [
    '$.inventory.items',
    '$.inventory.items[0]',
    '$.inventory.items[0].sku',
    '$.inventory.items[0].qty',
    '$.inventory.items[1]',
    '$.inventory.items[1].sku',
    '$.inventory.items[1].qty',
    '$.inventory.items[1].status',
    '$.inventory.itemA1',
    '$.inventory.itemB2',
    '$.inventory.archive',
  ]);
  assert.deepEqual(addresses(resolveAddress('$.inventory.**.sku', namespace)), [
    '$.inventory.items[0].sku',
    '$.inventory.items[1].sku',
  ]);
  assert.deepEqual(addresses(resolveAddress('$.**.unit', namespace)), []);
});

test('resolves inclusive position range selectors', () => {
  assert.deepEqual(addresses(resolveAddress('$.inventory.items[0..1]', namespace)), [
    '$.inventory.items[0]',
    '$.inventory.items[1]',
  ]);
  assert.deepEqual(addresses(resolveAddress('$.inventory.items[1..]', namespace)), [
    '$.inventory.items[1]',
  ]);
  assert.deepEqual(addresses(resolveAddress('$.inventory.items[..0]', namespace)), [
    '$.inventory.items[0]',
  ]);
  assert.deepEqual(addresses(resolveAddress('$.inventory.items[2..1]', namespace)), []);
});

test('resolves parent selectors only when the host exposes parent traversal', () => {
  assert.deepEqual(addresses(resolveAddress('$.inventory.items[1].sku.^.qty', parentNamespace)), ['$.inventory.items[1].qty']);
  assert.deepEqual(addresses(resolveAddress('$.^', parentNamespace)), []);

  const unsupported = resolveAddress('$.inventory.^', namespace);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_PARENT');
  assert.equal(unsupported.errors[0].selectorIndex, 1);
});

test('resolves name pattern selectors against direct child binding names', () => {
  assert.deepEqual(addresses(resolveAddress('$.inventory.items.*.("s?u")', namespace)), [
    '$.inventory.items[0].sku',
    '$.inventory.items[1].sku',
  ]);
});

test('resolves semantic type and representation kind filters over the current binding set', () => {
  assert.deepEqual(addresses(resolveAddress('$.inventory.items.*.sku#string%string', namespace)), [
    '$.inventory.items[0].sku',
    '$.inventory.items[1].sku',
  ]);
  assert.deepEqual(addresses(resolveAddress('$.reading#measurement', namespace)), ['$.reading']);
  assert.deepEqual(addresses(resolveAddress('$.inventory.items.*.qty#string', namespace)), []);
});

test('resolves attribute-space traversal only when the host exposes attributes', () => {
  assert.deepEqual(addresses(resolveAddress('$.reading.@.unit', namespace)), ['$.reading.@.unit']);
  assert.deepEqual(addresses(resolveAddress('$.reading.@.*', namespace)), ['$.reading.@.unit']);
  assert.deepEqual(addresses(resolveAddress('$.inventory.@', namespace)), []);

  const result = resolveAddress('$.inventory.@', { root, children: (entry) => entry.children });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE');
});

test('resolves contextual roots when a contextual binding is provided', () => {
  assert.deepEqual(addresses(resolveAddress('?.sku', namespace, { contextualRoot: item0 })), ['$.inventory.items[0].sku']);
  assert.deepEqual(addresses(resolveAddress('?.*', namespace, { contextualRoot: item1 })), [
    '$.inventory.items[1].sku',
    '$.inventory.items[1].qty',
    '$.inventory.items[1].status',
  ]);

  const result = resolveAddress('?.sku', namespace);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT');
});

test('resolves local-space traversal only when the host exposes local spaces', () => {
  assert.deepEqual(addresses(resolveAddress('$.inventory.<"catalog">.skuIndex', localSpaceNamespace)), [
    '$.inventory.<"catalog">.skuIndex',
  ]);
  assert.deepEqual(addresses(resolveAddress('$.reading.<"catalog">', localSpaceNamespace)), []);

  const result = resolveAddress('$.inventory.<"catalog">', namespace);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_LOCAL_SPACE');
  assert.equal(result.errors[0].selectorIndex, 1);
});

test('accepts pre-parsed address models', () => {
  const parsed = parseAddress('$.inventory.items[0].qty');
  assert.equal(parsed.ok, true);
  assert.deepEqual(addresses(resolveAddress(parsed.address, namespace)), ['$.inventory.items[0].qty']);
});
