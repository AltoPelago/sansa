import assert from 'node:assert/strict';
import test from 'node:test';
import {planInstruction, lowerInstruction, planMutation, applyMutationPlan, parseQuery, parseInstruction, evaluateQuery} from '../src/index.js';

function host() {
  const counts={root:0,children:0,remove:0};
  const x={name:'x',address:'$.x',parentAddress:'$',value:1,children:[]};
  const root={address:'$',children:[x]};
  return {counts,reset(){for(const key of Object.keys(counts))counts[key]=0;},namespace:{root(){counts.root++;return root;},children(binding){counts.children++;return binding.children??[];},mutate:{remove(){counts.remove++;return {ok:true};}}}};
}
const properties=['$&key("x")','$&tag("x")'];
const expressions=property=>[`exists(${property})`,`true or exists(${property})`,`false and exists(${property})`];
const noReads=h=>assert.deepEqual(h.counts,{root:0,children:0,remove:0});
function groups(expression,depth){for(let i=0;i<depth;i++)expression={type:'groupExpression',expression};return expression;}

test('QA-0082: Instruction requirements deny properties before populated/empty/direct lowering',()=>{
  for(const property of properties)for(const expression of expressions(property))for(const prefix of ['from $.x\n','from $.missing\n','']){
    const h=host();const result=planInstruction(`${prefix}require ${expression}\nremove ${prefix?'?':'$.x'}`,h.namespace);
    assert.equal(result.ok,false,expression);assert.equal(result.errors[0].code,'SANSA_RESOLVE_UNSUPPORTED_SELECTOR');noReads(h);
  }
  const h=host();const safe=planInstruction('from $.x\nrequire true\nremove ?',h.namespace);assert.equal(safe.ok,true);assert.equal(safe.plan.operations.length,1);
  const forged=parseInstruction('from $.missing\nrequire true or exists($&key("x"))\nremove ?').instruction;
  forged.requires[0].ast=parseQuery('from $\nselect true').query.select.ast;
  h.reset();assert.equal(planInstruction(forged,h.namespace).ok,false);noReads(h);
});

test('QA-0082: direct mutation preconditions preflight all clauses before planning operations',()=>{
  for(const property of properties)for(const expression of expressions(property))for(const operations of [[],[{op:'remove',target:'$.x'}]]){
    const h=host();const result=planMutation({operations,preconditions:[{expression:'true'},{expression}]},h.namespace);
    assert.equal(result.ok,false);assert.equal(result.errors[0].code,'SANSA_RESOLVE_UNSUPPORTED_SELECTOR');assert.equal(result.errors[0].preconditionIndex,1);noReads(h);
  }
  const h=host();assert.equal(planMutation({operations:[{op:'remove',target:'$.x'}],preconditions:[{expression:'"&key" == "&key"'}]},h.namespace).ok,true);
});

test('QA-0082: replay cannot bypass property admission using recheck false or a forged canonical expression',()=>{
  for(const property of properties)for(const recheckPreconditions of [true,false])for(const precondition of [{expression:`true or exists(${property})`},{expression:`true or exists(${property})`,canonical:'true'},{expression:'true',canonical:`true or exists(${property})`}]){
    const h=host();const before=planMutation({op:'remove',target:'$.x'},h.namespace);assert.equal(before.ok,true);h.reset();
    const result=applyMutationPlan({...before.plan,preconditions:[precondition]},h.namespace,{recheckPreconditions});
    assert.equal(result.ok,false);assert.equal(result.errors[0].code,'SANSA_RESOLVE_UNSUPPORTED_SELECTOR');noReads(h);
  }
  const h=host();const before=planMutation({op:'remove',target:'$.x'},h.namespace);assert.equal(before.ok,true);h.reset();
  const limited=applyMutationPlan({...before.plan,preconditions:[{expression:'true or exists($[1]&key("x"))'}]},h.namespace,{recheckPreconditions:false,parse:{expression:{address:{maxPositionIndex:0}}}});
  assert.equal(limited.ok,false);assert.equal(limited.errors[0].code,'SANSA_MUTATE_INVALID_PRECONDITION');noReads(h);
});

