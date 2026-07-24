import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { firstQueryExampleName, queryExampleGroups, queryExamples } from '../tools/query-web/examples.mjs';
import {
  evaluateQueryForWorkbench,
  namespaceFromAeonSource,
  parseQueryForWorkbench,
} from '../tools/query-web/runtime.mjs';

const defaultParamsSource = [
  'source:sansa = $.inventory.items.*',
  'field:sansa = ?.sku',
  'statusField:sansa = ?.status',
  'sortField:sansa = ?.qty',
  'name:string = "Adapter"',
].join('\n');

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

testAeonRuntime('query web runtime evaluates against AEON source', async () => {
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

testAeonRuntime('query web runtime evaluates AEON toggle literal comparisons', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.consent\nwhere . == yes\nselect .',
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.count, 1);
  assert.equal(result.text, '$.consent = yes');

  const notCoerced = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.fallbackConsent\nwhere . == yes\nselect .',
  });

  assert.equal(notCoerced.ok, true, JSON.stringify(notCoerced.errors ?? []));
  assert.equal(notCoerced.count, 0);

  const booleanComparison = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.consent\nwhere . == true\nselect .',
  });

  assert.equal(booleanComparison.ok, false);
  assert.equal(booleanComparison.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');
});

testAeonRuntime('query web runtime preserves AEON scalar value families', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const hexFilter = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.*%hex\nselect .',
  });

  assert.equal(hexFilter.ok, true, JSON.stringify(hexFilter.errors ?? []));
  assert.equal(hexFilter.text, [
    '$.types.color = #ff00aa',
    '$.types.colorCopy = #ff00aa',
  ].join('\n'));

  const hexEquality = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.color\nwhere . == $.types.colorCopy\nselect .',
  });
  assert.equal(hexEquality.ok, true, JSON.stringify(hexEquality.errors ?? []));
  assert.equal(hexEquality.count, 1);

  const hexLiteralEquality = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.color\nwhere . == #ff00aa\nselect .',
  });
  assert.equal(hexLiteralEquality.ok, true, JSON.stringify(hexLiteralEquality.errors ?? []));
  assert.equal(hexLiteralEquality.text, '$.types.color = #ff00aa');

  const radixLiteralEquality = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.mask\nwhere . == %ff00aa\nselect .',
  });
  assert.equal(radixLiteralEquality.ok, true, JSON.stringify(radixLiteralEquality.errors ?? []));
  assert.equal(radixLiteralEquality.count, 0);

  const encodingLiteralEquality = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.payload\nwhere . == &QmFzZTY0IQ==\nselect .',
  });
  assert.equal(encodingLiteralEquality.ok, true, JSON.stringify(encodingLiteralEquality.errors ?? []));
  assert.equal(encodingLiteralEquality.text, '$.types.payload = &QmFzZTY0IQ==');

  const separatorLiteralEquality = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.version\nwhere . == ^0.11.0\nselect .',
  });
  assert.equal(separatorLiteralEquality.ok, true, JSON.stringify(separatorLiteralEquality.errors ?? []));
  assert.equal(separatorLiteralEquality.text, '$.types.version = ^0.11.0');

  const hexRadixComparison = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.color\nwhere . == $.types.mask\nselect .',
  });
  assert.equal(hexRadixComparison.ok, false);
  assert.equal(hexRadixComparison.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const temporalComparison = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.released\nwhere . == $.types.released\nselect .',
  });
  assert.equal(temporalComparison.ok, true, JSON.stringify(temporalComparison.errors ?? []));
  assert.equal(temporalComparison.text, '$.types.released = 2026-07-25');

  const temporalLiteralComparison = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.*#date\nwhere . > 2025-01-01\nselect .',
  });
  assert.equal(temporalLiteralComparison.ok, true, JSON.stringify(temporalLiteralComparison.errors ?? []));
  assert.equal(temporalLiteralComparison.text, '$.types.released = 2026-07-25');

  const temporalCrossFamilyComparison = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.stamp\nwhere . > $.types.released\nselect .',
  });
  assert.equal(temporalCrossFamilyComparison.ok, false);
  assert.equal(temporalCrossFamilyComparison.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const nullLiteralComparison = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.inventory.items[0].status\nwhere . == !notSet\nselect .',
  });
  assert.equal(nullLiteralComparison.ok, false);
  assert.equal(nullLiteralComparison.errors[0].code, 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON');

  const aeonishRendering = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.types.*\nselect .',
  });
  assert.equal(aeonishRendering.ok, true, JSON.stringify(aeonishRendering.errors ?? []));
  assert.match(aeonishRendering.text, /\$\.types\.mask = %ff00aa/);
  assert.match(aeonishRendering.text, /\$\.types\.payload = &QmFzZTY0IQ==/);
  assert.match(aeonishRendering.text, /\$\.types\.version = \^0\.11\.0/);
  assert.match(aeonishRendering.text, /\$\.types\.released = 2026-07-25/);
  assert.match(aeonishRendering.text, /\$\.types\.selector = \$\.inventory\.items\.\*\.sku/);

  const referenceForm = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.targetClone\nwhere . == $.targetClone\nselect .',
  });
  assert.equal(referenceForm.ok, true, JSON.stringify(referenceForm.errors ?? []));
  assert.equal(referenceForm.text, '$.targetClone = ~target');
});

