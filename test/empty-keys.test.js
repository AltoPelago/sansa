import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAddress, resolveAddress, planMutation, planInstruction, validateMutationPlanTarget } from '../src/index.js';

function namespaceWithEmptyMembers() {
  const leaf = { address: '$.[""].[""]', name: '', representationKind: 'string', value: '', children: [] };
  const member = { address: '$.[""]', name: '', representationKind: 'object', children: [leaf] };
  const attribute = { address: '$.[""].@.[""]', name: '', representationKind: 'string', value: 'meta', children: [] };
  const attributeSpace = { address: '$.[""].@', representationKind: 'attributeSpace', children: [attribute] };
  member.attributeSpace = attributeSpace;
  const root = { address: '$', representationKind: 'object', children: [member] };
  return { root, children: entry => entry.children, attributeSpace: entry => entry.attributeSpace };
}

test('empty member names preserve exact addresses and resolve nested members and attributes', () => {
  const namespace = namespaceWithEmptyMembers();
  for (const source of ['$.[""]', '$.[""].[""]', '$.[""].@.[""]']) {
    const parsed = parseAddress(source);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
    assert.equal(parsed.address.canonical, source);
    assert.equal(parsed.address.isExact, true);
    assert.deepEqual(parseAddress(parsed.address.canonical).address, parsed.address);
    const resolved = resolveAddress(source, namespace);
    assert.equal(resolved.ok, true, JSON.stringify(resolved.errors));
    assert.deepEqual(resolved.bindings.map(binding => binding.address), [source]);
  }
  assert.equal(parseAddress('$.[""').ok, false);
  assert.equal(parseAddress('$.<"">').ok, false);
});

test('empty create names are present strings and retain conflict checks', () => {
  const namespace = namespaceWithEmptyMembers();
  const existing = planMutation({ op: 'create', parent: '$', name: '', value: '' }, namespace);
  assert.equal(existing.ok, false);
  assert.equal(existing.errors[0].code, 'SANSA_MUTATE_TARGET_EXISTS');
  namespace.root.children = [];
  const created = planMutation({ op: 'create', parent: '$', name: '', value: { '': '' } }, namespace);
  assert.equal(created.ok, true, JSON.stringify(created.errors));
  assert.equal(created.plan.operations[0].name, '');
  assert.equal(validateMutationPlanTarget(created.plan, 'aeon').ok, true);
  for (const name of [undefined, null, 0]) {
    const invalid = planMutation({ op: 'create', parent: '$', name, value: '' }, namespace);
    assert.equal(invalid.ok, false);
    assert.equal(invalid.errors[0].code, 'SANSA_MUTATE_INVALID_NAME');
  }
  const instruction = planInstruction('create $.[""] with ""', namespace);
  assert.equal(instruction.ok, true, JSON.stringify(instruction.errors));
  assert.equal(instruction.plan.operations[0].name, '');
});

test('replace and remove can target empty members', () => {
  const namespace = namespaceWithEmptyMembers();
  for (const op of ['replace', 'remove']) {
    const planned = planMutation({ op, target: '$.[""].[""]', ...(op === 'replace' ? { value: 'new' } : {}) }, namespace);
    assert.equal(planned.ok, true, JSON.stringify(planned.errors));
    assert.equal(validateMutationPlanTarget(planned.plan, 'aeon').ok, true);
  }
});
