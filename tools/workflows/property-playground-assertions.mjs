import assert from 'node:assert/strict';
import {resolveAddress} from '../../src/index.js';
import {selectionRows} from '../playground/namespace.mjs';

export function verifyPropertySelection(selected, example, owner, rows, id) {
  assert.equal(selected.ok, true, id);
  const original = binding => {
    const exact = resolveAddress(binding.address, owner);
    assert.equal(exact.ok, true, id);
    assert.equal(exact.bindings.length, 1, id);
    assert.equal(binding, exact.bindings[0], id);
  };
  const project = bindings => {
    const projected = selectionRows({bindings}, rows);
    for (let i = 0; i < bindings.length; i++) {
      assert.equal(projected[i].binding, bindings[i], id);
      original(bindings[i]);
    }
  };
  if (example.view === 'query') {
    assert.deepEqual(selected.results.map(entry => entry.candidateAddress), example.expectedCandidatePaths, id);
    for (const entry of selected.results) {
      assert.equal(entry.binding.address, entry.candidateAddress, id);
      original(entry.binding);
      assert.equal(entry.value.type, 'bindingSet', id);
      project(entry.value.bindings);
    }
    assert.deepEqual(selected.results.flatMap(entry => entry.value.bindings.map(binding => binding.address)), example.expectedQueryPaths, id);
  } else {
    assert.deepEqual(selected.bindings.map(binding => binding.address), example.expectedPaths, id);
    project(selected.bindings);
  }
}
