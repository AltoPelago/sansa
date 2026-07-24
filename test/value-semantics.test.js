import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFrenchValueSemanticsProfile,
  createNaturalAsciiValueSemanticsProfile,
  evaluateValueSemanticsOperation,
} from '../src/index.js';

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

  const concrete = evaluateValueSemanticsOperation('isValue', {
    value: { category: 'positiveInfinity' },
  });
  assert.equal(concrete.ok, true);
  assert.equal(concrete.value, true);

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

  const frenchProfileIdOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'string', value: 'éclair' },
    right: { category: 'string', value: 'zebre' },
  }, {
    valueSemantics: 'aeon.value.string.locale.fr.v1',
  });
  assert.equal(frenchProfileIdOrder.ok, true);
  assert.equal(frenchProfileIdOrder.relation, 'less');

  const naturalOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'string', value: 'part-2' },
    right: { category: 'string', value: 'part-10' },
  }, {
    valueSemantics: createNaturalAsciiValueSemanticsProfile(),
  });
  assert.equal(naturalOrder.ok, true);
  assert.equal(naturalOrder.relation, 'less');

  const naturalProfileIdOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'string', value: 'part-2' },
    right: { category: 'string', value: 'part-10' },
  }, {
    valueSemantics: 'aeon.value.string.natural.ascii.v1',
  });
  assert.equal(naturalProfileIdOrder.ok, true);
  assert.equal(naturalProfileIdOrder.relation, 'less');

  const completeCustomOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'string', value: 'a' },
    right: { category: 'string', value: 'b' },
  }, {
    valueSemantics: {
      compareStrings: () => 10,
      lowerString: (value) => value.toLowerCase(),
      upperString: (value) => value.toUpperCase(),
    },
  });
  assert.equal(completeCustomOrder.ok, true);
  assert.equal(completeCustomOrder.relation, 'greater');

  const partialCustomOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'string', value: 'a' },
    right: { category: 'string', value: 'b' },
  }, {
    valueSemantics: {
      compareStrings: () => 0,
    },
  });
  assert.equal(partialCustomOrder.ok, false);
  assert.equal(partialCustomOrder.reason, 'invalid_value_descriptor');
  assert.match(partialCustomOrder.error.message, /compareStrings, lowerString, and upperString together/);
});

test('evaluates same-family temporal value semantics', () => {
  const dateOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'temporal', semanticType: 'date', value: '2026-07-25' },
    right: { category: 'temporal', semanticType: 'date', value: '2025-01-01' },
  });
  assert.equal(dateOrder.ok, true);
  assert.equal(dateOrder.relation, 'greater');

  const dateEquality = evaluateValueSemanticsOperation('equal', {
    left: { category: 'temporal', semanticType: 'date', value: '2026-07-25' },
    right: { category: 'temporal', semanticType: 'date', value: '2026-07-25' },
  });
  assert.equal(dateEquality.ok, true);
  assert.equal(dateEquality.value, true);

  const crossFamily = evaluateValueSemanticsOperation('compare', {
    left: { category: 'temporal', semanticType: 'datetime', value: '2026-07-25T09:30:00Z' },
    right: { category: 'temporal', semanticType: 'date', value: '2026-07-25' },
  });
  assert.equal(crossFamily.ok, false);
  assert.equal(crossFamily.reason, 'mixed_categories');

  const temporalOnlyProfile = evaluateValueSemanticsOperation('compare', {
    left: { category: 'temporal', semanticType: 'date', value: '2026-07-25' },
    right: { category: 'temporal', semanticType: 'date', value: '2025-01-01' },
  }, {
    valueSemantics: {
      compareTemporal: () => -1,
    },
  });
  assert.equal(temporalOnlyProfile.ok, true);
  assert.equal(temporalOnlyProfile.relation, 'less');
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
