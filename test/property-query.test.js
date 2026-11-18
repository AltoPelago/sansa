import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateQuery,parseQuery,renderQuery} from '../src/index.js';
import {propertyHost} from './property-resolve-fixture.mjs';
const suite=JSON.parse(readFileSync(new URL('../fixtures/property-query-candidate-v1.json',import.meta.url)));
for(const vector of suite.tests) test(vector.id,()=>{
  const {input,expected}=vector;
  if(input.operation==='parse-query'){
    const r=parseQuery(input.source);
    const observed={ok:r.ok,canonical:r.query?.canonical,currentPropertyScope:r.query?.select.ast.scope,currentAddressRoot:r.query?.select.ast.address.root.kind};
    for(const [field,value] of Object.entries(expected)){assert.ok(Object.hasOwn(observed,field),field);assert.deepEqual(observed[field],value,field);}return;
  }
  for(const native of [false,true]){
    const host=propertyHost(input);let nestedResultsOk;
    if(input.reenter){let entered=false;const key=host.namespace.properties.key;
      host.namespace.properties.key=function(...args){if(!entered){entered=true; nestedResultsOk=evaluateQuery(input.reenter.source,host.namespace,{resolve:{maxPropertyInspections:input.reenter.maxPropertyInspections}}).ok;}return key.apply(this,args);};
    }
    const options=structuredClone(input.options??{});
    if(input.contextualRoot) options.resolve={...options.resolve,contextualRoot:host.bindings.get(input.contextualRoot)};
    const parsed=parseQuery(input.source);assert.equal(parsed.ok,true);
    let r;for(let i=0;i<(input.repeat??1);i++)r=evaluateQuery(native?parsed.query:input.source,host.namespace,options);
    const observed={ok:r.ok,records:r.results.map(row=>({candidate:row.binding.id,valueBindings:row.value.bindings.map(b=>b.id)})),calls:host.calls,nestedResultsOk};
    if(!r.ok)Object.assign(observed,r.errors[0],{error:r.errors[0].code});
    for(const [field,value]of Object.entries(expected)){
      assert.ok(Object.hasOwn(observed,field),`unasserted ${field}`);
      if(field==='calls')for(const [name,count]of Object.entries(value))assert.equal(observed.calls[name]??0,count,`${native} calls.${name}`);
      else assert.deepEqual(observed[field],value,`${native} ${field}`);
    }
    assert.equal(Object.getOwnPropertySymbols(r).length,0);
    assert.doesNotThrow(()=>JSON.stringify(r));
  }
});

