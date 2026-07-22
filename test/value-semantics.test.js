import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateValueSemanticsOperation } from '../src/index.js';

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
  assert.equal(ordinary.value, false);
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
