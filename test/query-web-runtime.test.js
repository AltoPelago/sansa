import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { firstQueryExampleName, queryExampleGroups, queryExamples } from '../tools/query-web/examples.mjs';
import { evaluateQueryForWorkbench, parseQueryForWorkbench } from '../tools/query-web/runtime.mjs';

test('query web runtime parses query summaries', () => {
  const result = parseQueryForWorkbench('from $.inventory.items.* select .sku');

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(result.query, {
    canonical: 'from $.inventory.items.*\nselect .sku',
    clauses: ['from', 'select'],
    from: '$.inventory.items.*',
    select: '.sku',
  });
  assert.match(result.inspect, /canonical: from \$\.inventory\.items\.\*\nselect \.sku/);
  assert.match(result.inspect, /select: \.sku/);
});

test('query web runtime evaluates against AEON source', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.inventory.items.* where contains(.sku, "B") select .sku',
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.count, 1);
  assert.equal(result.text, '$.inventory.items[1].sku = "B-200"');
  assert.match(result.inspect, /Result 1/);
  assert.match(result.inspect, /candidate: \$\.inventory\.items\[1\]/);
  assert.match(result.inspect, /candidate\.representationKind: object/);
  assert.match(result.inspect, /value: bindingSet \(1 binding\)/);
  assert.match(result.inspect, /- \$\.inventory\.items\[1\]\.sku/);
  assert.match(result.inspect, /binding\.semanticType: string/);
  assert.match(result.inspect, /binding\.representationKind: string/);
  assert.match(result.inspect, /binding\.value: "B-200"/);
  assert.equal(result.results[0].type, 'queryResult');
  assert.equal(result.results[0].address, '$.inventory.items[1]');
  assert.deepEqual(result.results[0].value.bindings, [
    {
      address: '$.inventory.items[1].sku',
      name: 'sku',
      semanticType: 'string',
      representationKind: 'string',
      value: 'B-200',
    },
  ]);
});

test('query web runtime renders AEON-style text values', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.inventory.items.* select { sku = .sku status = fallback(.status, "missing") }',
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.text, [
    '$.inventory.items[0] = {"sku":"A-100","status":!notSet}',
    '$.inventory.items[1] = {"sku":"B-200","status":"active"}',
    '$.inventory.items[2] = {"sku":"C-300","status":"missing"}',
    '$.inventory.items[3] = {"sku":"D-250","status":!notApplicable}',
  ].join('\n'));
});

test('query web runtime activates structured address literals from JSON fixtures', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.json', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'json',
    source,
    query: 'from $.inventory.items[1] select path($.<"params">.field)',
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.text, '$.inventory.items[1].sku = "B-200"');
});

test('query web runtime activates dynamic from path sources from JSON fixtures', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.json', import.meta.url), 'utf8');
  const parsed = parseQueryForWorkbench('from path($.<"params">.source) where .qty >= 4 select .sku');
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors ?? []));
  assert.match(parsed.inspect, /from: path\(\$\.<"params">\.source\)/);

  const result = await evaluateQueryForWorkbench({
    sourceKind: 'json',
    source,
    query: 'from path($.<"params">.source) where .qty >= 4 select .sku',
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.text, [
    '$.inventory.items[1].sku = "B-200"',
    '$.inventory.items[2].sku = "C-300"',
    '$.inventory.items[3].sku = "D-250"',
  ].join('\n'));
});

test('query web example catalog is grouped and uniquely keyed', () => {
  assert.equal(firstQueryExampleName(), 'directExpansion');
  assert.deepEqual(queryExampleGroups.map((group) => group.label), [
    'Resolution',
    'Attributes',
    'Predicates',
    'Functions',
    'Pipeline',
    'Diagnostics',
  ]);

  const names = queryExampleGroups.flatMap((group) => group.examples.map((example) => example.name));
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(Object.keys(queryExamples), names);
});

test('query web runtime exercises workbench examples', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const cases = queryExampleGroups.flatMap((group) => group.examples)
    .filter((example) => example.expected);

  for (const entry of cases) {
    const result = await evaluateQueryForWorkbench({
      sourceKind: 'aeon',
      source,
      query: entry.query,
    });

    assert.equal(result.ok, entry.expected.ok, `${entry.name}: ${JSON.stringify(result.errors ?? [])}`);
    if (entry.expected.ok) {
      assert.equal(result.count, entry.expected.count, entry.name);
    } else {
      assert.equal(result.errors[0].code, entry.expected.code, entry.name);
    }
    assert.match(result.text, new RegExp(escapeRegExp(entry.expected.includes)), entry.name);
  }
});

test('query web runtime reports AEON source diagnostics', async () => {
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source: 'inventory = { items:list<object> = [] }',
    query: 'from $.inventory.items.* select .sku',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'UNTYPED_VALUE_IN_STRICT_MODE');
  assert.match(result.text, /UNTYPED_VALUE_IN_STRICT_MODE:/);
});

test('query web runtime preserves query diagnostic context', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.inventory.items.* where .sku select .sku',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN');
  assert.equal(result.errors[0].phase, 'where');
  assert.equal(result.errors[0].candidateAddress, '$.inventory.items[0]');
  assert.equal(
    result.text,
    'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN [where] at $.inventory.items[0]: Expected Boolean query value',
  );
});

test('query web runtime formats parse diagnostics as text', () => {
  const result = parseQueryForWorkbench('from $.inventory.items.*');

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_QUERY_EXPECTED_SELECT');
  assert.match(result.text, /SANSA_QUERY_EXPECTED_SELECT index/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