test('Query retains separate frames for repeated handles through where, ordering and slicing',()=>{
  const root={address:'$'},a={address:'$.a'},b={address:'$.b'},shared={address:'$.shared'};
  const seen=[];
  const namespace={root,children:x=>x===root?[a,b]:x===a||x===b?[shared]:[],attributeSpace:x=>x,
    value:()=>1,properties:{scope(binding,ctx){assert.ok(Object.isFrozen(ctx));seen.push(ctx);return binding===ctx.scopeRoot?'root':'inside';},key(binding,ctx){assert.equal(binding,shared);return ctx.scopeRoot===a?'a':'b';}}};
  const source='from $.*.@.*\nwhere exists(.&key("a")) or exists(.&key("b"))\norder by exists(.&key("a")) == true asc\nselect .';
  // Boolean order keys are intentionally rejected; failure keeps no records.
  assert.equal(evaluateQuery(source,namespace).ok,false);
  const result=evaluateQuery('from $.*.@.*\nwhere exists(.&key("a")) or exists(.&key("b"))\norder by . asc\noffset 1\nselect .&key("b")',namespace);
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.results.length,1);assert.deepEqual(result.results[0].value.bindings,[shared]);
  assert.ok(seen.some(c=>c.scopeRoot===a));assert.ok(seen.some(c=>c.scopeRoot===b));
});
test('whole-query capability preflight precedes empty and short-circuit traversal',()=>{
  for(const clause of ['where false and exists(.&tag("x"))\nselect .','order by .&headTag("x") asc\nselect .','select { x = .&tag("x") }']){
    const h=propertyHost({omit:['nodeHeads']});const r=evaluateQuery('from $.missing\n'+clause,h.namespace);
    assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_RESOLVE_UNSUPPORTED_TAG');assert.equal(r.errors[0].phase,'policy');assert.equal(h.calls.children??0,0);assert.equal(h.calls.scope??0,0);
  }
});
test('projection reads and order keys share the budget; failures expose no partial records',()=>{
  for(const [query,phase]of [
    ['from $.document\nselect { a = .&key("document") b = .&key("document") }','select'],
    ['from $.document\nwhere exists(.&key("document"))\norder by .&key("document") asc\nselect .','order'],
  ]){const h=propertyHost();h.namespace.value=()=>1;const r=evaluateQuery(query,h.namespace,{resolve:{maxPropertyInspections:1}});assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED');assert.equal(r.errors[0].phase,phase);assert.deepEqual(r.results,[]);assert.equal(h.calls.scope,1);}
});
test('container and head predicates retain their targets and permit explicit child navigation',()=>{
  for(const [suffix,id]of [['.&tag("catalog")','doc'],['.*&headTag("catalog")','docHead']]){
    const h=propertyHost();const r=evaluateQuery('from $.document\nselect '+suffix,h.namespace);assert.equal(r.ok,true);assert.deepEqual(r.results[0].value.bindings,[h.bindings.get(id)]);
  }
});
test('property Query options, caller snapshots and current shorthand are bounded and checked',()=>{
  for(const value of [true,false,null,-1,.5,1_000_001,NaN,Infinity]){const h=propertyHost();const r=evaluateQuery('from $.missing\nselect .&key("x")',h.namespace,{resolve:{maxPropertyInspections:value}});assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_RESOLVE_INVALID_PROPERTY_LIMIT');assert.deepEqual(h.calls,{});}
  assert.equal(parseQuery('from $\nselect . &key("x")').ok,false);
  const h=propertyHost();const q=parseQuery('from $.document\nselect .&key("document")').query;const before=structuredClone(q);
  const scope=h.namespace.properties.scope;h.namespace.properties.scope=(b,c)=>{q.select.ast.address.selectors[0].value='changed';return scope(b,c);};
  const r=evaluateQuery(q,h.namespace);assert.equal(r.ok,true);assert.equal(r.results[0].value.bindings[0],h.bindings.get('doc'));
  assert.equal(renderQuery(before),'from $.document\nselect .&key("document")');
});

test('dynamic from activation retains attribute/local boundaries without admitting property activation',()=>{
  for(const target of ['$.document.<"private">','$.document.@']){
    const h=propertyHost();const param={id:'param',key:'param',address:'$.param',children:[],value:{type:'SansaAddressLiteral',address:target}};
    h.bindings.set('param',param);h.bindings.get('r').children.push('param');
    const r=evaluateQuery('from path($.param)\nselect .&key("fakePrivate")',h.namespace,{addressActivation:'trusted'});
    assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(r.results[0].value.bindings,[]);
  }
});
test('maxBindings is enforced before a later property filter and result limits never rescue errors',()=>{
  const h=propertyHost();const r=evaluateQuery('from $.*&key("absent")\nlimit 0\nselect .',h.namespace,{resolve:{maxBindings:1}});
  assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_RESOLVE_BINDING_LIMIT_EXCEEDED');assert.equal(r.errors[0].phase,'from');assert.equal(h.calls.scope??0,0);assert.deepEqual(r.results,[]);
});
test('caller property Query cannot hide accessors behind an earlier matching selector',()=>{
  for(const fault of ['selectorExtra','laterExpression','unknownExpression']){
    const h=propertyHost();const q=parseQuery('from $.document&key("document")\nselect true').query;let reads=0;
    if(fault==='selectorExtra')Object.defineProperty(q.from.address.selectors.at(-1),'extra',{get(){reads++;return'x';}});
    if(fault==='laterExpression')Object.defineProperty(q.select.ast,'value',{get(){reads++;return true;}});
    if(fault==='unknownExpression')q.select.ast={type:'unknownExpression'};
    const r=evaluateQuery(q,h.namespace);assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_RESOLVE_INVALID_ADDRESS');assert.equal(reads,0);assert.deepEqual(h.calls,{});
  }
});
