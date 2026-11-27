import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateQuery, planInstruction, planMutation, resolveAddress} from '../src/index.js';
import {propertyHost} from './property-resolve-fixture.mjs';

test('invalid property allowances precede root access even on property-free calls', () => {
  for (const maxPropertyInspections of [true, false, -1, .5, 1_000_001, NaN, Infinity, -Infinity, '1', null, {}, 1n]) {
    let roots = 0;
    const result = resolveAddress('$', {root() { roots++; return {}; }}, {maxPropertyInspections});
    assert.equal(result.errors[0].code, 'SANSA_RESOLVE_INVALID_PROPERTY_LIMIT');
    assert.equal(roots, 0);
  }
  const {namespace}=propertyHost();
  const zero=resolveAddress('$&tag("x")',namespace,{maxPropertyInspections:-0});
  assert.equal(Object.is(zero.errors[0].limit,0),true);
});

test('property-free resolution does not access the optional facet',()=>{
  const root={};const namespace={root};
  Object.defineProperty(namespace,'properties',{get(){throw Error('unused facet');}});
  assert.deepEqual(resolveAddress('$',namespace,{maxPropertyInspections:0}).bindings,[root]);
});

test('tag budgets count candidate occurrences before reading metadata', () => {
  const {namespace, bindings, calls} = propertyHost();
  const source = '$.document.*&tag("product")';
  const limited = resolveAddress(source, namespace, {maxPropertyInspections: 1});
  assert.equal(limited.errors[0].code, 'SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED');
  assert.deepEqual(limited.bindings, []);
  assert.deepEqual([calls.scope, calls.nodeKind, calls.nodeTag], [1, 1, 1]);
  const complete = resolveAddress(source, namespace, {maxPropertyInspections: 3});
  assert.equal(complete.ok, true);
  assert.deepEqual(complete.bindings, [bindings.get('apple'), bindings.get('orange')]);
});

test('capable adapters do not admit Instruction, mutation or literal activation', () => {
  for (const operation of [
    h => planInstruction('from $.missing\nrequire true or exists($&key("x"))\nremove ?', h),
    h => planMutation({op:'remove',target:'$.document&key("document")'}, h),
  ]) {
    const {namespace,calls} = propertyHost();
    assert.equal(operation(namespace).ok, false);
    assert.deepEqual(calls, {});
  }
  for (const addressActivation of [undefined,'trusted',{mode:'constrained',allowedRoots:['$'],allowedSelectors:['member']}]) {
    const {namespace,calls,bindings} = propertyHost();
    bindings.set('param',{id:'param',name:'param',key:'param',address:'$.param',semanticType:'sansa',representationKind:'sansa',value:{type:'SansaAddressLiteral',address:'$&key("x")'},children:[]});
    bindings.get('r').children.push('param');
    const result = evaluateQuery('from $\nselect path($.param)', namespace, {addressActivation});
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'SANSA_QUERY_PATH_ACTIVATION_DENIED');
    assert.equal(calls.scope ?? 0, 0);
  }
});

test('scope frames follow occurrences through distinct space roots without deduplication', () => {
  const root={}, a={}, b={}, shared={};
  const seen=[];
  const namespace={root,children:binding=>binding===root?[a,b]:binding===a||binding===b?[shared]:[],attributeSpace:binding=>binding,
    properties:{scope(binding,context){assert.ok(Object.isFrozen(context));seen.push(context);return binding===context.scopeRoot?'root':'inside';},key(binding,context){assert.equal(binding,shared);return context.scopeRoot===a?'a':'b';}}};
  assert.deepEqual(resolveAddress('$.*.@.*&key("a")',namespace).bindings,[shared]);
  assert.deepEqual(seen.map(c=>c.scopeRoot),[a,b]);
  assert.deepEqual(seen.map(c=>c.evaluationRoot),[a,b]);
  seen.length=0;
  namespace.properties.key=()=> 'x';
  assert.deepEqual(resolveAddress('$.*.@.*&key("x")',namespace,{maxPropertyInspections:2}).bindings,[shared,shared]);
  const limited=resolveAddress('$.*.@.*&key("x")',namespace,{maxPropertyInspections:1});
  assert.equal(limited.ok,false);assert.deepEqual(limited.bindings,[]);
});

