import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrenchValueSemanticsProfile, evaluateValueSemanticsOperation } from '../src/index.js';

test('evaluates Shared AEON Value Semantics minimum-profile operations', () => {
  const equality = evaluateValueSemanticsOperation('equal', {
    left: { category: 'finiteNumber', value: '42' },
    right: { category: 'finiteNumber', value: '42' },
  });
  assert.equal(equality.ok, true);
  assert.equal(equality.value, true);

  const ordering = evaluateValueSemanticsOperation('compare', {
    left: { category: 'negativeInfinity' },
    right: { category: 'finiteNumber', value: '0' },
  });
  assert.equal(ordering.ok, true);
  assert.equal(ordering.relation, 'less');

  const ordinary = evaluateValueSemanticsOperation('isValue', {
    value: { category: 'positiveInfinity' },
  });
  assert.equal(ordinary.ok, true);
  assert.equal(ordinary.value, true);

  const container = evaluateValueSemanticsOperation('isValue', {
    value: { category: 'container', containerKind: 'list', value: [1, 2] },
  });
  assert.equal(container.ok, true);
  assert.equal(container.value, true);
});

test('rejects minimum-profile value comparisons that fail closed', () => {
  const nan = evaluateValueSemanticsOperation('equal', {
    left: { category: 'nan' },
    right: { category: 'nan' },
  });
  assert.equal(nan.ok, false);
  assert.equal(nan.reason, 'not_equality_comparable');

  const mixed = evaluateValueSemanticsOperation('equal', {
    left: { category: 'string', value: '42' },
    right: { category: 'finiteNumber', value: '42' },
  });
  assert.equal(mixed.ok, false);
  assert.equal(mixed.reason, 'mixed_categories');
});

test('evaluates explicit value-semantics profiles', () => {
  const defaultOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'string', value: 'éclair' },
    right: { category: 'string', value: 'zebre' },
  });
  assert.equal(defaultOrder.ok, true);
  assert.equal(defaultOrder.relation, 'greater');

  const frenchOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'string', value: 'éclair' },
    right: { category: 'string', value: 'zebre' },
  }, {
    valueSemantics: createFrenchValueSemanticsProfile(),
  });
  assert.equal(frenchOrder.ok, true);
  assert.equal(frenchOrder.relation, 'less');
});

test('evaluates minimum structural and reference-form equality', () => {
  const objects = evaluateValueSemanticsOperation('equal', {
    left: { category: 'container', containerKind: 'object', value: { a: 1, b: 'x' } },
    right: { category: 'container', containerKind: 'object', value: { b: 'x', a: 1 } },
  });
  assert.equal(objects.ok, true);
  assert.equal(objects.value, true);

  const listTuple = evaluateValueSemanticsOperation('equal', {
    left: { category: 'container', containerKind: 'list', value: [1, 2] },
    right: { category: 'container', containerKind: 'tuple', value: [1, 2] },
  });
  assert.equal(listTuple.ok, false);
  assert.equal(listTuple.reason, 'mixed_categories');

  const references = evaluateValueSemanticsOperation('equal', {
    left: { category: 'referenceForm', value: { kind: 'clone', target: '$.a' } },
    right: { category: 'referenceForm', value: { target: '$.a', kind: 'clone' } },
  });
  assert.equal(references.ok, true);
  assert.equal(references.value, true);
});