test('query web runtime applies explicit value semantics profiles', async () => {
  const source = JSON.stringify({
    root: {
      address: '$',
      representationKind: 'object',
      children: [
        {
          name: 'labels',
          address: '$.labels',
          representationKind: 'list',
          children: [
            {
              index: 0,
              address: '$.labels[0]',
              representationKind: 'object',
              children: [
                {
                  name: 'value',
                  address: '$.labels[0].value',
                  semanticType: 'string',
                  representationKind: 'string',
                  value: 'zebre',
                },
              ],
            },
            {
              index: 1,
              address: '$.labels[1]',
              representationKind: 'object',
              children: [
                {
                  name: 'value',
                  address: '$.labels[1].value',
                  semanticType: 'string',
                  representationKind: 'string',
                  value: 'éclair',
                },
              ],
            },
          ],
        },
      ],
    },
  });

  const defaultResult = await evaluateQueryForWorkbench({
    sourceKind: 'json',
    source,
    query: 'from $.labels.*\norder by .value asc\nselect .value',
    valueSemantics: 'aeon.value.string.codepoint.v1',
  });
  assert.equal(defaultResult.ok, true, JSON.stringify(defaultResult.errors ?? []));
  assert.equal(defaultResult.text, [
    '$.labels[0].value = "zebre"',
    '$.labels[1].value = "éclair"',
  ].join('\n'));
  assert.equal(defaultResult.valueSemantics, 'aeon.value.string.codepoint.v1');

  const frenchResult = await evaluateQueryForWorkbench({
    sourceKind: 'json',
    source,
    query: 'from $.labels.*\norder by .value asc\nselect .value',
    valueSemantics: 'aeon.value.string.locale.fr.v1',
  });
  assert.equal(frenchResult.ok, true, JSON.stringify(frenchResult.errors ?? []));
  assert.equal(frenchResult.text, [
    '$.labels[1].value = "éclair"',
    '$.labels[0].value = "zebre"',
  ].join('\n'));
  assert.equal(frenchResult.valueSemantics, 'aeon.value.string.locale.fr.v1');
});

testAeonRuntime('query web runtime applies value semantics profiles to ordered function projections', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const query = 'from $.labels.*\norder by .value asc\nselect upper(.value)';

  const codepointResult = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query,
    valueSemantics: 'aeon.value.string.codepoint.v1',
  });
  assert.equal(codepointResult.ok, true, JSON.stringify(codepointResult.errors ?? []));
  assert.equal(codepointResult.text, [
    '$.labels[2] = "ADAPTER"',
    '$.labels[0] = "ZEBRE"',
    '$.labels[1] = "ÉCLAIR"',
  ].join('\n'));
  assert.equal(codepointResult.valueSemantics, 'aeon.value.string.codepoint.v1');

  const frenchResult = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query,
    valueSemantics: 'aeon.value.string.locale.fr.v1',
  });
  assert.equal(frenchResult.ok, true, JSON.stringify(frenchResult.errors ?? []));
  assert.equal(frenchResult.text, [
    '$.labels[2] = "ADAPTER"',
    '$.labels[1] = "ÉCLAIR"',
    '$.labels[0] = "ZEBRE"',
  ].join('\n'));
  assert.equal(frenchResult.valueSemantics, 'aeon.value.string.locale.fr.v1');
});

testAeonRuntime('query web runtime applies natural ASCII value semantics profiles', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const query = 'from $.parts.*\norder by .value asc\nselect .value';

  const codepointResult = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query,
    valueSemantics: 'aeon.value.string.codepoint.v1',
  });
  assert.equal(codepointResult.ok, true, JSON.stringify(codepointResult.errors ?? []));
  assert.equal(codepointResult.text, [
    '$.parts[2].value = "part-1"',
    '$.parts[0].value = "part-10"',
    '$.parts[1].value = "part-2"',
  ].join('\n'));

  const naturalResult = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query,
    valueSemantics: 'aeon.value.string.natural.ascii.v1',
  });
  assert.equal(naturalResult.ok, true, JSON.stringify(naturalResult.errors ?? []));
  assert.equal(naturalResult.text, [
    '$.parts[2].value = "part-1"',
    '$.parts[1].value = "part-2"',
    '$.parts[0].value = "part-10"',
  ].join('\n'));
  assert.equal(naturalResult.valueSemantics, 'aeon.value.string.natural.ascii.v1');
});

testAeonRuntime('query web runtime keeps numeric representation filters separate from numeric specials', async () => {
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

testAeonRuntime('query web runtime evaluates parent traversal against AEON source', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: 'from $.inventory.items[1].sku\nselect .^.qty',
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.text, '$.inventory.items[1].qty = 4');
});