test('public/reentrant calls have private allowances; options cannot grant scope', () => {
  const {namespace,bindings}=propertyHost();const key=namespace.properties.key;let nested=false;
  namespace.properties.key=function(binding,context){
    if(!nested){nested=true;assert.equal(resolveAddress('$.document&key("document")',namespace,{maxPropertyInspections:1}).ok,true);nested=false;}
    return key.call(this,binding,context);
  };
  for(let i=0;i<2;i++)assert.equal(resolveAddress('$.document&key("document")',namespace,{maxPropertyInspections:1,propertyBudget:{inspected:1}}).ok,true);
  const result=resolveAddress('?.^&key("outsideRootName")',namespace,{contextualRoot:bindings.get('doc'),allowParentFromEffectiveRoot:true,scopeRoot:bindings.get('r'),evaluationRoot:bindings.get('r')});
  assert.equal(result.errors[0].code,'SANSA_RESOLVE_PROPERTY_SCOPE_VIOLATION');
});

test('checked faults are sanitized and invalid intrinsic tags fail closed', () => {
  for(const [kind,code]of [['invalidMetadata','SANSA_RESOLVE_INVALID_PROPERTY_METADATA'],['scopeViolation','SANSA_RESOLVE_PROPERTY_SCOPE_VIOLATION'],['adapterFailure','SANSA_RESOLVE_PROPERTY_ADAPTER_ERROR']]){
    const {namespace}=propertyHost();namespace.properties.key=()=>{throw {type:'SansaPropertyAccessFault',kind,message:'foreign secret',address:'$.hidden'};};
    const result=resolveAddress('$.document&key("x")',namespace);assert.equal(result.errors[0].code,code);assert.ok(!JSON.stringify(result).includes('secret'));assert.ok(!JSON.stringify(result).includes('hidden'));
  }
  let coercions=0;
  for(const thrown of [
    {type:'SansaPropertyAccessFault',kind:{toString(){coercions++;throw Error('secret');}}},
    ...['__proto__','constructor','toString'].map(kind=>({type:'SansaPropertyAccessFault',kind})),
    new Proxy({}, {getPrototypeOf(){throw Error('secret');}}),
  ]){
    const {namespace}=propertyHost();namespace.properties.key=()=>{throw thrown;};
    const result=resolveAddress('$.document&key("x")',namespace);assert.equal(result.errors[0].code,'SANSA_RESOLVE_PROPERTY_ADAPTER_ERROR');assert.ok(!JSON.stringify(result).includes('secret'));
  }
  assert.equal(coercions,0);
  for (const tag of [undefined, '', 42, '\ud800']) {
    const {namespace} = propertyHost();
    namespace.properties.nodeTag = () => tag;
    const result = resolveAddress('$.document&tag("document")', namespace);
    assert.equal(result.errors[0].code, 'SANSA_RESOLVE_INVALID_PROPERTY_METADATA');
    assert.deepEqual(result.bindings, []);
  }
});

test('capability callbacks are snapshotted once and binding limits remain global across branches',()=>{
  const {namespace,calls}=propertyHost();const facet=namespace.properties,counts={};
  namespace.properties={};for(const key of Object.keys(facet))Object.defineProperty(namespace.properties,key,{get(){counts[key]=(counts[key]??0)+1;return facet[key];}});
  assert.equal(resolveAddress('$.document&key("document")&key("document")',namespace).ok,true);
  assert.deepEqual(counts,{scope:1,key:1});assert.equal(calls.key,2);
  const result=resolveAddress('$.*.^.document&key("document")',namespace,{maxBindings:13});assert.equal(result.ok,true);assert.equal(result.bindings.length,13);
  const limited=resolveAddress('$.document.*&tag("product")',namespace,{maxBindings:2});assert.equal(limited.errors[0].code,'SANSA_RESOLVE_BINDING_LIMIT_EXCEEDED');assert.equal(limited.errors[0].limit,2);
});
