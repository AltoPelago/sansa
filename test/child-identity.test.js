import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseAddress, renderAddress, resolveAddress, planMutation, evaluateQuery} from '../src/index.js';
const cts = new URL('./fixtures/child-identity/', import.meta.url);
const load = file => JSON.parse(fs.readFileSync(new URL(file.split('/').at(-1),cts)));
const parser = load('cts/sansa/v1/suites/12-child-identity-parser.json');
const suite = load('cts/sansa/v1/suites/13-child-identity-resolve.json');
function adapter(id='identity-basic') {
 const fixture=structuredClone(suite.fixtures.namespaces.find(x=>x.id===id));
 let calls=0;const parents=new Map(); const nodes=new Map();
 const visit=(node,parent)=>{nodes.set(node.address,node);if(parent)parents.set(node,parent);for(const child of node.children??[])visit(child,node);if(node.attributeSpace)visit(node.attributeSpace);for(const space of Object.values(node.localSpaces??{}))visit(space);};visit(fixture.root);
 const namespace={root:fixture.root,children:b=>b.children??[],attributeSpace:b=>b.attributeSpace,localSpace:(b,n)=>b.localSpaces?.[n]};
 if(fixture.supportsIdentity)namespace.identity=b=>{calls++;return b.identity;};
 if(fixture.supportsParentTraversal)namespace.parent=b=>parents.get(b);
 return {namespace,nodes,calls:()=>calls};
}
for(const item of parser.tests)test(item.id,()=>{
 const result=parseAddress(item.input.source);assert.equal(result.ok,item.expected.ok,JSON.stringify(result));
 if(!result.ok)for(const [field,key] of [["code","error"],["index","index"]])if(key in item.expected)assert.equal(result.errors[0][field],item.expected[key]);
 if(result.ok){assert.equal(result.address.isExact,item.expected.exact);assert.equal(renderAddress(result.address),item.expected.canonical);assert.deepEqual(parseAddress(renderAddress(result.address)).address,result.address);}
});
for(const item of suite.tests)test(item.id,()=>{
 const {namespace,nodes,calls}=adapter(item.input.namespace);const {source,namespace:ignored,...options}=item.input;
 if(options.contextualRoot)options.contextualRoot=nodes.get(options.contextualRoot);
 const result=resolveAddress(source,namespace,options);assert.equal(result.ok,item.expected.ok,JSON.stringify(result));
 if(result.ok)assert.deepEqual(result.bindings.map(b=>b.address),item.expected.addresses);
 else {assert.equal(result.errors[0].code,item.expected.error);assert.deepEqual(result.bindings,[]);for(const field of ["selectorIndex","identity","limit","observed"])if(field in item.expected)assert.equal(result.errors[0][field],item.expected[field]);}
 assert.equal(calls(),item.expected.identityCalls);
 if(result.ok){for(const binding of result.bindings)assert.equal(binding,nodes.get(binding.address));}
});
for(const item of load('fixtures/sansa-child-identity/v1/ast-candidate.json').tests)test(item.id,()=>{
 const {namespace,calls}=adapter();const result=resolveAddress(item.address,namespace);
 assert.equal(result.ok,item.expected.ok,JSON.stringify(result));
 if(result.ok)assert.deepEqual(result.bindings.map(b=>b.address),item.expected.addresses);else assert.equal(result.errors[0].code,item.expected.error);
 assert.equal(calls(),item.expected.identityCalls);
});
test('identity scan closes a lazy unbounded iterator at the first excess candidate',()=>{
 let calls=0,pulls=0,closed=false;const root={};const namespace={root,identity:()=>{calls++;return undefined;},*children(){try{while(true){if(++pulls>3)throw new Error('eager enumeration');yield {};}}finally{closed=true;}}};
 const result=resolveAddress('$.\\absent\\',namespace,{maxIdentityInspections:2});
 assert.equal(result.errors[0].code,'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');assert.equal(result.errors[0].observed,3);assert.equal(calls,2);assert.equal(pulls,3);assert.equal(closed,true);
});
test('default inspection ceiling allows exactly 10000 and rejects the next child',()=>{
 for(const size of [10000,10001]){let calls=0;const namespace={root:{},identity:()=>{calls++;return undefined;},*children(){for(let i=0;i<size;i++)yield {};}};const result=resolveAddress('$.\\absent\\',namespace);assert.equal(result.ok,size===10000);assert.equal(calls,10000);if(!result.ok)assert.equal(result.errors[0].code,'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');}
});
test('reordering retains the same child occurrence while moving it out makes the old expression miss',()=>{
 const {namespace}=adapter();const group=namespace.root.children[0],selected=group.children[0];group.children.reverse();assert.equal(resolveAddress('$.group.\\item1\\',namespace).bindings[0],selected);group.children=group.children.filter(b=>b!==selected);assert.deepEqual(resolveAddress('$.group.\\item1\\',namespace).bindings,[]);
});
test('mutation rejects identity strings and forged exact ASTs before identity access',()=>{
 const {namespace,calls}=adapter();for(const target of ['$.\\group1\\',{type:'SansaAddress',root:{kind:'absolute',type:'root'},selectors:[{type:'childIdentity',identity:'group1'}],canonical:'$.group',isExact:true}])assert.equal(planMutation({op:'remove',target},namespace).ok,false);assert.equal(calls(),0);
});
test('Query explicitly admits identity selection and retains original bindings',()=>{
 const {namespace,nodes}=adapter();const result=evaluateQuery('from $.\\group1\\\nselect .',namespace);assert.equal(result.ok,true);assert.equal(result.results[0].binding,nodes.get('$.group'));
});

test('caller identity AST rejects syntax in filter and qualifier payloads before namespace access', () => {
 const base=parseAddress('$.\\target\\').address;
 for(const type of ['semanticTypeFilter','representationKindFilter']) {
  const address={...base,selectors:[...base.selectors,{type,name:'T.\\leaf\\'}]};
  const namespace={get root(){throw new Error('namespace accessed');}};
  assert.equal(resolveAddress(address,namespace).errors[0].code,'SANSA_RESOLVE_INVALID_ADDRESS');
  assert.throws(()=>renderAddress(address),/Invalid identity address AST/);
 }
 const q=parseAddress('$.\\target\\:Q[1]').address;
 for(const change of [term=>term.name='Q|Other',term=>term.arguments[0]={kind:'token',value:'1]|Other[2'}]) {
  const address=structuredClone(q);change(address.qualifierExpression.terms[0]);
  assert.equal(resolveAddress(address,{get root(){throw new Error('namespace accessed');}}).errors[0].code,'SANSA_RESOLVE_INVALID_ADDRESS');
 }
 const name='x'.repeat(65537);
 const large=parseAddress(`$.\\${name}\\`).address;
 assert.equal(renderAddress(large),`$.\\${name}\\`);
});
