import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {parseAddress,renderAddress,resolveAddress,evaluateQuery,planMutation,planInstruction,traverseGraph,parseQuery,parseInstruction} from '../src/index.js';
const suite = JSON.parse(readFileSync(new URL('../fixtures/property-parser-candidate-v1.json',import.meta.url)));
function generated({kind,count,scalar='x',encoding='raw'}) {
  if(kind === 'payload') return '$&key('+(encoding==='escaped'?'"'+('\\u{'+scalar.codePointAt(0).toString(16)+'}').repeat(count)+'"':JSON.stringify(scalar.repeat(count)))+')';
  if(kind === 'selectors') return '$'+'&key("x")'.repeat(count);
  return '$.["@'+'x'.repeat(count-16)+'"]&key("x")';
}
for(const vector of suite.tests) test(vector.id,()=>{
  const source=vector.input.source??generated(vector.input.generate);
  const result=parseAddress(source,vector.input.options?.parse);
  assert.equal(result.ok,vector.expected.ok,JSON.stringify(result));
  if(result.ok){
    assert.equal(result.address.isExact,vector.expected.isExact);
    if(vector.expected.canonical!==undefined)assert.equal(result.address.canonical,vector.expected.canonical);
    assert.equal(renderAddress(result.address),result.address.canonical);
    assert.equal(parseAddress(result.address.canonical,vector.input.options?.parse).address.canonical,result.address.canonical);
  }else for(const key of ['error','limitKind','limit','observed'])if(vector.expected[key]!==undefined)assert.equal(result.errors[0][key==='error'?'code':key],vector.expected[key]);
});
test('property caller rendering rejects forged metadata, accessors and cycles without mutation',()=>{
  const ast=parseAddress('$&key("x"):list<list<string>>').address;
  const original=structuredClone(ast);ast.canonical='$.forged';ast.isExact=true;
  assert.equal(renderAddress(ast),original.canonical);
  let reads=0;Object.defineProperty(ast.selectors[0],'value',{get(){reads++;return 'x';}});
  assert.throws(()=>renderAddress(ast));assert.equal(reads,0);
  const cycle=structuredClone(original);cycle.qualifierExpression.terms[0].parameterGroups[0][0]=cycle.qualifierExpression.terms[0];
  assert.throws(()=>renderAddress(cycle),/Cyclic/);
  const unknown=structuredClone(original);unknown.selectors.push({type:'unknown'});assert.throws(()=>renderAddress(unknown));
});
test('property parsing/rendering is iterative at deep qualifier nesting',()=>{
  const source='$&key("x"):'+ 'a<'.repeat(6000)+'b'+'>'.repeat(6000);
  const parsed=parseAddress(source);assert.equal(parsed.ok,true);assert.equal(renderAddress(parsed.address),source);
});
test('canonical bounds count escaped rendering and retain property-free legacy limits',()=>{
  assert.equal(parseAddress('$'+'.x'.repeat(257)).ok,true);
  const ast=parseAddress('$&key("x")').address;ast.selectors.unshift({type:'member',name:'\n'.repeat(40000),quoted:true});
  assert.throws(()=>renderAddress(ast),e=>e.code==='SANSA_PROPERTY_LIMIT_EXCEEDED'&&e.limitKind==='canonicalScalars');
  assert.equal(parseAddress('$&key("\ud800")').errors[0].code,'SANSA_INVALID_UNICODE_SCALAR');
  assert.equal(parseAddress('$&key("x"):'+ 'a<'.repeat(40000)+'b'+'>'.repeat(40000)).ok,false);
});
test('legacy hosts lack property scope while prohibited consumers preflight empty and false branches',()=>{
  let reads=0;const host={root:{children:[]},children(){reads++;return [];},key(){reads++;return 'x';}};
  for(const source of ['$.missing&key("x")','$&tag("x")'])assert.equal(resolveAddress(source,host).errors[0].code,'SANSA_RESOLVE_UNSUPPORTED_PROPERTY_SCOPE');
  const ast=parseAddress('$.missing&key("x")').address;ast.isExact=true;ast.canonical='$';assert.equal(resolveAddress(ast,host).ok,false);
  for(const source of ['from $.missing\nselect $&key("x")','from $\nwhere false and exists($&tag("x"))\nselect .','from $.missing\norder by $&tag("x")\nselect .']){
    const result=evaluateQuery(source,host);assert.equal(result.ok,false);assert.equal(result.errors[0].phase,'policy');
  }
  assert.equal(planMutation({op:'remove',target:ast},host).ok,false);
  assert.equal(planInstruction('remove $&key("x")',host).ok,false);
  assert.equal(planInstruction('from $.missing\nremove $&key("x")',host).ok,false);
  assert.equal(reads,0);
});

