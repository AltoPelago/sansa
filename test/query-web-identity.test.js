import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAddress} from '../src/index.js';
import {evaluateQueryForWorkbench, namespaceFromAeonSource, namespaceFromTelexSource} from '../tools/query-web/runtime.mjs';

const source = "group\\g\\:object={child\\c\\:string=\"hello\"}";
async function available(t) {
  const result = await namespaceFromAeonSource('probe:string="ok"');
  if (!result.ok && result.errors[0]?.code === 'SANSA_QUERY_WORKBENCH_AEON_RUNTIME_UNAVAILABLE') {
    t.skip('A built AEON runtime is required.'); return false;
  }
  assert.equal(result.ok, true, JSON.stringify(result.errors)); return true;
}
const aeon = (query, extra = {}) => evaluateQueryForWorkbench({sourceKind: 'aeon', source, query, ...extra});

test('workbench identity chains use declared IDs and canonical paths', async t => {
  if (!await available(t)) return;
  const result = await aeon("from $.\\g\\ select .\\c\\");
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.text, '$.group.child = "hello"');
  assert.equal(result.results[0].binding.address, '$.group');
  assert.equal(result.results[0].binding.identity, 'g');
});

test('workbench identity inspection budget spans source/select and resets per call', async t => {
  if (!await available(t)) return;
  for (let repeat = 0; repeat < 2; repeat++) {
    const failed = await aeon("from $.\\g\\ select .\\c\\", {budget: {maxIdentityInspections: 1}});
    assert.equal(failed.ok, false);
    assert.equal(failed.errors[0].code, 'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');
    assert.equal(failed.errors[0].observed, 2);
    assert.equal(failed.results, undefined);
    const passed = await aeon("from $.\\g\\ select .\\c\\", {budget: {maxIdentityInspections: 2}});
    assert.equal(passed.ok, true, JSON.stringify(passed.errors));
  }
});

for (const limit of [-1, 0.5, null, Number.MAX_SAFE_INTEGER + 1]) {
  test(`workbench rejects invalid identity budget ${String(limit)}`, async t => {
    if (!await available(t)) return;
    const result = await aeon("from $.\\g\\ select .", {budget: {maxIdentityInspections: limit}});
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'SANSA_RESOLVE_INVALID_IDENTITY_LIMIT');
    assert.equal(result.results, undefined);
  });
}

test('workbench native identity projection keeps NodeHead/binding IDs distinct', async t => {
  if (!await available(t)) return;
  const input = "view\\v\\:node=<tag\\h\\:node(\\text\\:string=\"hello\")>";
  const result = await aeon("from $.\\v\\.\\h\\ select .\\text\\", {source: input});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.text, '$.view[0][0] = "hello"');
  assert.equal(result.results[0].binding.representationKind, 'NodeHead');
  assert.equal(result.results[0].binding.identity, 'h');
  const miss = await aeon("from $.\\h\\ select .", {source: input});
  assert.equal(miss.ok, true, JSON.stringify(miss.errors));
  assert.equal(miss.count, 0);
});

test('workbench attribute identities require explicit attribute traversal', async t => {
  if (!await available(t)) return;
  const input = "value\\v\\@{unit\\u\\:string=\"cm\"}:number=42";
  const selected = await aeon("from $.\\v\\ select .@.\\u\\", {source: input});
  assert.equal(selected.ok, true, JSON.stringify(selected.errors));
  assert.equal(selected.text, '$.value.@.unit = "cm"');
  const miss = await aeon("from $.\\u\\ select .", {source: input});
  assert.equal(miss.ok, true); assert.equal(miss.count, 0);
});

test('workbench identity access extends to declared params with the same query budget', async t => {
  if (!await available(t)) return;
  const result = await aeon("from $.\\g\\ select $.<\"params\">.\\p\\", {
    paramsSource: "setting\\p\\:string=\"configured\"", budget: {maxIdentityInspections: 2},
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.match(result.text, /configured/);
  const failed = await aeon("from $.\\g\\ select $.<\"params\">.\\p\\", {
    paramsSource: "setting\\p\\:string=\"configured\"", budget: {maxIdentityInspections: 1},
  });
  assert.equal(failed.ok, false); assert.equal(failed.errors[0].code, 'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');
});

test('JSON source can select declared params identities without inspecting JSON identity fields', async t => {
  if (!await available(t)) return;
  const input = {
    sourceKind: 'json',
    source: JSON.stringify({root: {address: '$', children: [
      {address: '$.opaque', name: 'opaque', identity: 'p', value: 'opaque'},
    ]}}),
    paramsSource: 'setting\\p\\:string="configured"',
  };
  const result = await evaluateQueryForWorkbench({...input,
    query: 'from $ select $.<"params">.\\p\\', budget: {maxIdentityInspections: 1}});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.results[0].value.bindings[0].address, '$.<"params">.setting');
  assert.equal(result.results[0].value.bindings[0].value, 'configured');
  const opaque = await evaluateQueryForWorkbench({...input, query: 'from $ select .\\p\\'});
  assert.equal(opaque.ok, true, JSON.stringify(opaque.errors));
  assert.deepEqual(opaque.results[0].value.bindings, []);
  const limited = await evaluateQueryForWorkbench({...input,
    query: 'from $ select $.<"params">.\\p\\', budget: {maxIdentityInspections: 0}});
  assert.equal(limited.ok, false);
  assert.equal(limited.errors[0].code, 'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');
  assert.equal(limited.errors[0].observed, 1);
  assert.equal(limited.results, undefined);
});

test('mixed JSON/AEON params identities retain nested attribute paths', async t => {
  if (!await available(t)) return;
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'json', source: '{"address":"$","children":[]}',
    paramsSource: 'group\\g\\:object={setting\\p\\@{unit\\u\\:string="cm"}:string="configured"}',
    query: 'from $ select $.<"params">.\\g\\.\\p\\.@.\\u\\',
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.results[0].value.bindings[0].address, '$.<"params">.group.setting.@.unit');
  assert.equal(result.results[0].value.bindings[0].value, 'cm');
});

