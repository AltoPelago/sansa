import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {evaluateQuery, parseQuery, planInstruction, planMutation, resolveAddress} from '../src/index.js';
const suite = JSON.parse(fs.readFileSync(new URL('./fixtures/child-identity/query-admission.json', import.meta.url)));
function fixture(change) {
  const root = structuredClone(suite.namespace.root);
  const nodes = new Map();
  const visit = b => { nodes.set(b.address, b); b.children.forEach(visit); };
  visit(root);
  if (change === 'tie') nodes.get('$.items[0].name').value = 'A';
  if (change === 'duplicate') nodes.get('$.items[1]').identity = 'first';
  if (change === 'invalid') nodes.get('$.items[1]').identity = 'bad!';
  let calls = 0;
  const namespace = { root, children: b => b.children };
  if (change !== 'unsupported') namespace.identity = b => { calls++; return b.identity; };
  return {namespace, nodes, calls: () => calls};
}
for (const item of suite.tests) test(`Query identity: ${item.id}`, () => {
  const {namespace, nodes, calls} = fixture(item.change);
  const options = structuredClone(item.options ?? {});
  const before = structuredClone(options);
  const result = evaluateQuery(item.query, namespace, options);
  const e = item.expected;
  assert.equal(result.ok, e.ok, JSON.stringify(result));
  assert.equal(calls(), e.identityCalls);
  assert.deepEqual(options, before, 'caller options are not session state');
  if (!result.ok) {
    assert.deepEqual(result.results, []);
    for (const field of ['error', 'phase', 'candidateAddress', 'limit', 'observed', 'selectorIndex', 'identity']) {
      if (field in e) assert.equal(result.errors[0][field === 'error' ? 'code' : field], e[field]);
    }
  } else {
    assert.deepEqual(result.results.map(r => r.candidateAddress), e.candidates);
    assert.deepEqual(result.results.map(r => r.value.bindings.map(b => b.address)), e.selected);
    for (const r of result.results) {
      assert.equal(r.binding, nodes.get(r.candidateAddress));
      for (const b of r.value.bindings) assert.equal(b, nodes.get(b.address));
      assert.equal(r.valueAddress, r.value.bindings.length === 1 ? r.value.bindings[0].address : undefined);
    }
  }
});
test('Query budgets are fresh across invocations and parsed query reuse', () => {
  const {namespace} = fixture();
  const parsed = parseQuery('from $.items.\\first\\\nselect .');
  assert.equal(parsed.ok, true);
  const options = {resolve: {maxIdentityInspections: 2}};
  for (let i = 0; i < 2; i++) assert.equal(evaluateQuery(parsed.query, namespace, options).ok, true);
  assert.equal(resolveAddress('$.items.\\first\\', namespace, options.resolve).ok, true);
});
test('Query identity is independent of indexes after a new structural snapshot', () => {
  const {namespace} = fixture();
  namespace.root.children[0].children.reverse().forEach((b, index) => {
    b.index = index; b.address = `$.items[${index}]`;
    b.children[0].address = `${b.address}.name`;
  });
  const r = evaluateQuery('from $.items.\\first\\\nselect .\\label\\', namespace);
  assert.equal(r.ok, true);
  assert.equal(r.results[0].candidateAddress, '$.items[1]');
  assert.equal(r.results[0].valueAddress, '$.items[1].name');
});
test('Query activation, Instruction and mutation remain separately guarded', () => {
  const {namespace, calls} = fixture();
  const param = {name: 'selector', address: '$.selector', value: {type: 'SansaAddressLiteral', address: '$.items.\\first\\'}, representationKind: 'sansa', semanticType: 'sansa', children: []};
  namespace.root.children.push(param);
  const activation = evaluateQuery('from $.selector\nselect path(.)', namespace, {addressActivation: 'trusted'});
  assert.equal(activation.ok, false);
  assert.equal(activation.errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_SELECTOR');
  assert.equal(planMutation({op: 'remove', target: '$.items.\\first\\'}, namespace).ok, false);
  const instruction = planInstruction('from $.items.\\first\\\nremove .', namespace);
  assert.equal(instruction.ok, false);
  assert.equal(calls(), 0);
});

test('mutation preconditions keep identity expressions closed', () => {
  const {namespace, calls} = fixture();
  const r = planMutation({operations: [{op: 'remove', target: '$.items[0]'}],
    preconditions: [{expression: 'exists($.items.\\first\\)'}]}, namespace);
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED');
  assert.equal(r.errors[0].cause.code, 'SANSA_RESOLVE_UNSUPPORTED_SELECTOR');
  assert.equal(calls(), 0);
});
test('reentrant Query invocations own independent inspection budgets', () => {
  const {namespace} = fixture();
  const query = 'from $.items.\\first\\\nselect .';
  const options = {resolve: {maxIdentityInspections: 2}};
  const read = namespace.identity;
  let nested = false;
  namespace.identity = b => {
    if (!nested) {
      nested = true;
      assert.equal(evaluateQuery(query, namespace, options).ok, true);
    }
    return read(b);
  };
  assert.equal(evaluateQuery(query, namespace, options).ok, true);
});
