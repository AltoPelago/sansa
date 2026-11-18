import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateQuery } from '@altopelago/sansa';
import { getQueryValueMetadata, getQueryObjectFieldMetadata } from '@altopelago/sansa/query-metadata';

const namespace = { root: { address: '$', representationKind: 'ObjectNode', children: [] }, children: (binding) => binding.children };
function value(expression) {
  const result = evaluateQuery(`from $ select ${expression}`, namespace);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result.results[0].value;
}

test('public scalar metadata preserves native kinds, precision and null reasons', () => {
  for (const [expression, expected] of [
    ['9007199254740993123456789', { kind: 'number', numericLexeme: '9007199254740993123456789' }],
    ['|unchecked|', { kind: 'symbol' }],
    ['2026-08-20', { kind: 'date', semanticType: 'date' }],
    ['!notSet', { kind: 'null', nullReason: 'notSet' }],
  ]) {
    const result = value(expression);
    const descriptor = getQueryValueMetadata(result);
    for (const [key, entry] of Object.entries(expected)) assert.equal(descriptor[key], entry);
    assert.ok(Object.isFrozen(descriptor));
    assert.notEqual(descriptor, getQueryValueMetadata(result));
    assert.throws(() => { descriptor.kind = 'string'; }, TypeError);
    assert.equal(getQueryValueMetadata(result).kind, expected.kind);
  }
});

test('public projection metadata supports nested objects and retains ordinary user fields', () => {
  const result = value('{ state = |checked| n = 9007199254740993123456789 nested = { date = 2026-08-20 } address = "home" kind = "note" value = true }');
  const fields = getQueryObjectFieldMetadata(result.value);
  assert.equal(fields.state.kind, 'symbol');
  assert.equal(fields.n.numericLexeme, '9007199254740993123456789');
  assert.equal(getQueryObjectFieldMetadata(result.value.nested).date.kind, 'date');
  assert.ok(Object.isFrozen(fields) && Object.isFrozen(fields.state));
  assert.equal(result.value.address, 'home');
  assert.equal(result.value.kind, 'note');
  assert.equal(result.value.value, true);
  assert.equal(getQueryValueMetadata(result), undefined);
  assert.deepEqual(Object.keys(result), ['type', 'value']);
});

test('accessors are missing-aware and explicitly do not recover JSON-lost metadata', () => {
  for (const input of [undefined, null, 1, 'text', {}, { type: 'bindingSet', bindings: [] }]) {
    assert.equal(getQueryValueMetadata(input), undefined);
    assert.deepEqual(getQueryObjectFieldMetadata(input), {});
  }
  const result = value('|checked|');
  assert.equal(getQueryValueMetadata(JSON.parse(JSON.stringify(result))), undefined);
  assert.deepEqual(getQueryObjectFieldMetadata(JSON.parse(JSON.stringify(value('{ state = |checked| }').value))), {});
});
