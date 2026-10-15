import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateQuery } from '../src/index.js';

function namespace(kind, value, metadata = {}, hook = true) {
  const child = { address: '$.value', name: 'value', representationKind: kind, value, children: [], ...metadata };
  const root = { address: '$', representationKind: 'ObjectLiteral', children: [child] };
  child.parent = root;
  return {
    root,
    children: (binding) => binding.children,
    parent: (binding) => binding.parent,
    ...(hook ? { representationKind: (binding) => binding.representationKind } : {}),
  };
}

const cases = [
  ['StringLiteral', 'string', 'text', '. == "text"'],
  ['NumberLiteral', 'number', '9007199254740993', '. == 9007199254740993', { numericLexeme: '9007199254740993' }],
  ['BooleanLiteral', 'boolean', true, '. == true'],
  ['ToggleLiteral', 'toggle', 'yes', '. == yes'],
  ['HexLiteral', 'hex', 'ff00aa', '. == #ff00aa'],
  ['RadixLiteral', 'radix', 'ff', '. == %ff'],
  ['EncodingLiteral', 'encoding', 'Zg==', '. == &Zg=='],
  ['SeparatorLiteral', 'separator', '1.2.3', '. == ^1.2.3'],
  ['SymbolicLiteral', 'symbol', 'approved', '. == |approved|'],
  ['SansaAddressLiteral', 'sansaAddress', '$.value', '. == $.value'],
  ['DateLiteral', 'date', '2024-02-29', '. == 2024-02-29', { semanticType: 'date' }],
  ['TimeLiteral', 'time', '10:20:30Z', '. == 10:20:30Z', { semanticType: 'time' }],
  ['DateTimeLiteral', 'datetime', '2024-02-29T10:20:30Z', '. == 2024-02-29T10:20:30Z', { semanticType: 'datetime' }],
  ['WTCDateTimeLiteral', 'wtc', '2024-02-29T10:20:30Z&Europe', '. == 2024-02-29T10:20:30Z&Europe', { semanticType: 'wtc' }],
  ['NullLiteral', 'null', null, 'isNull($.value)', { nullReason: 'notSet' }],
  ['NaNLiteral', 'nan', Number.NaN, 'isNaN($.value)'],
  ['InfinityLiteral', 'infinity', Infinity, 'isInfinity($.value)'],
];

for (const [portable, legacy, value, predicate, metadata] of cases) {
  test(`Query preserves ${portable} value semantics via host hooks and binding fields`, () => {
    for (const [kind, hook] of [[portable, true], [portable, false], [legacy, true], [legacy, false]]) {
      const host = namespace(kind, value, metadata, hook);
      const result = evaluateQuery(`from $.value where ${predicate} select .`, host);
      assert.equal(result.ok, true, `${kind} hook=${hook}: ${JSON.stringify(result.errors)}`);
      assert.equal(result.results.length, 1, `${kind} hook=${hook}`);
      const filtered = evaluateQuery(`from $.value%${kind} select .`, host);
      assert.equal(filtered.ok, true, JSON.stringify(filtered.errors));
      assert.equal(filtered.results.length, 1);
      assert.equal(host.root.children[0].representationKind, kind);
    }
  });
}

test('portable string-backed families do not acquire string equality or string functions', () => {
  for (const [kind, , value, , metadata] of cases.filter(([kind]) => [
    'ToggleLiteral', 'HexLiteral', 'RadixLiteral', 'EncodingLiteral',
    'SeparatorLiteral', 'SymbolicLiteral', 'SansaAddressLiteral',
    'DateLiteral', 'TimeLiteral', 'DateTimeLiteral', 'WTCDateTimeLiteral',
  ].includes(kind))) {
    for (const hook of [true, false]) {
      const host = namespace(kind, value, metadata, hook);
      for (const source of [`. == ${JSON.stringify(value)}`, `lower(.) == ${JSON.stringify(value)}`]) {
        const result = evaluateQuery(`from $.value where ${source} select .`, host);
        assert.equal(result.ok, false, `${kind} hook=${hook}: ${source}`);
      }
    }
  }
});

test('portable reduced-date clock bindings remain temporal but conservatively incomparable', () => {
  for (const [kind, family, payload] of [
    ['DateTimeLiteral', 'datetime', '2024-02T10Z'],
    ['WTCDateTimeLiteral', 'wtc', '2024-T10:&Europe'],
  ]) {
    for (const hook of [true, false]) {
      const host = namespace(kind, payload, { semanticType: family }, hook);
      const result = evaluateQuery(`from $.value select temporalRelation(., ${payload})`, host);
      assert.equal(result.ok, true, JSON.stringify(result.errors));
      assert.deepEqual(result.results[0].value, { type: 'scalar', value: 'incomparable' });
    }
  }
});

test('kind normalization preserves metadata precedence and does not guess unknown families', () => {
  const host = namespace('StringLiteral', 'approved', { scalarKind: 'symbol' });
  const hooked = evaluateQuery('from $.value where . == "approved" select .', host);
  assert.equal(hooked.ok, true, JSON.stringify(hooked.errors));
  assert.equal(hooked.results.length, 1);
  delete host.representationKind;
  const field = evaluateQuery('from $.value where . == |approved| select .', host);
  assert.equal(field.ok, true, JSON.stringify(field.errors));
  assert.equal(field.results.length, 1);

  for (const kind of ['MyDateLiteral', 'datetimeliteral', 'WtcDateTimeLiteral']) {
    const unknown = namespace(kind, '2024-02T10Z', { semanticType: 'datetime' });
    const result = evaluateQuery('from $.value select temporalRelation(., 2024-02T10Z)', unknown);
    assert.equal(result.ok, false, kind);
    assert.equal(result.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
  }
});