test('workbench excludes header identities from the payload root', async t => {
  if (!await available(t)) return;
  const result = await aeon("from $.\\headerId\\ select .", {
    source: "aeon:header={title\\headerId\\:string=\"header\"}\nbody\\bodyId\\:string=\"body\"",
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.count, 0);
});

test('workbench ordinary native namespace retains its existing identity-closed contract', async t => {
  if (!await available(t)) return;
  const native = await namespaceFromAeonSource(source);
  assert.equal(native.namespace.identity, undefined);
  const ordinary = await aeon('from $.group select .child');
  assert.equal(ordinary.ok, true); assert.equal(ordinary.text, '$.group.child = "hello"');
});

test('opaque JSON identity fields do not advertise structural identity support', async () => {
  const result = await evaluateQueryForWorkbench({sourceKind: 'json', source: JSON.stringify({root: {
    address: '$', children: [{address: '$.a', identity: 'a', name: 'a', value: 'opaque'}],
  }}), query: "from $.\\a\\ select ."});
  assert.equal(result.ok, false); assert.equal(result.errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_IDENTITY');
});

test('trusted workbench activation does not admit identity selectors', async t => {
  if (!await available(t)) return;
  const result = await aeon('from $.address select path(.)', {
    source: "item\\a\\:string=\"hello\"\naddress:sansa=$.\\a\\",
  });
  assert.equal(result.ok, false);
  assert.equal(result.results, undefined);
  assert.match(result.errors[0].code, /UNSUPPORTED_SELECTOR/);
});

test('Telex namespace exposes declared IDs and retains ambiguity/invalid-ID failures', async t => {
  const stream = 'telex.aes=1\n\npath=$.a\nkind=StringLiteral\nidentity=a\nvalue=hello\n';
  const loaded = await namespaceFromTelexSource(stream);
  if (!loaded.ok && loaded.errors[0]?.code === 'SANSA_QUERY_WORKBENCH_TELEX_RUNTIME_UNAVAILABLE') {t.skip('Built AES runtime required'); return;}
  assert.equal(loaded.ok, true, JSON.stringify(loaded.errors));
  assert.equal(resolveAddress("$.\\a\\", loaded.namespace).bindings[0].address, '$.a');
  const first = loaded.namespace.root.children[0];
  loaded.namespace.root.children.push({...first, address: '$.b'});
  const duplicate = resolveAddress("$.\\a\\", loaded.namespace);
  assert.equal(duplicate.ok, false); assert.equal(duplicate.errors[0].code, 'SANSA_RESOLVE_AMBIGUOUS_IDENTITY');
  loaded.namespace.root.children[1].identity = '';
  assert.equal(resolveAddress("$.\\a\\", loaded.namespace).errors[0].code, 'SANSA_RESOLVE_INVALID_IDENTITY');
  const result = await evaluateQueryForWorkbench({sourceKind:'telex',source:stream,query:"from $.\\a\\ select ."});
  assert.equal(result.ok, true); assert.equal(result.text, '$.a = "hello"');
});

test('Film identity vector uses declared IDs with canonical structural provenance', async t => {
  // Existing film-record-001-identity vector, unchanged bytes; not a writer API.
  const bytes = Uint8Array.from('4f5f5fff010012040103242e610962696e64696e672d300178'.match(/../g), h => parseInt(h, 16));
  const result = await evaluateQueryForWorkbench({sourceKind:'film',source:bytes,query:"from $.\\binding-0\\ select ."});
  if (!result.ok && result.errors[0]?.code === 'SANSA_QUERY_WORKBENCH_FILM_RUNTIME_UNAVAILABLE') {t.skip('Built AES runtime required'); return;}
  assert.equal(result.ok, true, JSON.stringify(result.errors)); assert.equal(result.text, '$.a = "x"');
  assert.equal(result.results[0].binding.identity, 'binding-0');
});