test('Graph denies property declarations before an empty start can bypass admission',()=>{
  const declaration={id:'test',direction:'directed',schemaVersions:['1'],namespaceTransition:'same-namespace',referenceForm:'absolute-address-reference',sourceSemanticTypes:['object'],targetSemanticTypes:['object'],edgeAddress:'?&key("x")',edgeCardinality:'zero-or-more',missingEdge:'omit',danglingTarget:'omit'};
  const result=traverseGraph([],{},[declaration],{schemaVersion:'1',budget:{maxDepth:1,maxStartBindings:1,maxVisitedNodes:1,maxVisitedEdges:1,maxResults:1}});
  assert.equal(result.ok,false);assert.equal(result.errors[0].code,'SANSA_GRAPH_INVALID_DECLARATION');
});

test('property literals remain inert and all activation modes deny evaluation',()=>{
  const param={name:'param',address:'$.param',semanticType:'sansa',representationKind:'sansa',value:{type:'SansaAddressLiteral',address:'$&key("x")'},children:[]};
  const host={root:{address:'$',children:[param]}};
  for(const addressActivation of [undefined,'trusted',{mode:'constrained',allowedRoots:['$'],allowedSelectors:['member']}]){
    const result=evaluateQuery('from $\nselect path($.param)',host,{addressActivation});
    assert.equal(result.ok,false);assert.equal(result.errors[0].code,'SANSA_QUERY_PATH_ACTIVATION_DENIED');
  }
});

test('malformed caller property ASTs fail through Query and Instruction result envelopes',()=>{
  let reads=0;
  const query=parseQuery('from $.missing\nselect $&key("x")').query;
  Object.defineProperty(query.select.ast.address.selectors[0],'type',{get(){reads++;return 'propertyFilter';}});
  const result=evaluateQuery(query,{root:{children:[]}});
  assert.equal(result.ok,false);assert.equal(result.errors[0].code,'SANSA_RESOLVE_INVALID_ADDRESS');
  const instruction=parseInstruction('from $.missing\nremove $&key("x")').instruction;
  Object.defineProperty(instruction.mutation.target.address.selectors[0],'type',{get(){reads++;return 'propertyFilter';}});
  const lowered=planInstruction(instruction,{root:{children:[]}});
  assert.equal(lowered.ok,false);assert.equal(lowered.errors[0].code,'SANSA_RESOLVE_INVALID_ADDRESS');assert.equal(reads,0);
});

test('headTag stays closed to Query mutation Instruction and activation before traversal',()=>{
  let reads=0;
  const host={get root(){reads++;throw Error('unadmitted traversal');}};
  for(const text of ['from $.missing\nselect $&headTag("book")','from $\nwhere false and exists($&headTag("book"))\nselect .']){
    for(const query of [text,parseQuery(text).query]){
      const result=evaluateQuery(query,host,{addressActivation:'trusted'});
      assert.equal(result.ok,false);assert.equal(result.errors[0].phase,'policy');
    }
  }
  const address=parseAddress('$&headTag("book")').address;
  assert.equal(planMutation({op:'remove',target:address},host).ok,false);
  assert.equal(planInstruction('remove $&headTag("book")',host).ok,false);
  assert.equal(reads,0);
});
