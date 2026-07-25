import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runMutationForWorkbench } from '../tools/mutate-web/runtime.mjs';
import { namespaceFromAeonSource } from '../tools/query-web/runtime.mjs';

let aeonRuntimeProbe;

async function hasAeonRuntime() {
  if (aeonRuntimeProbe !== undefined) return aeonRuntimeProbe;
  try {
    const result = await namespaceFromAeonSource('probe:string = "ok"');
    aeonRuntimeProbe = result.ok
      ? { ok: true }
      : { ok: false, message: result.errors?.[0]?.message ?? 'AEON runtime unavailable' };
  } catch (error) {
    aeonRuntimeProbe = {
      ok: false,
      message: error instanceof Error ? error.message : 'AEON runtime unavailable',
    };
  }
  return aeonRuntimeProbe;
}

function testAeonRuntime(name, fn) {
  test(name, async (t) => {
    const runtime = await hasAeonRuntime();
    if (!runtime.ok) {
      t.skip(runtime.message);
      return;
    }
    await fn(t);
  });
}

testAeonRuntime('mutate web runtime plans structured mutation requests', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      operations: [
        { op: 'replace', target: '$.inventory.items[0].sku', value: 'A-101' },
      ],
      preconditions: [
        { expression: '$.inventory.items[0].sku == "A-100"' },
      ],
      provenance: { source: 'test' },
    }),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.plan.operations[0].op, 'replace');
  assert.equal(result.plan.operations[0].target.canonicalAddress, '$.inventory.items[0].sku');
  assert.deepEqual(result.plan.sourceProvenance, { source: 'test' });
  assert.match(result.text, /operations: 1/);
});

testAeonRuntime('mutate web runtime applies mutations to an isolated source tree', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      op: 'replace',
      target: '$.inventory.items[0].sku',
      value: 'A-101',
    }),
    options: { requireAtomic: true },
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.result.operationResults[0].status, 'applied');
  assert.equal(result.result.operationResults[0].targetAddress, '$.inventory.items[0].sku');
  assert.match(result.source, /sku:string = "A-101"/);
  assert.match(result.source, /^consent:toggle = yes/);
  assert.doesNotMatch(result.source, /^\$:object = \{/);
  assert.match(result.text, /applied: 1/);
  assert.doesNotMatch(result.text, /sku:string = "A-101"/);

  const rendered = await namespaceFromAeonSource(result.source);
  assert.equal(rendered.ok, true, JSON.stringify(rendered.errors ?? []));
});

testAeonRuntime('mutate web runtime reports invalid mutation JSON', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: '{',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_WORKBENCH_INVALID_MUTATION_JSON');
});

testAeonRuntime('mutate web runtime reports create against non-container parents', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'plan',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types.color',
      name: 'status',
      value: 'active',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_MUTATE_PARENT_NOT_CONTAINER');
  assert.match(result.text, /Create parent \$\.types\.color is not a container binding/);
});

testAeonRuntime('mutate web runtime creates attributes through attribute-space parents', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await runMutationForWorkbench({
    source,
    mode: 'apply',
    requestSource: JSON.stringify({
      op: 'create',
      parent: '$.types.color.@',
      name: 'status',
      value: 'active',
    }),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.match(result.source, /color@\{status:string = "active"\}:hex = #ff00aa/);
  assert.match(result.text, /applied: 1/);

  const rendered = await namespaceFromAeonSource(result.source);
  assert.equal(rendered.ok, true, JSON.stringify(rendered.errors ?? []));
});
