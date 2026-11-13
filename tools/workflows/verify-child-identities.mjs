#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateQuery,parseAddress,planMutation,planInstruction,resolveAddress} from '../../src/index.js';
import {rowsFromNamespace,scopedNamespace,selectionRows} from '../playground/namespace.mjs';
import {evaluateQueryForWorkbench} from '../query-web/runtime.mjs';

// This tool deliberately needs an explicitly selected coordinated candidate.
// It performs no install, mutation, ordering operation or reference rewriting.
const manifest = process.argv[2];
if (!manifest) throw new Error('Usage: node tools/workflows/verify-child-identities.mjs <candidate-modules.json>');
const paths = JSON.parse(readFileSync(manifest,'utf8'));
for (const name of ['core','canonical','aes','sdk','aeos','titonic']) {
  assert.equal(typeof paths[name],'string',`Missing candidate module: ${name}`);
  assert.ok(paths[name].startsWith('file:'),`Use an explicit file URL for ${name}`);
}
const [core,canonical,aes,sdk,aeos,titonic] = await Promise.all(['core','canonical','aes','sdk','aeos','titonic'].map(name=>import(paths[name])));
const suite = JSON.parse(readFileSync(new URL('../../fixtures/child-identity-workflows/workflows.json',import.meta.url)));
const snapshots = new Map();
const report={snapshots:[],checks:{resolve:0,query:0,activation:0,aeos:0,titonic:0,workbench:0,canonicalization:0,references:0,boundaries:0}};
const samePaths=(bindings,expected)=>assert.deepEqual(bindings.map(b=>b.address),expected);
for (const item of suite.snapshots) {
  const source=readFileSync(new URL(`../../fixtures/child-identity-workflows/${item.source}`,import.meta.url),'utf8');
  const compiled=core.compile(source);assert.deepEqual(compiled.errors,[],item.id);
  const namespace=sdk.createAeonNamespace(compiled.events,{scope:'payload',sourceBytes:new TextEncoder().encode(source)});
  const selected=resolveAddress(item.selector,namespace);assert.equal(selected.ok,true,JSON.stringify(selected.errors));
  samePaths(selected.bindings,[item.namePath]);assert.equal(selected.bindings[0].value,item.nameValue);
  assert.equal(selected.bindings[0],resolveAddress(item.namePath,namespace).bindings[0]);
  assert.equal(parseAddress(item.selector).address.isExact,false);
  const scoped=scopedNamespace(namespace,item.subtree);
  assert.equal(resolveAddress('$',scoped).bindings[0].representationKind,'ObjectNode');
  samePaths(resolveAddress(suite.scopedSelf,scoped).bindings,[]);
  samePaths(resolveAddress('$.\\stock1\\',namespace).bindings,[]);
  samePaths(resolveAddress(suite.scopedSelector,scoped).bindings,[item.namePath]);
  samePaths(resolveAddress(suite.contextualSelector,scoped).bindings,[item.namePath]);
  assert.equal(selectionRows(selected,rowsFromNamespace(namespace))[0].binding,selected.bindings[0]);report.checks.resolve++;

  const query=`from ${item.subtree}.items.*\nselect .\\name1\\`;
  const result=evaluateQuery(query,namespace);assert.equal(result.ok,true,JSON.stringify(result.errors));
  assert.deepEqual(result.results.map(r=>r.value.bindings.map(b=>b.address)),item.projected);
  const filtered=evaluateQuery(`from ${item.subtree}.items.*\nwhere exists(.\\name1\\)\nselect .\\name1\\`,namespace);
  assert.equal(filtered.ok,true);assert.deepEqual(filtered.results.map(r=>r.valueAddress),[item.namePath]);
  for(let repeat=0;repeat<2;repeat++) {
    const limited=evaluateQuery(`from ${item.selector}\nselect .`,namespace,{resolve:{maxIdentityInspections:3}});
    assert.equal(limited.ok,false);assert.deepEqual(limited.results,[]);assert.equal(limited.errors[0].code,'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');
    assert.equal(evaluateQuery(`from ${item.selector}\nselect .`,namespace,{resolve:{maxIdentityInspections:4}}).ok,true);
  }report.checks.query++;

  const activation={allowedRoots:[item.parent],allowedSelectors:['member','position','childIdentity'],allowContextualRoot:false};
  const activated=evaluateQuery('from $\nselect path($.selection)',namespace,{addressActivation:activation});
  assert.equal(activated.ok,true,JSON.stringify(activated.errors));samePaths(activated.results[0].value.bindings,[item.namePath]);
  for(const addressActivation of [undefined,'trusted']) {
    const denied=evaluateQuery('from $\nselect path($.selection)',namespace,addressActivation===undefined?{}:{addressActivation});
    assert.equal(denied.ok,false);assert.deepEqual(denied.results,[]);
  }report.checks.activation++;

  const schema={rules:[{selector:item.selector,constraints:{required:true,type:'StringLiteral'}}]};
  const records=aes.projectPortableEvents(compiled.events);
  assert.equal(records.every(record=>!record.path.includes('\\')),true);
  const wire=aes.encodeTelex(records);
  assert.deepEqual(aes.parseTelex(wire).records,records);
  const bad={rules:[{selector:item.selector,constraints:{required:true,type:'NumberLiteral'}}]};
  for(const [events,goodSchema,badSchema] of [[compiled.events,schema,bad],[records,schema,bad]]) {
    assert.equal(aeos.validate(events,goodSchema).ok,true);
    const failed=aeos.validate(events,badSchema);assert.equal(failed.ok,false);
    assert.ok(failed.errors.some(e=>e.code==='type_mismatch'&&e.path===item.namePath),JSON.stringify(failed.errors));
  }
  assert.equal(aeos.validateTelex(wire,schema).ok,true);
  const deniedPath=aeos.validate(compiled.events,{rules:[{path:item.selector,constraints:{}}]});
  assert.equal(deniedPath.ok,false);report.checks.aeos++;

  const document=titonic.createTitonicFromAeon(source,{requireStrictMode:false});
  const got=titonic.resolveTitonicAddress(document,item.selector);assert.deepEqual(got.diagnostics,[]);
  assert.deepEqual(got.bindings.map(b=>b.pathText),[item.namePath]);assert.equal(got.bindings[0].value,item.nameValue);
  const contextPath=item.subtree.slice(2).split('.');
  assert.deepEqual(titonic.resolveTitonicAddress(document,'?.\\stock1\\',{contextPath}).bindings,[]);
  const contextual=titonic.resolveTitonicAddress(document,suite.contextualSelector,{contextPath});
  assert.deepEqual(contextual.diagnostics,[]);assert.equal(contextual.bindings[0].pathText,item.namePath);
  const exported=titonic.exportTitonicAeon(document);
  const replay=core.compile(exported);assert.deepEqual(replay.errors,[]);
  samePaths(resolveAddress(item.selector,sdk.createAeonNamespace(replay.events)).bindings,[item.namePath]);report.checks.titonic++;

  for(const [sourceKind,input] of [['aeon',source],['telex',wire]]) {
    const wb=await evaluateQueryForWorkbench({sourceKind,source:input,query:`from ${item.selector}\nselect .`});
    assert.equal(wb.ok,true,JSON.stringify(wb.errors));
    assert.equal(wb.text,`${item.namePath} = ${JSON.stringify(item.nameValue)}`);
    const empty=await evaluateQueryForWorkbench({sourceKind,source:input,query});
    assert.equal(empty.ok,true);assert.deepEqual(empty.results.map(r=>r.value.bindings.map(b=>b.address)),item.projected);
    const limited=await evaluateQueryForWorkbench({sourceKind,source:input,query:`from ${item.selector}\nselect .`,budget:{maxIdentityInspections:3}});
    assert.equal(limited.ok,false);assert.equal(limited.errors[0].code,'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');
    assert.equal(limited.results,undefined);
    report.checks.workbench++;
  }
  const canonicalized=canonical.canonicalize(source);assert.deepEqual(canonicalized.errors,[]);
  assert.deepEqual(canonical.canonicalize(canonicalized.text),canonicalized);
  const replayed=core.compile(canonicalized.text);assert.deepEqual(replayed.errors,[]);
  const canonicalBinding=resolveAddress(item.selector,sdk.createAeonNamespace(replayed.events)).bindings[0];
  assert.equal(canonicalBinding.address,item.namePath);assert.equal(canonicalBinding.value,item.nameValue);report.checks.canonicalization++;

  // A structural reference remains an authored position, not an identity alias.
  const target=item.subtree+'.items[0].name';
  for(const marker of ['~','~>']) {
    const sourceWithReference=source+`copy = ${marker}${target}\n`;
    const before=core.compile(sourceWithReference);assert.deepEqual(before.errors,[]);
    const reference=before.events.find(e=>e.key==='copy').value.path;
    const canonicalRef=canonical.canonicalize(sourceWithReference);assert.deepEqual(canonicalRef.errors,[]);
    const after=core.compile(canonicalRef.text);assert.deepEqual(after.errors,[]);
    assert.deepEqual(after.events.find(e=>e.key==='copy').value.path,reference);
    assert.deepEqual(aes.projectPortableEvents(after.events).find(e=>e.path==='$.copy').value,
      aes.projectPortableEvents(before.events).find(e=>e.path==='$.copy').value);
    const indexValue=resolveAddress(target,namespace).bindings[0].value;
    assert.equal(indexValue,item.itemOrder[0]==='item1'?item.nameValue:'Bracket');
    const exportedReference=titonic.exportTitonicAeon(titonic.createTitonicFromAeon(sourceWithReference,{requireStrictMode:false}));
    assert.deepEqual(core.compile(exportedReference).events.find(e=>e.key==='copy').value.path,reference);
    report.checks.references++;
  }
  for(const marker of ['~','~>']) {const denied=core.compile(`bad = ${marker}${item.selector}`);assert.ok(denied.errors.length);assert.equal(denied.events.length,0);}
  assert.equal(planMutation({op:'remove',target:item.selector},namespace).ok,false);
  assert.equal(planInstruction(`from ${item.selector}\nremove .`,namespace).ok,false);
  report.checks.boundaries++;
  snapshots.set(item.id,{item,source,compiled,namespace,selected:selected.bindings[0],schema});
  report.snapshots.push({id:item.id,path:selected.bindings[0].address,value:selected.bindings[0].value});
}
const original=snapshots.get('original'),reordered=snapshots.get('reordered'),moved=snapshots.get('moved'),replacement=snapshots.get('replacement');
assert.notEqual(original.selected,reordered.selected);
assert.equal(original.selected.value,'Widget');assert.equal(original.selected.address,original.item.namePath);
assert.equal(aeos.validate(reordered.compiled.events,original.schema).ok,true,'same selector/schema gets fresh snapshot paths');
assert.equal(aeos.validate(moved.compiled.events,original.schema).ok,false,'move does not turn the old selector into global lookup');
assert.deepEqual(resolveAddress(original.item.selector,moved.namespace).bindings,[]);
assert.ok(core.compile(moved.source+`stale = ~${original.item.namePath}\n`).errors.length,'old structural reference is not silently relocated');
assert.equal(moved.item.selector,replacement.item.selector);assert.equal(moved.selected.address,replacement.selected.address);
assert.notEqual(moved.selected,replacement.selected);assert.notEqual(moved.selected.value,replacement.selected.value);
let calls=0;const identity=moved.namespace.identity;moved.namespace.identity=b=>{calls++;return identity(b);};
const stale=evaluateQuery('from $\nselect path($.selection)',moved.namespace,{addressActivation:{allowedRoots:[original.item.subtree],allowedSelectors:['member','position','childIdentity']}});
assert.equal(stale.ok,false);assert.equal(stale.errors[0].code,'SANSA_QUERY_PATH_ACTIVATION_DENIED');assert.equal(calls,0);
report.crossSnapshot={schemaCacheFresh:true,oldRouteMisses:true,staleStructuralReferenceRejected:true,staleActivationScopeDeniedBeforeInspection:true,idReuseIsReplacement:true};
console.log(JSON.stringify(report,null,2));
