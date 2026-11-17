import assert from 'node:assert/strict';
import test from 'node:test';
import {parseAddress, resolveAddress} from '../src/index.js';

function fixture() {
  const attrs={kind:'NodeHead',tag:'x'}, a={name:'a'}, b={name:'b'};
  const root={kind:'NodeHead',tag:'x',children:[a,b]};
  const counts={scope:0,key:0};
  const namespace={root,properties:{scope(binding,context){counts.scope++;return binding===context.scopeRoot?'root':'inside';},key(){counts.key++;return 'incoming';},nodeKind:b=>b.kind??'Other',nodeTag:b=>b.tag,nodeHeads:()=>[]}};
  return {namespace,root,attrs,a,b,counts};
}
const forms=source=>[source,parseAddress(source).address];

test('QA-0085: mixed attribute and parent field fallbacks retain supported branches in text/native calls',()=>{
  for(const reverse of [false,true])for(const field of ['attributes','attributeSpace']){
    const h=fixture();h.a[field]=h.attrs;h.a.parent=h.root;if(reverse)h.root.children.reverse();
    for(const [prefix,expected]of [['$.*.@',[h.attrs]],['$.*.^',[h.root]]])for(const source of forms(prefix+'&headTag("x")')){
      const plain=resolveAddress(prefix,h.namespace);assert.equal(plain.ok,true);assert.deepEqual(plain.bindings,expected);
      const result=resolveAddress(source,h.namespace);assert.equal(result.ok,true,JSON.stringify(result.errors??[]));assert.deepEqual(result.bindings,expected);
      assert.equal(result.bindings[0],expected[0]);
      const explicit={...h.namespace,attributeSpace:b=>b.attributeSpace??b.attributes,parent:b=>b.parent};
      assert.deepEqual(resolveAddress(source,explicit).bindings,expected);
    }
    const hidden=resolveAddress('$.*.@&key("incoming")',h.namespace);assert.equal(hidden.ok,true);assert.deepEqual(hidden.bindings,[]);assert.equal(h.counts.key,0);
  }
});

test('set-level unsupported, empty and inherited-field decisions match ordinary navigation',()=>{
  for(const suffix of ['.@','.^'])for(const form of ['missing','empty','inherited','ownAbsent','callbackAbsent']){
    const h=fixture();
    if(form==='empty')h.root.children=[];
    if(form==='inherited')Object.setPrototypeOf(h.a,suffix==='.@'?{attributes:h.attrs}:{parent:h.root});
    if(form==='ownAbsent')Object.defineProperty(h.a,suffix==='.@'?'attributes':'parent',{value:undefined});
    if(form==='callbackAbsent')h.namespace[suffix==='.@'?'attributeSpace':'parent']=()=>undefined;
    const plain=resolveAddress('$.*'+suffix,h.namespace), result=resolveAddress('$.*'+suffix+'&headTag("x")',h.namespace);
    assert.equal(result.ok,plain.ok,`${suffix}/${form}`);
    if(plain.ok)assert.deepEqual(result.bindings,plain.bindings);
    else assert.equal(result.errors[0].code,plain.errors[0].code);
  }
  const h=fixture();h.a.parent=undefined;Object.setPrototypeOf(h.b,{parent:h.root});
  assert.deepEqual(resolveAddress('$.*.^&headTag("x")',h.namespace).bindings,[h.root]);
});

test('set-level parent policy precedes every callback/getter and fallback values are read once',()=>{
  for(const options of [{parentTraversal:'forbid'},{failOnParentFromEffectiveRoot:true}]){
    const h=fixture();h.root.children=[h.a,h.root];let reads=0;
    Object.defineProperty(h.a,'parent',{get(){reads++;return h.root;}});
    for(const prefix of ['$.*.^','$.*.^&headTag("x")']){
      const result=resolveAddress(prefix,h.namespace,options);assert.equal(result.ok,false);
      assert.equal(result.errors[0].code,options.parentTraversal?'SANSA_RESOLVE_PARENT_TRAVERSAL_FORBIDDEN':'SANSA_RESOLVE_BOUNDARY_ESCAPE_FORBIDDEN');
      assert.equal(reads,0);assert.equal(h.counts.scope,0);
    }
  }
  for(const suffix of ['.@','.^']){
    const h=fixture();let reads=0;Object.defineProperty(h.a,suffix==='.@'?'attributes':'parent',{get(){reads++;return suffix==='.@'?h.attrs:h.root;}});
    assert.equal(resolveAddress('$.*'+suffix+'&headTag("x")',h.namespace).ok,true);assert.equal(reads,1);
  }
});

test('batch fallback projection retains repeated handles and distinct authorized space frames',()=>{
  const root={},a={},b={},missing={},spaceA={},spaceB={},shared={key:'x'};root.children=[a,missing,b];a.attributes=spaceA;b.attributes=spaceB;spaceA.children=[shared];spaceB.children=[shared];
  const seen=[];
  const namespace={root,properties:{scope(binding,ctx){seen.push(ctx);return binding===ctx.scopeRoot?'root':'inside';},key(binding,ctx){assert.equal(binding,shared);return ctx.scopeRoot===spaceA?'a':'b';}}};
  const result=resolveAddress('$.*.@.*&key("a")',namespace);assert.equal(result.ok,true);assert.deepEqual(result.bindings,[shared]);
  assert.deepEqual(seen.map(c=>c.scopeRoot),[spaceA,spaceB]);assert.deepEqual(seen.map(c=>c.evaluationRoot),[spaceA,spaceB]);assert.ok(seen.every(Object.isFrozen));
  namespace.properties.key=()=> 'x';
  assert.deepEqual(resolveAddress('$.*.@.*&key("x")',namespace,{maxPropertyInspections:2}).bindings,[shared,shared]);
  const limited=resolveAddress('$.*.@.*&key("x")',namespace,{maxPropertyInspections:1});assert.equal(limited.ok,false);assert.deepEqual(limited.bindings,[]);
  assert.equal(limited.errors[0].code,'SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED');
});
