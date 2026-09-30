import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareExactCrossBaseRadixValues,
  compareExactRadixValues,
  compareTemporalClaims,
  createCrossBaseRadixNumericValueSemanticsProfile,
  createFrenchValueSemanticsProfile,
  createNaturalAsciiValueSemanticsProfile,
  createRadixNumericValueSemanticsProfile,
  evaluateValueSemanticsOperation,
  radixScaleOf,
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

test('compares finite numeric lexemes without JavaScript number precision loss', () => {
  const largeInteger = evaluateValueSemanticsOperation('compare', {
    left: { category: 'finiteNumber', value: '9007199254740993' },
    right: { category: 'finiteNumber', value: '9007199254740992' },
  });
  assert.equal(largeInteger.ok, true);
  assert.equal(largeInteger.relation, 'greater');

  const longFraction = evaluateValueSemanticsOperation('equal', {
    left: { category: 'finiteNumber', value: '0.1000000000000000000000000000000001' },
    right: { category: 'finiteNumber', value: '0.1' },
  });
  assert.equal(longFraction.ok, true);
  assert.equal(longFraction.value, false);

  const exponentEquivalent = evaluateValueSemanticsOperation('equal', {
    left: { category: 'finiteNumber', value: '-12.50' },
    right: { category: 'finiteNumber', value: '-1.25e1' },
  });
  assert.equal(exponentEquivalent.ok, true);
  assert.equal(exponentEquivalent.value, true);

  const extremeExponent = evaluateValueSemanticsOperation('compare', {
    left: { category: 'finiteNumber', value: '1e999999999999999999999' },
    right: { category: 'finiteNumber', value: '9e999999999999999999998' },
  });
  assert.equal(extremeExponent.ok, true);
  assert.equal(extremeExponent.relation, 'greater');
});

test('compares exact same-base radix values without host-number conversion', () => {
  assert.equal(compareExactRadixValues('001.100', '1.1', 2), 0);
  assert.equal(compareExactRadixValues('-A.8', '-A.7', 16), -1);
  assert.equal(compareExactRadixValues('!', '&', 64), 1);
  assert.equal(compareExactRadixValues('2', '1', 2), null);
  assert.equal(compareExactRadixValues('1e3', '1', 10), null);
});

test('reports radix fractional scale without normalizing representation', () => {
  assert.equal(radixScaleOf('19.9900', 10), 4);
  assert.equal(radixScaleOf('19.99', 10), 2);
  assert.equal(radixScaleOf('101', 2), 0);
  assert.equal(radixScaleOf('-.0_0', 2), 2);
  assert.equal(radixScaleOf('A.0', 10), null);
  assert.equal(radixScaleOf('1.', 10), null);

  const scale = evaluateValueSemanticsOperation('radixScale', {
    value: { category: 'radix', semanticType: 'decimal', value: '19.9900' },
  });
  assert.deepEqual(scale, { ok: true, outcome: 'value', value: 4 });

  const nonRadix = evaluateValueSemanticsOperation('radixScale', {
    value: { category: 'finiteNumber', value: '19.9900' },
  });
  assert.equal(nonRadix.ok, false);
  assert.equal(nonRadix.reason, 'radix_required');
});

test('applies explicit same-base radix numeric semantics', () => {
  const profile = createRadixNumericValueSemanticsProfile();
  const equal = evaluateValueSemanticsOperation('equal', {
    left: { category: 'radix', semanticType: 'decimal', value: '19.9900' },
    right: { category: 'radix', value: '19.99' },
  }, { valueSemantics: profile });
  assert.equal(equal.ok, true);
  assert.equal(equal.value, true);

  const ordering = evaluateValueSemanticsOperation('compare', {
    left: { category: 'radix', semanticType: 'radix[2]', value: '10.01' },
    right: { category: 'radix', radixBase: 2, value: '10.1' },
  }, { valueSemantics: 'radix-numeric' });
  assert.equal(ordering.ok, true);
  assert.equal(ordering.relation, 'less');

  const crossBase = evaluateValueSemanticsOperation('equal', {
    left: { category: 'radix', radixBase: 2, value: '10' },
    right: { category: 'radix', radixBase: 10, value: '2' },
  }, { valueSemantics: profile });
  assert.equal(crossBase.ok, false);
  assert.equal(crossBase.reason, 'mixed_radix_bases');

  const unknownBase = evaluateValueSemanticsOperation('equal', {
    left: { category: 'radix', value: '10' },
    right: { category: 'radix', value: '10' },
  }, { valueSemantics: profile });
  assert.equal(unknownBase.ok, false);
  assert.equal(unknownBase.reason, 'radix_base_required');
});

