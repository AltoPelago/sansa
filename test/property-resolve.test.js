import assert from 'node:assert/strict';
import {parseAddress, resolveAddress} from '../src/index.js';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {propertyHost, runPropertyVector} from './property-resolve-fixture.mjs';
const suite = JSON.parse(readFileSync(new URL('../fixtures/property-resolve-candidate-v1.json', import.meta.url)));
// The frozen vectors for key and structural handling still apply. The old
// head-dependent tag vectors describe a historical namespace and accounting.
for (const vector of suite.tests) {
  const input = JSON.stringify(vector.input);
  if (/&tag|headTag|nodeHeads|"property":"tag"/u.test(input)) continue;
  test(vector.id, () => runPropertyVector(vector));
}

test('tag inspects the current node in named, indexed and rebased scopes', () => {
  const {namespace, bindings} = propertyHost();
  for (const [source, ids, options] of [
    ['$.document&tag("document")', ['doc']],
    ['$.document.*&tag("product")', ['apple', 'orange']],
    ['$.document.*&key("product")', []],
    ['$.document.*&tag("document")', []],
    ['$.ordinary&tag("document")', []],
    ['?&tag("document")', ['doc'], {contextualRoot: bindings.get('doc')}],
    ['?&key("document")', [], {contextualRoot: bindings.get('doc')}],
  ]) {
    const parsed = parseAddress(source);
    assert.equal(parsed.ok, true);
    for (const address of [source, parsed.address]) {
      const result = resolveAddress(address, namespace, options);
      assert.equal(result.ok, true, JSON.stringify(result.errors));
      assert.deepEqual(result.bindings, ids.map(id => bindings.get(id)));
    }
  }
  const forged = parseAddress('$.document&tag("document")').address;
  forged.selectors.at(-1).property = 'headTag';
  assert.equal(resolveAddress(forged, namespace).errors[0].code, 'SANSA_RESOLVE_INVALID_ADDRESS');
});
