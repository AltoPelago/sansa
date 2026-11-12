import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {evaluateQuery, parseAddress, planMutation} from '../src/index.js';
const suite = JSON.parse(fs.readFileSync(new URL('./fixtures/child-identity/activation-admission.json', import.meta.url)));
function fixture(item) {
  const root = structuredClone(suite.namespace.root);
  const rows = new Map();
  const visit = b => {rows.set(b.address, b); for (const c of b.children) visit(c);}; visit(root);
  rows.get('$.selector').value = {type:'SansaAddressLiteral', address:item.path};
  const items = rows.get('$.items');
  switch (item.change) {
    case 'duplicate': items.children[1].identity = 'first'; break;
    case 'invalid': items.children[1].identity = 'bad!'; break;
    case 'current-no-address': delete items.address; break;
    case 'parent-outside': items.address = '$.outside'; break;
    case 'child-outside': items.children[0].address = '$.outside[0]'; break;
    case 'value-outside': items.children[0].children[0].address = '$.outside.name'; break;
    case 'value-selector': items.children[0].children[0].address = '$.items.*.name'; break;
    case 'root-no-address': delete root.address; break;
  }
  let calls = 0;
  const namespace = {root: item.change === 'rebase-items' ? items : root, children: b => b.children};
  if (item.change === 'rebase-items') {const param=rows.get('$.selector');param.address='$.items.selector';items.children.push(param);rows.set(param.address,param);}
  if (item.change !== 'unsupported') namespace.identity = b => {calls++; return b.identity;};
  return {namespace, rows, calls:()=>calls};
}
for (const item of suite.tests) test(`Identity activation: ${item.id}`, () => {
  const {namespace, rows, calls} = fixture(item);
  const options = structuredClone(item.options);
  const before = structuredClone(options);
  const r = evaluateQuery(item.query ?? `from ${item.source ?? '$'}\nselect path($.selector)`, namespace, options);
  const e = item.expected;
  assert.equal(r.ok,e.ok,JSON.stringify(r));
  assert.equal(calls(),e.identityCalls,JSON.stringify(r));
  assert.deepEqual(options,before);
  if (r.ok) {
    assert.deepEqual(r.results.map(r=>r.value.bindings.map(b=>b.address)),e.selected);
    for (const result of r.results) for (const b of result.value.bindings) assert.equal(b,rows.get(b.address));
  } else {
    assert.deepEqual(r.results,[]);
    for (const key of ['error','phase','candidateAddress','limit','observed','selectorIndex']) {
      if (key in e) assert.equal(r.errors[0][key === 'error' ? 'code' : key],e[key]);
    }
  }
});
test('forged policy AST cannot authorise a sibling scan using its canonical/exact claims', () => {
  const item = suite.tests[0];const {namespace,calls} = fixture(item);
  const ast = parseAddress('$.items.\\first\\').address;
  ast.isExact=true;ast.canonical='$.items';
  const r=evaluateQuery('from $\nselect path($.selector)',namespace,{addressActivation:{...item.options.addressActivation,allowedRoots:[ast]}});
  assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_QUERY_PATH_ACTIVATION_INVALID_POLICY');assert.equal(calls(),0);
});
test('forged activated AST is reparsed before policy scope decisions',()=>{
  const item=suite.tests[0];const {namespace,rows,calls}=fixture(item);
  const ast=parseAddress('$.items.\\first\\').address;ast.canonical='$.items[0]';ast.isExact=true;
  rows.get('$.selector').value=ast;
  const r=evaluateQuery('from $\nselect path($.selector)',namespace,{addressActivation:{...item.options.addressActivation,allowedRoots:['$.items[0]']}});
  assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_QUERY_PATH_ACTIVATION_DENIED');assert.equal(calls(),0);
});
test('identity activation counters are fresh and scope is checked again after identity access',()=>{
  const item=suite.tests[0];const {namespace,rows}=fixture(item);const options={...item.options,resolve:{maxIdentityInspections:2}};
  for(let i=0;i<2;i++)assert.equal(evaluateQuery('from $\nselect path($.selector)',namespace,options).ok,true);
  const read=namespace.identity;namespace.identity=b=>{const id=read(b);if(id==='first')b.address='$.outside';return id;};
  const r=evaluateQuery('from $\nselect path($.selector)',namespace,options);
  assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_QUERY_PATH_ACTIVATION_DENIED');assert.deepEqual(r.results,[]);
});
test('mutation preconditions cannot use explicitly opted-in identity activation',()=>{
  const item=suite.tests[0];const {namespace,calls}=fixture(item);
  const r=planMutation({operations:[{op:'remove',target:'$.items[0]'}],preconditions:[{expression:'isValue(path($.selector))'}]},namespace,item.options);
  assert.equal(r.ok,false);assert.equal(r.errors[0].cause.code,'SANSA_RESOLVE_UNSUPPORTED_SELECTOR');assert.equal(calls(),0);
});
test('invalid host binding limits are not masked by the activation ceiling',()=>{
  const item=suite.tests[0];const {namespace,calls}=fixture(item);
  const r=evaluateQuery('from $\nselect path($.selector)',namespace,{addressActivation:{...item.options.addressActivation,maxBindings:1},resolve:{maxBindings:Infinity}});
  assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_RESOLVE_INVALID_BINDING_LIMIT');assert.equal(calls(),0);
});

test('malformed or oversized caller identity ASTs fail without inspection',()=>{
  const item=suite.tests[0];
  for(const kind of ['selectors','oversized','qualifier']){
    const {namespace,rows,calls}=fixture(item);
    const ast=parseAddress('$.items.\\first\\').address;
    if(kind==='selectors')ast.selectors={};
    if(kind==='oversized')ast.selectors=Array.from({length:1025},()=>({type:'childIdentity',identity:'first'}));
    if(kind==='qualifier'){const q={terms:[]};q.terms.push(q);ast.qualifierExpression=q;}
    rows.get('$.selector').value={type:'SansaAddressLiteral',address:ast};
    const r=evaluateQuery('from $\nselect path($.selector)',namespace,item.options);
    assert.equal(r.ok,false);assert.equal(calls(),0);assert.deepEqual(r.results,[]);
  }
});