testAeonRuntime('query web runtime evaluates objectFrom against AEON source', async () => {
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

testAeonRuntime('query web runtime evaluates contains over binding sets and the current binding', async () => {
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

testAeonRuntime('query web runtime renders AEON-style text values', async () => {
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

testAeonRuntime('query web runtime evaluates resolveChild and fallback in one projection', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    query: [
      'from $.inventory.items.*',
      'where .qty >= 4',
      'select { sku = .sku category = resolveChild($.inventory.categoryLabels, .category) status = fallback(.status, "missing") }',
    ].join('\n'),
  });

  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.equal(result.text, [
    '$.inventory.items[1] = {"sku":"B-200","category":"Hardware","status":"active"}',
    '$.inventory.items[2] = {"sku":"C-300","category":"Hardware","status":"missing"}',
    '$.inventory.items[3] = {"sku":"D-250","category":"Tooling","status":!notApplicable}',
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
      'order by .value asc',
      'select .value',
    ].join('\n'),
  });

  assert.equal(unicodeOrder.ok, true, JSON.stringify(unicodeOrder.errors ?? []));
  assert.equal(unicodeOrder.text, [
    '$.labels[2].value = "adapter"',
    '$.labels[0].value = "zebre"',
    '$.labels[1].value = "éclair"',
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

testAeonRuntime('query web runtime mounts AEON params as a local address space', async () => {
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

  const scalarParam = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    paramsSource: defaultParamsSource,
    query: [
      'from $.inventory.items.*',
      'where .name == $.<"params">.name',
      'select .sku',
    ].join('\n'),
  });

  assert.equal(scalarParam.ok, true, JSON.stringify(scalarParam.errors ?? []));
  assert.equal(scalarParam.text, '$.inventory.items[0].sku = "A-100"');
});

testAeonRuntime('query web runtime reports params diagnostics', async () => {
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
    'Ordering',
    'Value Families',
    'Value Semantics',
    'Pipeline',
    'Recipes',
    'Diagnostics',
  ]);

  const names = queryExampleGroups.flatMap((group) => group.examples.map((example) => example.name));
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(Object.keys(queryExamples), names);
});

testAeonRuntime('query web runtime exercises workbench examples', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const cases = queryExampleGroups.flatMap((group) => group.examples)
    .filter((example) => example.expected);

  for (const entry of cases) {
    const result = await evaluateQueryForWorkbench({
      sourceKind: 'aeon',
      source,
      paramsSource: defaultParamsSource,
      query: entry.query,
      valueSemantics: entry.valueSemantics ?? '',
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

testAeonRuntime('query web runtime reports AEON source diagnostics', async () => {
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source: 'inventory = { items:list<object> = [] }',
    query: 'from $.inventory.items.* select .sku',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'UNTYPED_VALUE_IN_STRICT_MODE');
  assert.match(result.text, /UNTYPED_VALUE_IN_STRICT_MODE:/);
});

testAeonRuntime('query web runtime preserves query diagnostic context', async () => {
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

testAeonRuntime('query web runtime applies validation policy', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const safe = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    policy: 'validation',
    query: 'from $.inventory.items.* where .qty >= 4 select .sku',
  });

  assert.equal(safe.ok, true, JSON.stringify(safe.errors ?? []));
  assert.equal(safe.count, 3);

  const rejected = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    policy: 'validation',
    query: 'from $.inventory.items.* select { sku = .sku qty = .qty }',
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.errors[0].code, 'SANSA_QUERY_POLICY_VIOLATION');
  assert.equal(rejected.errors[0].phase, 'policy');
  assert.match(rejected.text, /SANSA_QUERY_POLICY_VIOLATION \[policy\]/);
});

testAeonRuntime('query web runtime can disable transform extensions', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    transformExtensions: false,
    query: 'from $.table.content.* select objectFrom($.table.header.*, .*)',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION');
  assert.equal(result.errors[0].extension, 'sansa.transform.objectFrom');
  assert.match(result.text, /SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION \[select\]/);
});

testAeonRuntime('query web runtime applies evaluation budgets', async () => {
  const source = readFileSync(new URL('../fixtures/query-inventory.aeon', import.meta.url), 'utf8');
  const result = await evaluateQueryForWorkbench({
    sourceKind: 'aeon',
    source,
    budget: { maxFromBindings: 3 },
    query: 'from $.inventory.items.* select .sku',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'SANSA_QUERY_BUDGET_EXCEEDED');
  assert.equal(result.errors[0].phase, 'from');
  assert.equal(result.errors[0].budget, 'maxFromBindings');
  assert.equal(result.errors[0].limit, 3);
  assert.equal(result.errors[0].observed, 4);
  assert.match(result.text, /SANSA_QUERY_BUDGET_EXCEEDED \[from\]/);
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
