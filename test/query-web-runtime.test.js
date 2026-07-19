import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
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

test('query web runtime exercises workbench edge-case examples', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const cases = [
    {
      name: 'item attributes',
      query: 'from $.inventory.items.* where .@.lane == "primary" select { sku = .sku lane = .@.lane }',
      count: 2,
      includes: '$.inventory.items[0] = {"sku":"A-100","lane":"primary"}',
    },
    {
      name: 'field attributes',
      query: 'from $.inventory.items.* where .sku.@.origin == "catalog" select { sku = .sku origin = .sku.@.origin }',
      count: 3,
      includes: '$.inventory.items[3] = {"sku":"D-250","origin":"catalog"}',
    },
    {
      name: 'direct expansion',
      query: 'from $.inventory.items select .*',
      count: 1,
      includes: '$.inventory.items[2]',
    },
    {
      name: 'descendant semantic type filter',
      query: 'from $ select $.inventory.items.**#string',
      count: 1,
      includes: '$.inventory.items[0].roles[0] = "admin"',
    },
    {
      name: 'descendant representation kind filter',
      query: 'from $ select $.inventory.items.**%number',
      count: 1,
      includes: '$.inventory.items[2].qty = 8',
    },
    {
      name: 'name pattern',
      query: 'from $.inventory.items.* select .("s*")',
      count: 4,
      includes: '$.inventory.items[1].sku = "B-200"',
    },
    {
      name: 'empty roles',
      query: 'from $.inventory.items.* where exists(.roles) and absent(.roles.*) select { sku = .sku name = .name }',
      count: 1,
      includes: '$.inventory.items[2] = {"sku":"C-300","name":"Coupler"}',
    },
    {
      name: 'numeric id guard',
      query: 'from $.inventory.items.* where exists(.id#number) and .id > 2 select { sku = .sku name = .name }',
      count: 1,
      includes: '$.inventory.items[3] = {"sku":"D-250","name":"Driver"}',
    },
    {
      name: 'null reason',
      query: 'from $.inventory.items.* where exists(.status) and isNullReason(.status, "notSet") select { sku = .sku name = .name }',
      count: 1,
      includes: '$.inventory.items[0] = {"sku":"A-100","name":"Adapter"}',
    },
    {
      name: 'numeric specials',
      query: 'from $.inventory.items.* where (exists(.metric) and isNaN(.metric)) or (exists(.ceiling) and isInfinity(.ceiling)) select { sku = .sku name = .name }',
      count: 2,
      includes: '$.inventory.items[3] = {"sku":"D-250","name":"Driver"}',
    },
  ];

  for (const entry of cases) {
    const result = await evaluateQueryForWorkbench({
      sourceKind: 'aeon',
      source,
      query: entry.query,
    });

    assert.equal(result.ok, true, `${entry.name}: ${JSON.stringify(result.errors ?? [])}`);
    assert.equal(result.count, entry.count, entry.name);
    assert.match(result.text, new RegExp(escapeRegExp(entry.includes)), entry.name);
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
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
