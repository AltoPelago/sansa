import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateQuery,parseQuery,renderQuery} from '../src/index.js';
import {propertyHost} from './property-resolve-fixture.mjs';
import {runPropertyQueryVector} from './property-query-fixture.mjs';
const suite=JSON.parse(readFileSync(new URL('../fixtures/property-query-candidate-v1.json',import.meta.url)));
for (const vector of suite.tests) {
  const adjusted = structuredClone(vector);
  adjusted.input.source = adjusted.input.source?.replace('&tag("catalog")', '&tag("document")');
  if (adjusted.input.omit?.includes('nodeHeads')) adjusted.input.omit = ['nodeTag'];
  const limit = adjusted.input.options?.resolve?.maxPropertyInspections;
  if (adjusted.id === 'sansa-properties-query-shared-exact') {
    adjusted.input.options.resolve.maxPropertyInspections = limit - 1;
    adjusted.expected.calls.scope -= 1;
  } else if (adjusted.id === 'sansa-properties-query-shared-overflow') {
    adjusted.input.options.resolve.maxPropertyInspections = limit - 1;
    adjusted.expected.limit -= 1;
    adjusted.expected.observed -= 1;
  }
  test(vector.id, () => runPropertyQueryVector(adjusted));
}


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
  for(const clause of ['where false and exists(.&tag("x"))\nselect .','order by .&tag("x") asc\nselect .','select { x = .&tag("x") }']){
    const h=propertyHost({omit:['nodeTag']});const r=evaluateQuery('from $.missing\n'+clause,h.namespace);
    assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_RESOLVE_UNSUPPORTED_TAG');assert.equal(r.errors[0].phase,'policy');assert.equal(h.calls.children??0,0);assert.equal(h.calls.scope??0,0);
  }
});
test('projection reads and order keys share the budget; failures expose no partial records',()=>{
  for(const [query,phase]of [
    ['from $.document\nselect { a = .&key("document") b = .&key("document") }','select'],
    ['from $.document\nwhere exists(.&key("document"))\norder by .&key("document") asc\nselect .','order'],
  ]){const h=propertyHost();h.namespace.value=()=>1;const r=evaluateQuery(query,h.namespace,{resolve:{maxPropertyInspections:1}});assert.equal(r.ok,false);assert.equal(r.errors[0].code,'SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED');assert.equal(r.errors[0].phase,phase);assert.deepEqual(r.results,[]);assert.equal(h.calls.scope,1);}
});
test('node predicates retain their targets and permit explicit child navigation',()=>{
  for(const [suffix,ids]of [['.&tag("document")',['doc']],['.*&tag("product")',['apple','orange']]]){
    const h=propertyHost();const r=evaluateQuery('from $.document\nselect '+suffix,h.namespace);assert.equal(r.ok,true);assert.deepEqual(r.results[0].value.bindings,ids.map(id => h.bindings.get(id)));
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


test('QA-0091: untouched shared qualifier ASTs retain text parity without expanding aliases',()=>{
  for(const depth of [8,12,16]) {
    const h=propertyHost();const source='from $.document&key("document"):'+ 'a<'.repeat(depth)+'b'+'>'.repeat(depth)+'\nselect .';
    const parsed=parseQuery(source);assert.equal(parsed.ok,true);
    const before=renderQuery(parsed.query);
    const text=evaluateQuery(source,h.namespace),native=evaluateQuery(parsed.query,h.namespace);
    assert.equal(text.ok,true);assert.equal(native.ok,true,`depth ${depth}: ${JSON.stringify(native)}`);
    assert.equal(native.results[0].binding,h.bindings.get('doc'));
    assert.deepEqual(native.results[0].value.bindings,text.results[0].value.bindings);
    assert.equal(renderQuery(parsed.query),before);
  }
});
test('QA-0091: snapshots still reject cycles, accessors and excessive semantic DAG expansion before hooks',()=>{
  for(const fault of ['cycle','extraCycle','accessor','wideDag']) {
    const h=propertyHost();const q=parseQuery('from $.document&key("document")\nselect true').query;let reads=0;
    if(fault==='cycle') q.select.ast={type:'groupExpression',expression:q.select.ast},q.select.ast.expression=q.select.ast;
    if(fault==='extraCycle'){q.extra={};q.extra.self=q.extra;}
    if(fault==='accessor')Object.defineProperty(q.select.ast,'value',{get(){reads++;throw Error('must not execute');}});
    if(fault==='wideDag'){for(let i=0;i<16;i++)q.select.ast={type:'binaryExpression',operator:'and',left:q.select.ast,right:q.select.ast};}
    const r=evaluateQuery(q,h.namespace);assert.equal(r.ok,false,fault);assert.equal(r.errors[0].code,'SANSA_RESOLVE_INVALID_ADDRESS');assert.equal(reads,0);assert.deepEqual(h.calls,{});
  }
});
test('QA-0093: real evaluator result perturbations fail the repeated/reentrant oracle',()=>{
  for(const mode of ['first','last','nested','outer','clonedNestedHandle']) {
    const vector=suite.tests.find(v=>v.input[mode==='first'||mode==='last'?'repeat':'reenter']);
    const counts=new WeakMap();let depth=0,tampered=0;
    const evaluate=(input,namespace,options)=>{
      const n=(counts.get(namespace)??0)+1;counts.set(namespace,n);const nested=depth>0;
      depth++;let result;try{result=evaluateQuery(input,namespace,options);}finally{depth--;}
      const change=mode==='first'?n===1:mode==='last'?n===2:mode==='outer'?!nested:nested;
      if(change&&result.ok&&result.results.length){tampered++;const row=result.results[0];return {...result,results:[{...row,value:{type:'bindingSet',bindings:mode==='clonedNestedHandle'?row.value.bindings.map(b=>({...b})):[]}}]};}
      return result;
    };
    const operator=mode==='clonedNestedHandle'?'strictEqual':'deepStrictEqual';
    assert.throws(()=>runPropertyQueryVector(vector,{evaluate}),error=>error.code==='ERR_ASSERTION'&&error.operator===operator,mode);
    assert.ok(tampered>0,mode);
  }
});