test('compares cross-base radix values exactly under an explicit profile', () => {
  assert.equal(compareExactCrossBaseRadixValues('10', 2, '2', 10), 0);
  assert.equal(compareExactCrossBaseRadixValues('.1', 2, '.5', 10), 0);
  assert.equal(compareExactCrossBaseRadixValues('.1', 3, '.333', 10), 1);
  assert.equal(compareExactCrossBaseRadixValues('-A', 16, '-9', 10), -1);
  assert.equal(compareExactCrossBaseRadixValues('a', 37, '36', 10), 0);
  assert.equal(compareExactCrossBaseRadixValues('2', 2, '2', 10), null);

  const profile = createCrossBaseRadixNumericValueSemanticsProfile();
  const equal = evaluateValueSemanticsOperation('equal', {
    left: { category: 'radix', semanticType: 'radix[2]', value: '10' },
    right: { category: 'radix', semanticType: 'decimal', value: '2.0' },
  }, { valueSemantics: profile });
  assert.equal(equal.ok, true);
  assert.equal(equal.value, true);

  const ordered = evaluateValueSemanticsOperation('compare', {
    left: { category: 'radix', radixBase: 3, value: '.1' },
    right: { category: 'radix', radixBase: 10, value: '.333' },
  }, { valueSemantics: 'radix-numeric-cross-base' });
  assert.equal(ordered.ok, true);
  assert.equal(ordered.relation, 'greater');

  const sameBaseStillRejects = evaluateValueSemanticsOperation('equal', {
    left: { category: 'radix', radixBase: 2, value: '10' },
    right: { category: 'radix', radixBase: 10, value: '2' },
  }, { valueSemantics: 'radix-numeric' });
  assert.equal(sameBaseStillRejects.ok, false);
  assert.equal(sameBaseStillRejects.reason, 'mixed_radix_bases');
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

  const completeCustomEquality = evaluateValueSemanticsOperation('equal', {
    left: { category: 'string', value: 'a' },
    right: { category: 'string', value: 'b' },
  }, {
    valueSemantics: {
      compareStrings: () => 0,
      lowerString: (value) => value.toLowerCase(),
      upperString: (value) => value.toUpperCase(),
    },
  });
  assert.equal(completeCustomEquality.ok, true);
  assert.equal(completeCustomEquality.value, true);

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

test('relates temporal claims as completion sets without inventing missing context', () => {
  const temporal = (semanticType, payload) => ({ semanticType, payload });

  assert.equal(compareTemporalClaims(temporal('time', '10:Z'), temporal('time', '10:30Z')), 'contains');
  assert.equal(compareTemporalClaims(temporal('date', '2024-'), temporal('date', '2024-02')), 'contains');
  assert.equal(compareTemporalClaims(temporal('date', '2024-02'), temporal('date', '2024-02-29')), 'contains');
  assert.equal(compareTemporalClaims(temporal('date', '2024-02-29'), temporal('date', '2024-02')), 'containedBy');
  assert.equal(compareTemporalClaims(temporal('date', '2024-02'), temporal('date', '2024-03')), 'before');
  assert.equal(compareTemporalClaims(temporal('date', '2024-03'), temporal('date', '2024-02')), 'after');
  assert.equal(compareTemporalClaims(temporal('time', '10:30Z'), temporal('time', '10:Z')), 'containedBy');
  assert.equal(compareTemporalClaims(temporal('time', '10:30:00.34Z'), temporal('time', '10:30:00.340Z')), 'equal');
  assert.equal(compareTemporalClaims(temporal('time', '10:Z'), temporal('time', '11:Z')), 'before');
  assert.equal(compareTemporalClaims(temporal('time', '11:Z'), temporal('time', '10:Z')), 'after');
  assert.equal(compareTemporalClaims(temporal('time', '10:30Z'), temporal('datetime', '2023-03-01T10:30Z')), 'incomparable');
  assert.equal(compareTemporalClaims(temporal('time', '10:30-00:00'), temporal('time', '10:30Z')), 'incomparable');
  assert.equal(compareTemporalClaims(temporal('time', '10:30+01:00'), temporal('time', '09:30Z')), 'incomparable');
  assert.equal(compareTemporalClaims(temporal('datetime', '2027-01-31T10:30+01:00'), temporal('datetime', '2027-01-31T09:30Z')), 'equal');
  assert.equal(compareTemporalClaims(temporal('datetime', '2027-01-31T10Z'), temporal('datetime', '2027-01-31T10+00:30')), 'overlaps');
  assert.equal(compareTemporalClaims(temporal('time', '23:59:60Z'), temporal('time', '00:00:00Z')), 'incomparable');
  assert.equal(
    compareTemporalClaims(
      temporal('wtc', '2027-01-31T23:59:59&Australia/Melbourne'),
      temporal('wtc', '2027-01-31T23:59:59&Europe/Brussels'),
    ),
    'incomparable',
  );

  const operation = evaluateValueSemanticsOperation('temporalRelation', {
    left: { category: 'temporal', semanticType: 'time', value: '10:Z' },
    right: { category: 'temporal', semanticType: 'time', value: '10:30Z' },
  });
  assert.equal(operation.ok, true);
  assert.equal(operation.relation, 'contains');

  const nonTemporal = evaluateValueSemanticsOperation('temporalRelation', {
    left: { category: 'string', value: '10:Z' },
    right: { category: 'string', value: '10:30Z' },
  });
  assert.equal(nonTemporal.ok, false);
  assert.equal(nonTemporal.reason, 'temporal_required');
});

test('evaluates lexical structured scalar value-family boundaries', () => {
  const toggleSpelling = evaluateValueSemanticsOperation('equal', {
    left: { category: 'toggle', value: 'yes' },
    right: { category: 'toggle', value: 'on' },
  });
  assert.equal(toggleSpelling.ok, true);
  assert.equal(toggleSpelling.value, false);

  const toggleBoolean = evaluateValueSemanticsOperation('equal', {
    left: { category: 'toggle', value: 'yes' },
    right: { category: 'boolean', value: true },
  });
  assert.equal(toggleBoolean.ok, false);
  assert.equal(toggleBoolean.reason, 'mixed_categories');

  const hexIdentity = evaluateValueSemanticsOperation('equal', {
    left: { category: 'hex', value: 'ff00aa' },
    right: { category: 'hex', value: 'ff00aa' },
  });
  assert.equal(hexIdentity.ok, true);
  assert.equal(hexIdentity.value, true);

  const hexRadix = evaluateValueSemanticsOperation('equal', {
    left: { category: 'hex', value: '10' },
    right: { category: 'radix', semanticType: 'radix[16]', value: '10' },
  });
  assert.equal(hexRadix.ok, false);
  assert.equal(hexRadix.reason, 'mixed_categories');

  const radixSameMetadata = evaluateValueSemanticsOperation('equal', {
    left: { category: 'radix', semanticType: 'radix[16]', value: '10' },
    right: { category: 'radix', semanticType: 'radix[16]', value: '10' },
  });
  assert.equal(radixSameMetadata.ok, true);
  assert.equal(radixSameMetadata.value, true);

  const radixDifferentMetadata = evaluateValueSemanticsOperation('equal', {
    left: { category: 'radix', semanticType: 'radix[16]', value: '10' },
    right: { category: 'radix', semanticType: 'radix8', value: '10' },
  });
  assert.equal(radixDifferentMetadata.ok, true);
  assert.equal(radixDifferentMetadata.value, false);

  const decimalRepresentation = evaluateValueSemanticsOperation('equal', {
    left: { category: 'radix', semanticType: 'decimal', value: '19.9900' },
    right: { category: 'radix', semanticType: 'decimal', value: '19.99' },
  });
  assert.equal(decimalRepresentation.ok, true);
  assert.equal(decimalRepresentation.value, false);

  const decimalOrdering = evaluateValueSemanticsOperation('compare', {
    left: { category: 'radix', semanticType: 'decimal', value: '19.9900' },
    right: { category: 'radix', semanticType: 'decimal', value: '20.00' },
  });
  assert.equal(decimalOrdering.ok, false);
  assert.equal(decimalOrdering.reason, 'not_orderable');

  const encodingOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'encoding', value: 'A' },
    right: { category: 'encoding', value: 'B' },
  });
  assert.equal(encodingOrder.ok, true);
  assert.equal(encodingOrder.relation, 'less');

  const separatorOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'separator', value: '0.11.0' },
    right: { category: 'separator', value: '0.9.9' },
  });
  assert.equal(separatorOrder.ok, true);
  assert.equal(separatorOrder.relation, 'less');

  const symbolIdentity = evaluateValueSemanticsOperation('equal', {
    left: { category: 'symbol', value: 'approved' },
    right: { category: 'symbol', value: 'approved' },
  });
  assert.equal(symbolIdentity.ok, true);
  assert.equal(symbolIdentity.value, true);

  const symbolString = evaluateValueSemanticsOperation('equal', {
    left: { category: 'symbol', value: 'approved' },
    right: { category: 'string', value: 'approved' },
  });
  assert.equal(symbolString.ok, false);
  assert.equal(symbolString.reason, 'mixed_categories');

  const symbolOrder = evaluateValueSemanticsOperation('compare', {
    left: { category: 'symbol', value: 'approved' },
    right: { category: 'symbol', value: 'pending' },
  });
  assert.equal(symbolOrder.ok, false);
  assert.equal(symbolOrder.reason, 'not_orderable');

  const sansaIdentity = evaluateValueSemanticsOperation('equal', {
    left: { category: 'sansaAddress', value: '$.inventory.items.*.sku' },
    right: { category: 'sansaAddress', value: '$.inventory.items.*.sku' },
  });
  assert.equal(sansaIdentity.ok, true);
  assert.equal(sansaIdentity.value, true);
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

  const referenceKinds = evaluateValueSemanticsOperation('equal', {
    left: { category: 'referenceForm', value: { kind: 'clone', target: '$.a' } },
    right: { category: 'referenceForm', value: { kind: 'pointer', target: '$.a' } },
  });
  assert.equal(referenceKinds.ok, true);
  assert.equal(referenceKinds.value, false);
});
