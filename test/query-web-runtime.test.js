import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { firstQueryExampleName, queryExampleGroups, queryExamples } from '../tools/query-web/examples.mjs';
import { evaluateQueryForWorkbench, parseQueryForWorkbench } from '../tools/query-web/runtime.mjs';

const defaultParamsSource = [
  'source:sansa = $.inventory.items.*',
  'field:sansa = ?.sku',
  'statusField:sansa = ?.status',
  'sortField:sansa = ?.qty',
].join('\n');

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

test('query web runtime keeps numeric representation filters separate from numeric specials', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const numbers = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $\nselect $.inventory.items.**%number',
  });

  assert.equal(numbers.ok, true, JSON.stringify(numbers.errors ?? []));
  assert.equal(numbers.text, [
    '$.inventory.items[0].metric = 10',
    '$.inventory.items[0].qty = 1',
    '$.inventory.items[1].qty = 4',
    '$.inventory.items[2].qty = 8',
    '$.inventory.items[3].id = 3',
    '$.inventory.items[3].qty = 4',
  ].join('\n'));
  assert.doesNotMatch(numbers.text, /NaN|Infinity/);

  const specials = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $\nselect $.inventory.items.**%nan',
  });

  assert.equal(specials.ok, true, JSON.stringify(specials.errors ?? []));
  assert.equal(specials.text, '$.inventory.items[2].metric = NaN');

  const infinity = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $\nselect $.inventory.items.**%infinity',
  });

  assert.equal(infinity.ok, true, JSON.stringify(infinity.errors ?? []));
  assert.equal(infinity.text, '$.inventory.items[3].ceiling = Infinity');
});

test('query web runtime evaluates parent traversal against AEON source', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.inventory.items[1].sku\nselect .^.qty',
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.text, '$.inventory.items[1].qty = 4');
});

test('query web runtime evaluates objectFrom against AEON source', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.table.content.*\nselect objectFrom($.table.header.*, .*)',
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.text, [
    '$.table.content[0] = {"name":"Bob","age":22}',
    '$.table.content[1] = {"name":"Alice","age":31}',
  ].join('\n'));

  const ageOnly = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.table.content.*\nselect objectFrom($.table.header[1], .[1])',
  });

  assert.equal(ageOnly.ok, true, JSON.stringify(ageOnly.errors ?? []));
  assert.equal(ageOnly.text, [
    '$.table.content[0] = {"age":22}',
    '$.table.content[1] = {"age":31}',
  ].join('\n'));

  const fieldsFrom = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.table.content.*\nselect fieldsFrom($.table.header.*, .*, "age")',
  });

  assert.equal(fieldsFrom.ok, true, JSON.stringify(fieldsFrom.errors ?? []));
  assert.equal(fieldsFrom.text, [
    '$.table.content[0] = {"age":22}',
    '$.table.content[1] = {"age":31}',
  ].join('\n'));
});

test('query web runtime evaluates contains over binding sets and the current binding', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const itemResult = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: [
      'from $.inventory.items.*',
      'where any(contains(.roles.*, "min"))',
      'select { sku = .sku name = .name }',
    ].join('\n'),
  });

  assert.equal(itemResult.ok, true, JSON.stringify(itemResult.errors ?? []));
  assert.equal(itemResult.text, [
    '$.inventory.items[0] = {"sku":"A-100","name":"Adapter"}',
    '$.inventory.items[3] = {"sku":"D-250","name":"Driver"}',
  ].join('\n'));

  const roleResult = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: [
      'from $.inventory.items.*.roles.*',
      'where contains(., "min")',
      'select .',
    ].join('\n'),
  });

  assert.equal(roleResult.ok, true, JSON.stringify(roleResult.errors ?? []));
  assert.equal(roleResult.text, [
    '$.inventory.items[0].roles[0] = "admin"',
    '$.inventory.items[3].roles[0] = "admin"',
    '$.inventory.items[3].roles[1] = "admin"',
  ].join('\n'));
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

test('query web runtime keeps JSON fixture parity for table and label examples', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.json', import.meta.url), 'utf8');
  const objectFrom = await evaluateQueryForWorkbench({
    sourceKind: 'json',
    source,
    query: 'from $.table.content.* select objectFrom($.table.header.*, .*)',
  });

  assert.equal(objectFrom.ok, true, JSON.stringify(objectFrom.errors ?? []));
  assert.equal(objectFrom.text, [
    '$.table.content[0] = {"name":"Bob","age":22}',
    '$.table.content[1] = {"name":"Alice","age":31}',
  ].join('\n'));

  const unicodeOrder = await evaluateQueryForWorkbench({
    sourceKind: 'json',
    source,
    query: [
      'from $.labels.*',
      'where .value >= "z"',
      'order by .value asc',
      'select .value',
    ].join('\n'),
  });

  assert.equal(unicodeOrder.ok, true, JSON.stringify(unicodeOrder.errors ?? []));
  assert.equal(unicodeOrder.text, [
    '$.labels[0].value = "z"',
    '$.labels[1].value = "ä"',
  ].join('\n'));

  const duplicateHeader = await evaluateQueryForWorkbench({
    sourceKind: 'json',
    source,
    query: 'from $.table.content[0] select objectFrom($.table.duplicateHeader.*, .*)',
  });

  assert.equal(duplicateHeader.ok, false);
  assert.equal(duplicateHeader.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL');
  assert.match(duplicateHeader.text, /duplicate key 'name'/);
});

test('query web runtime mounts AEON params as a local address space', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    paramsSource: defaultParamsSource,
    query: [
      'from path($.<"params">.source)',
      'where isValue(path($.<"params">.statusField))',
      'order by path($.<"params">.sortField) asc',
      'select path($.<"params">.field)',
    ].join('\n'),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.text, '$.inventory.items[1].sku = "B-200"');
  assert.deepEqual(result.sourceDiagnostics, [
    {
      code: 'SANSA_QUERY_WORKBENCH_PARAMS_MOUNTED',
      message: 'Mounted $.<"params"> local space.',
    },
  ]);
});

test('query web runtime reports params diagnostics', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    paramsSource: 'source:sansa = $.items[01]',
    query: 'from $.inventory.items.* select .sku',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors[0].code, /^PARAMS_/);
  assert.match(result.text, /PARAMS_/);
});

test('query web example catalog is grouped and uniquely keyed', () => {
  assert.equal(firstQueryExampleName(), 'directExpansion');
  assert.deepEqual(queryExampleGroups.map((group) => group.label), [
    'Resolution',
    'Attributes',
    'Predicates',
    'Functions',
    'Pipeline',
    'Recipes',
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
      paramsSource: defaultParamsSource,
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
