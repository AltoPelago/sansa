import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAddress, renderAddress, parseQuery, resolveAddress, evaluateQuery} from '../src/index.js';

test('numeric qualifiers retain decimal syntax and original identity bindings', () => {
  const selected = {identity: 'x', name: 'x', address: '$.x'};
  const root = {};
  const namespace = {root, children: b => b === root ? [selected] : [], identity: b => b.identity};
  for (const decimal of ['0.0000001', '-0.0000001', '1000000000000000000000',
    '0.' + '0'.repeat(323) + '5', '1' + '0'.repeat(308), '1' + '0'.repeat(309)]) {
    const source = '$.\\x\\:Q[' + decimal + ']';
    const parsed = parseAddress(source);
    assert.equal(parsed.ok, true, source);
    const rendered = renderAddress(parsed.address);
    assert.doesNotMatch(rendered, /[eE][+-]?\d/);
    assert.deepEqual(parseAddress(rendered).address, parsed.address);
    for (const address of [source, parsed.address]) {
      const result = resolveAddress(address, namespace);
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.deepEqual(result.bindings, [selected]);
      assert.equal(result.bindings[0], selected);
    }
    const query = 'from ' + source + '\nselect .';
    assert.equal(parseQuery(query).ok, true);
    const result = evaluateQuery(query, namespace);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.results[0].binding, selected);
  }
});

test('non-finite caller numeric payloads remain invalid before namespace inspection', () => {
  const base = parseAddress('$.\\x\\:Q[1]').address;
  for (const value of [NaN, Infinity, -Infinity, '1]|Other[2']) {
    const address = structuredClone(base);
    address.qualifierExpression.terms[0].arguments[0].value = value;
    const result = resolveAddress(address, {get root() { throw new Error('namespace inspected'); }});
    assert.equal(result.errors[0].code, 'SANSA_RESOLVE_INVALID_ADDRESS');
  }
});