test('property targets in later mutation operations and precondition contexts cannot follow earlier traversal',()=>{
  for(const property of properties)for(const request of [
    {operations:[{op:'remove',target:'$.x'},{op:'remove',target:property}]},
    {operations:[{op:'remove',target:'$.x'}],preconditions:[{target:property,expression:'true'}]},
  ]){
    const h=host();const result=planMutation(request,h.namespace);assert.equal(result.ok,false);noReads(h);
  }
});

test('QA-0083: deep unused Query and Instruction expressions retain empty-source success',()=>{
  for(const depth of [32,6000,9000]){
    const h=host();const query=parseQuery('from $.missing\nselect true').query;query.select.ast=groups(query.select.ast,depth);
    const result=evaluateQuery(query,h.namespace,{budget:{maxFromBindings:0,maxResultRecords:0}});assert.equal(result.ok,true);assert.deepEqual(result.results,[]);
    const instruction=parseInstruction('from $.missing\nwhere true\nremove ?').instruction;instruction.where.ast=groups(instruction.where.ast,depth);
    const lowered=lowerInstruction(instruction,h.namespace);assert.equal(lowered.ok,true);assert.deepEqual(lowered.request,[]);
    const requirement=parseInstruction('from $.missing\nrequire true\nremove ?').instruction;
    requirement.requires[0].ast=groups(requirement.requires[0].ast,depth);
    const lowerRequirement=lowerInstruction(requirement,h.namespace);assert.equal(lowerRequirement.ok,true);assert.deepEqual(lowerRequirement.request,[]);
    const data=JSON.stringify('&key("x")');
    const inert=parseInstruction(`from $.missing\nrequire ${data} == ${data}\nremove ?`).instruction;
    inert.requires[0].ast=groups(inert.requires[0].ast,depth);
    inert.requires[0].expression='('.repeat(depth)+inert.requires[0].expression+')'.repeat(depth);
    const lowerInert=lowerInstruction(inert,h.namespace);assert.equal(lowerInert.ok,true);assert.deepEqual(lowerInert.request,[]);
  }
});

test('deep and wide property expressions remain denied before reading an empty source',()=>{
  const property=parseQuery('from $\nselect $&key("x")').query.select.ast;
  for(const depth of [6000,9000]){
    const h=host();const query=parseQuery('from $.missing\nselect true').query;query.select.ast=groups(property,depth);
    const result=evaluateQuery(query,h.namespace);assert.equal(result.ok,false);assert.equal(result.errors[0].code,'SANSA_RESOLVE_UNSUPPORTED_SELECTOR');noReads(h);
  }
  for(const width of [64,128]){
    const h=host();const query=parseQuery('from $.missing\nselect true').query;const literal=query.select.ast;
    query.select.ast={type:'projectionExpression',fields:Array.from({length:width},(_,i)=>({name:'f'+i,expression:i===width-1?property:literal}))};
    assert.equal(evaluateQuery(query,h.namespace).ok,false);noReads(h);
  }
});

test('expression preflight handles shared DAGs without repeated expansion and diagnoses cycles',()=>{
  for(const depth of [12,18]){
    const query=parseQuery('from $.missing\nselect true').query;
    let reads=0;const leaf={...query.select.ast};Object.defineProperty(leaf,'type',{get(){reads++;return 'literalExpression';}});
    let expression=leaf;for(let i=0;i<depth;i++)expression={type:'binaryExpression',operator:'and',left:expression,right:expression};
    query.select.ast=expression;assert.equal(evaluateQuery(query,host().namespace).ok,true);assert.ok(reads<=4,`leaf visited ${reads} times`);
  }
  const query=parseQuery('from $.missing\nselect true').query;const cycle={type:'groupExpression'};cycle.expression=cycle;query.select.ast=cycle;
  const h=host();const result=evaluateQuery(query,h.namespace);assert.equal(result.ok,false);assert.equal(result.errors[0].code,'SANSA_RESOLVE_INVALID_ADDRESS');noReads(h);
});
