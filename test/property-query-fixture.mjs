import assert from 'node:assert/strict';
import {evaluateQuery,parseQuery} from '../src/index.js';
import {propertyHost} from './property-resolve-fixture.mjs';

function records(result,host,label) {
  return result.results.map(row=>{
    assert.equal(row.binding,host.bindings.get(row.binding.id),`${label} authorized handle`);
    assert.equal(row.value.type,'bindingSet',`${label} records Binding Set`);
    for(const binding of row.value.bindings)assert.equal(binding,host.bindings.get(binding.id),`${label} authorized handle`);
    return {candidate:row.binding.id,valueBindings:row.value.bindings.map(b=>b.id)};
  });
}
// Test-only evaluator injection exercises actual result sensitivity. No runtime hook.
export function runPropertyQueryVector(vector,{evaluate=evaluateQuery}={}) {
  const {input,expected}=vector;
  if(input.operation==='parse-query'){
    const r=parseQuery(input.source);
    const observed={ok:r.ok,canonical:r.query?.canonical,currentPropertyScope:r.query?.select.ast.scope,currentAddressRoot:r.query?.select.ast.address.root.kind};
    for(const [field,value]of Object.entries(expected)){assert.ok(Object.hasOwn(observed,field),field);assert.deepEqual(observed[field],value,field);}return;
  }
  for(const native of [false,true]){
    const host=propertyHost(input);const nested=[];
    if(input.reenter){let entered=false;const key=host.namespace.properties.key;
      host.namespace.properties.key=function(...args){if(!entered){entered=true;const source=input.reenter.source;const parsed=parseQuery(source);assert.equal(parsed.ok,true);nested.push(evaluate(native?parsed.query:source,host.namespace,{resolve:{maxPropertyInspections:input.reenter.maxPropertyInspections}}));}return key.apply(this,args);};
    }
    const options=structuredClone(input.options??{});
    if(input.contextualRoot)options.resolve={...options.resolve,contextualRoot:host.bindings.get(input.contextualRoot)};
    const parsed=parseQuery(input.source);assert.equal(parsed.ok,true);
    const invocations=[];
    for(let i=0;i<(input.repeat??1);i++)invocations.push(evaluate(native?parsed.query:input.source,host.namespace,options));
    for(const [index,r]of invocations.entries()){
      const observed={ok:r.ok,records:records(r,host,`${native} invocation ${index}`)};
      if(!r.ok)Object.assign(observed,r.errors[0],{error:r.errors[0].code});
      for(const [field,value]of Object.entries(expected)){
        if(field==='calls'||field==='nestedResultsOk')continue;
        assert.ok(Object.hasOwn(observed,field),`unasserted ${field}`);assert.deepEqual(observed[field],value,`${native} invocation ${index} ${field}`);
      }
      assert.equal(Object.getOwnPropertySymbols(r).length,0);assert.doesNotThrow(()=>JSON.stringify(r));
    }
    if(Object.hasOwn(expected,'nestedResultsOk')){
      assert.equal(nested.length,1,'one nested invocation');
      const r=nested[0];assert.equal(r.ok,expected.nestedResultsOk,'nested records success');
      assert.deepEqual(records(r,host,'nested'),[{candidate:'doc',valueBindings:['doc']}],'nested records');
      assert.equal(r.results[0].binding,host.bindings.get('doc'),'nested candidate authorized handle');
      assert.equal(r.results[0].value.bindings[0],host.bindings.get('doc'),'nested result authorized handle');
    }
    if(expected.calls)for(const [name,count]of Object.entries(expected.calls))assert.equal(host.calls[name]??0,count,`${native} aggregate calls.${name}`);
  }
}
