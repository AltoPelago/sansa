import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateQuery, parseAddress, parseQuery, planMutation, planInstruction, resolveAddress} from '../src/index.js';
import {rowsFromNamespace, scopedNamespace, selectionRows} from '../tools/playground/namespace.mjs';

const workflow = JSON.parse(readFileSync(new URL('../fixtures/child-identity-workflows/workflows.json', import.meta.url)));
function namespaceFor(snapshot) {
  const root = {address: '$', representationKind: 'ObjectNode', children: []};
  const parent = {address: snapshot.parent, name: snapshot.parent.slice(2), representationKind: 'ObjectNode', children: []};
  const subtree = {address: snapshot.subtree, name: snapshot.subtree.split('.').at(-1), identity: 'stock1', representationKind: 'ObjectNode', children: []};
  const items = {address: `${subtree.address}.items`, name: 'items', representationKind: 'ListNode', children: []};
  for (const [index, identity] of snapshot.itemOrder.entries()) {
    const item = {address: `${items.address}[${index}]`, index, identity, representationKind: 'ObjectNode', children: []};
    item.children.push({address: `${item.address}.name`, name: 'name', identity: identity === 'item1' ? 'name1' : 'name2', representationKind: 'StringLiteral', value: identity === 'item1' ? snapshot.nameValue : 'Bracket', children: []});
    items.children.push(item);
  }
  subtree.children.push(items); parent.children.push(subtree);root.children.push(parent);
  root.children.push({address:'$.selection', name:'selection', representationKind:'sansa', semanticType:'sansa', value:{type:'SansaAddressLiteral',address:snapshot.selector}, children:[]});
  let inspections = 0;
  const namespace = {root,children:b=>b.children,identity:b=>{inspections++;return b.identity;}};
  return {namespace,subtree,items,inspections:()=>inspections};
}
for (const snapshot of workflow.snapshots) {
  test(`read-only workflow ${snapshot.id}: selection and structural provenance`, () => {
    const {namespace} = namespaceFor(snapshot);
    assert.equal(parseAddress(snapshot.selector).address.isExact, false);
    const selected = resolveAddress(snapshot.selector, namespace);
    assert.equal(selected.ok, true, JSON.stringify(selected.errors));
    assert.equal(selected.bindings[0].address, snapshot.namePath);
    assert.equal(selected.bindings[0].value, snapshot.nameValue);
    assert.equal(selected.bindings[0], resolveAddress(snapshot.namePath, namespace).bindings[0]);
    const rows = selectionRows(selected, rowsFromNamespace(namespace));
    assert.equal(rows[0].binding, selected.bindings[0]);
    assert.equal(rows[0].path, snapshot.namePath);
    const projected = evaluateQuery(`from ${snapshot.subtree}.items.*\nselect .\\name1\\`, namespace);
    assert.equal(projected.ok, true);
    assert.deepEqual(projected.results.map(r=>r.value.bindings.map(b=>b.address)), snapshot.projected);
    const filtered = evaluateQuery(`from ${snapshot.subtree}.items.*\nwhere exists(.\\name1\\)\nselect .\\name1\\`, namespace);
    assert.equal(filtered.ok, true);
    assert.deepEqual(filtered.results.map(r=>r.valueAddress), [snapshot.namePath]);
  });
  test(`read-only workflow ${snapshot.id}: rebased subtree excludes its root identity`, () => {
    const {namespace,subtree,items} = namespaceFor(snapshot);
    const scoped = scopedNamespace(namespace, snapshot.subtree);
    assert.equal(resolveAddress('$', scoped).bindings[0], subtree);
    assert.equal(subtree.representationKind, 'ObjectNode');
    assert.deepEqual(resolveAddress(workflow.scopedSelf, scoped).bindings, []);
    assert.deepEqual(resolveAddress('$.\\stock1\\', namespace).bindings, []);
    assert.equal(resolveAddress(workflow.scopedSelector, scoped).bindings[0].address, snapshot.namePath);
    assert.equal(resolveAddress(workflow.contextualSelector, scoped).bindings[0].address, snapshot.namePath);
    const listScope = scopedNamespace(namespace, items.address);
    assert.equal(resolveAddress('$', listScope).bindings[0].representationKind, 'ListNode');
    assert.equal(resolveAddress('$.\\item1\\.\\name1\\', listScope).bindings[0].address, snapshot.namePath);
  });
  test(`read-only workflow ${snapshot.id}: fresh Query budgets and no partial result`, () => {
    const {namespace} = namespaceFor(snapshot);
    const parsed = parseQuery(`from ${snapshot.selector}\nselect .`);
    assert.equal(parsed.ok, true);
    const options = {resolve:{maxIdentityInspections:4}};
    for(let repeat=0;repeat<2;repeat++)assert.equal(evaluateQuery(parsed.query,namespace,options).ok,true);
    const failed=evaluateQuery(parsed.query,namespace,{resolve:{maxIdentityInspections:3}});
    assert.equal(failed.ok,false);assert.deepEqual(failed.results,[]);
    assert.equal(failed.errors[0].code,'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');
    assert.equal(failed.errors[0].observed,4);
    assert.deepEqual(options,{resolve:{maxIdentityInspections:4}});
  });
}
test('moved subtree needs a new traversal route and newly authorised activation roots', () => {
  const before=workflow.snapshots[0], moved=workflow.snapshots[2];
  const {namespace,inspections}=namespaceFor(moved);
  assert.deepEqual(resolveAddress(before.selector,namespace).bindings,[]);
  const policy={allowedRoots:[before.subtree],allowedSelectors:['member','position','childIdentity'],allowContextualRoot:false};
  const calls=inspections();
  const denied=evaluateQuery('from $\nselect path($.selection)',namespace,{addressActivation:policy});
  assert.equal(denied.ok,false);assert.deepEqual(denied.results,[]);
  assert.equal(denied.errors[0].code,'SANSA_QUERY_PATH_ACTIVATION_DENIED');
  assert.equal(inspections(),calls,'scope denial precedes identity inspection');
  const allowed=evaluateQuery('from $\nselect path($.selection)',namespace,{addressActivation:{...policy,allowedRoots:[moved.parent]}});
  assert.equal(allowed.ok,true);assert.equal(allowed.results[0].valueAddress,moved.namePath);
});
test('identity reuse selects a replacement without proving occurrence continuity', () => {
  const before=workflow.snapshots[2],replacement=workflow.snapshots[3];
  const old=namespaceFor(before).namespace,fresh=namespaceFor(replacement).namespace;
  const captured=resolveAddress(before.selector,old).bindings[0];
  const current=resolveAddress(replacement.selector,fresh).bindings[0];
  assert.equal(captured.address,current.address);
  assert.notEqual(captured,current);assert.equal(captured.value,'Widget');assert.equal(current.value,'Replacement');
  assert.equal(resolveAddress(before.selector,old).bindings[0],captured,'old snapshot stays independently readable');
});
test('ambiguous siblings fail as a whole; IDs remain closed for mutations and Instructions', () => {
  const snapshot=workflow.snapshots[0];
  const {namespace,items}=namespaceFor(snapshot);
  items.children[1].identity='item1';
  const ambiguous=resolveAddress(snapshot.selector,namespace);
  assert.equal(ambiguous.ok,false);assert.deepEqual(ambiguous.bindings,[]);
  assert.equal(ambiguous.errors[0].code,'SANSA_RESOLVE_AMBIGUOUS_IDENTITY');
  const fresh=namespaceFor(snapshot);const opts={addressActivation:{allowedRoots:[snapshot.parent],allowedSelectors:['member','position','childIdentity']}};
  assert.equal(planMutation({op:'remove',target:snapshot.selector},fresh.namespace,opts).ok,false);
  assert.equal(planInstruction(`from ${snapshot.selector}\nremove .`,fresh.namespace,opts).ok,false);
  const precondition=planMutation({operations:[{op:'remove',target:snapshot.itemPath}],preconditions:[{expression:`exists(${snapshot.selector})`}]},fresh.namespace,opts);
  assert.equal(precondition.ok,false);assert.equal(fresh.inspections(),0);
});
