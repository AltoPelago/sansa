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
}) {
  return {
    address,
    ...(name === undefined ? {} : { name }),
    ...(index === undefined ? {} : { index }),
    ...(semanticType === undefined ? {} : { semanticType }),
    ...(representationKind === undefined ? {} : { representationKind }),
    children,
    ...(attributeSpace === undefined ? {} : { attributeSpace }),
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
const item0 = binding({ index: 0, address: '$.inventory.items[0]', representationKind: 'object', children: [sku0, qty0] });
const item1 = binding({ index: 1, address: '$.inventory.items[1]', representationKind: 'object', children: [sku1, qty1] });
const items = binding({ name: 'items', address: '$.inventory.items', representationKind: 'list', children: [item0, item1] });
const inventory = binding({ name: 'inventory', address: '$.inventory', representationKind: 'object', children: [items] });
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

test('resolves exact absolute addresses to zero or one binding', () => {
  assert.deepEqual(addresses(resolveAddress('$.inventory.items[1].sku', namespace)), ['$.inventory.items[1].sku']);
  assert.deepEqual(addresses(resolveAddress('$.inventory.items[2].sku', namespace)), []);
});

test('resolves direct and descendant expansion selectors', () => {
  assert.deepEqual(addresses(resolveAddress('$.inventory.items.*', namespace)), [
    '$.inventory.items[0]',
    '$.inventory.items[1]',
  ]);
  assert.deepEqual(addresses(resolveAddress('$.inventory.**.sku', namespace)), [
    '$.inventory.items[0].sku',
    '$.inventory.items[1].sku',
  ]);
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
  assert.deepEqual(addresses(resolveAddress('$.inventory.@', namespace)), []);

  const result = resolveAddress('$.inventory.@', { root, children: (entry) => entry.children });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE');
});

test('resolves contextual roots when a contextual binding is provided', () => {
  assert.deepEqual(addresses(resolveAddress('?.sku', namespace, { contextualRoot: item0 })), ['$.inventory.items[0].sku']);

  const result = resolveAddress('?.sku', namespace);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT');
});

test('reports unsupported local-space traversal explicitly', () => {
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
