import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { namespaceFromAeonSource } from '../tools/query-web/runtime.mjs';

const toolPath = fileURLToPath(new URL('../scripts/query.mjs', import.meta.url));
const defaultParams = JSON.stringify({
  source: {
    type: 'SansaAddressLiteral',
    address: '$.inventory.items.*',
  },
  field: {
    type: 'SansaAddressLiteral',
    address: '?.sku',
  },
  active: {
    type: 'SansaAddressLiteral',
    address: '?.active',
  },
});

function runTool(args) {
  return spawnSync(process.execPath, [toolPath, ...args], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
}

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

test('query tool help documents fixture kind support', () => {
  const result = runTool(['--help']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /Defaults to fixtures\/query-inventory\.json/);
  assert.match(result.stdout, /--fixture-kind <kind>/);
  assert.match(result.stdout, /Force fixture kind: aeon or json/);
  assert.match(result.stdout, /--policy <policy>/);
  assert.match(result.stdout, /--disable-transform/);
  assert.match(result.stdout, /--max-from-bindings <n>/);
});

test('query tool evaluates a query against the default fixture', () => {
  const result = runTool([
    '--query',
    'from $.inventory.items.* where contains(.sku, "B") select .sku',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), '$.inventory.items[1].sku = "B-200"');
});

test('query tool renders AEON-style text values', () => {
  const result = runTool([
    '--query',
    'from $.inventory.items.* select { sku = .sku status = fallback(.status, "missing") }',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), [
    '$.inventory.items[0] = {"sku":"A-100","status":!notSet}',
    '$.inventory.items[1] = {"sku":"B-200","status":"active"}',
    '$.inventory.items[2] = {"sku":"C-300","status":"missing"}',
    '$.inventory.items[3] = {"sku":"D-250","status":!notApplicable}',
  ].join('\n'));
});

test('query tool activates structured address literals with path', () => {
  const result = runTool([
    '--params',
    defaultParams,
    '--query',
    'from $.inventory.items[1] select path($.<"params">.field)',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), '$.inventory.items[1].sku = "B-200"');
});

test('query tool activates dynamic from sources with path', () => {
  const result = runTool([
    '--params',
    defaultParams,
    '--query',
    'from path($.<"params">.source) where .qty >= 4 select .sku',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), [
    '$.inventory.items[1].sku = "B-200"',
    '$.inventory.items[2].sku = "C-300"',
    '$.inventory.items[3].sku = "D-250"',
  ].join('\n'));
});

test('query tool evaluates objectFrom against the default fixture', () => {
  const result = runTool([
    '--query',
    'from $.table.content.* select objectFrom($.table.header.*, .*)',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), [
    '$.table.content[0] = {"name":"Bob","age":22}',
    '$.table.content[1] = {"name":"Alice","age":31}',
  ].join('\n'));
});

test('query tool applies validation policy', () => {
  const safe = runTool([
    '--policy',
    'validation',
    '--query',
    'from $.inventory.items.* where .qty >= 4 select .sku',
  ]);

  assert.equal(safe.status, 0, safe.stderr);
  assert.equal(safe.stdout.trim(), [
    '$.inventory.items[1].sku = "B-200"',
    '$.inventory.items[2].sku = "C-300"',
    '$.inventory.items[3].sku = "D-250"',
  ].join('\n'));

  const rejected = runTool([
    '--policy',
    'validation',
    '--query',
    'from $.inventory.items.* select { sku = .sku qty = .qty }',
  ]);

  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /SANSA_QUERY_POLICY_VIOLATION \[policy\]/);

  const invalidPolicy = runTool([
    '--policy',
    'reporting',
    '--query',
    'from $.inventory.items.* select .sku',
  ]);

  assert.equal(invalidPolicy.status, 2);
  assert.match(invalidPolicy.stderr, /unsupported --policy 'reporting'/);
});

test('query tool can disable transform extensions', () => {
  const result = runTool([
    '--disable-transform',
    '--query',
    'from $.table.content.* select objectFrom($.table.header.*, .*)',
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION/);
  assert.match(result.stderr, /sansa.transform.objectFrom/);
});

test('query tool applies evaluation budgets', () => {
  const result = runTool([
    '--max-from-bindings',
    '3',
    '--format',
    'json',
    '--query',
    'from $.inventory.items.* select .sku',
  ]);

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.errors[0].code, 'SANSA_QUERY_BUDGET_EXCEEDED');
  assert.equal(payload.errors[0].phase, 'from');
  assert.equal(payload.errors[0].budget, 'maxFromBindings');
  assert.equal(payload.errors[0].limit, 3);
  assert.equal(payload.errors[0].observed, 4);

  const invalid = runTool([
    '--max-from-bindings',
    '1.5',
    '--query',
    'from $.inventory.items.* select .sku',
  ]);

  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /expects a non-negative integer/);
});

test('query tool evaluates table and label examples against JSON fixtures', () => {
  const objectFrom = runTool([
    '--fixture',
    'fixtures/query-inventory.json',
    '--query',
    'from $.table.content.* select objectFrom($.table.header.*, .*)',
  ]);

  assert.equal(objectFrom.status, 0, objectFrom.stderr);
  assert.equal(objectFrom.stderr, '');
  assert.equal(objectFrom.stdout.trim(), [
    '$.table.content[0] = {"name":"Bob","age":22}',
    '$.table.content[1] = {"name":"Alice","age":31}',
  ].join('\n'));

  const unicodeOrder = runTool([
    '--fixture',
    'fixtures/query-inventory.json',
    '--query',
    [
      'from $.labels.*',
      'where .value >= "z"',
      'order by .value asc',
      'select .value',
    ].join('\n'),
  ]);

  assert.equal(unicodeOrder.status, 0, unicodeOrder.stderr);
  assert.equal(unicodeOrder.stderr, '');
  assert.equal(unicodeOrder.stdout.trim(), [
    '$.labels[0].value = "z"',
    '$.labels[1].value = "ä"',
  ].join('\n'));

  const duplicateHeader = runTool([
    '--fixture',
    'fixtures/query-inventory.json',
    '--query',
    'from $.table.content[0] select objectFrom($.table.duplicateHeader.*, .*)',
  ]);

  assert.equal(duplicateHeader.status, 1);
  assert.match(duplicateHeader.stderr, /duplicate key 'name'/);
});

test('query tool honors explicit fixture kind and reports fixture kind errors', () => {
  const explicitJson = runTool([
    '--fixture',
    'fixtures/query-inventory.json',
    '--fixture-kind',
    'json',
    '--query',
    'from $.inventory.items[0] select .sku',
  ]);

  assert.equal(explicitJson.status, 0, explicitJson.stderr);
  assert.equal(explicitJson.stdout.trim(), '$.inventory.items[0].sku = "A-100"');

  const forcedJson = runTool([
    '--fixture',
    'fixtures/query-inventory.aeon',
    '--fixture-kind',
    'json',
    '--query',
    'from $.inventory.items.* select .sku',
  ]);

  assert.equal(forcedJson.status, 2);
  assert.match(forcedJson.stderr, /could not parse JSON fixture/);

  const forcedAeon = runTool([
    '--fixture',
    'fixtures/query-inventory.json',
    '--fixture-kind',
    'aeon',
    '--query',
    'from $.inventory.items.* select .sku',
  ]);

  assert.equal(forcedAeon.status, 2);
  assert.match(forcedAeon.stderr, /could not compile AEON fixture/);

  const unknownKind = runTool([
    '--fixture',
    'fixtures/query-inventory.fixture',
    '--query',
    'from $.inventory.items.* select .sku',
  ]);

  assert.equal(unknownKind.status, 2);
  assert.match(unknownKind.stderr, /could not infer fixture kind/);
});

testAeonRuntime('query tool honors explicit AEON fixture kind', () => {
  const result = runTool([
    '--fixture',
    'fixtures/query-inventory.aeon',
    '--fixture-kind',
    'aeon',
    '--query',
    'from $.inventory.items[0] select .sku',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '$.inventory.items[0].sku = "A-100"');
});

test('query tool mounts JSON params as a local address space', () => {
  const params = JSON.stringify({
    source: {
      type: 'SansaAddressLiteral',
      address: '$.inventory.items[3]',
    },
    field: {
      type: 'SansaAddressLiteral',
      address: '?.sku',
    },
  });
  const result = runTool([
    '--params',
    params,
    '--query',
    'from path($.<"params">.source) select path($.<"params">.field)',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), '$.inventory.items[3].sku = "D-250"');
});

test('query tool mounts JSON params from a file', () => {
  const result = runTool([
    '--params-file',
    'fixtures/query-params-single.json',
    '--query',
    'from path($.<"params">.source) select path($.<"params">.field)',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), '$.inventory.items[0].name = "Adapter"');
});

test('query tool reports malformed JSON params', () => {
  const result = runTool([
    '--params',
    '{',
    '--query',
    'from $.inventory.items.* select .sku',
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /could not read params/);
});

test('query tool rejects conflicting params inputs', () => {
  const result = runTool([
    '--params',
    '{}',
    '--params-file',
    'fixtures/query-params-single.json',
    '--query',
    'from $.inventory.items.* select .sku',
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /use either --params or --params-file/);
});

test('query tool emits compact JSON for parse mode', () => {
  const result = runTool([
    '--mode',
    'parse',
    '--format',
    'json',
    '--query',
    'from $.inventory.items.* select { sku = .sku qty = .qty }',
  ]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'parse');
  assert.equal(payload.query.canonical, 'from $.inventory.items.*\nselect { sku = .sku qty = .qty }');
  assert.deepEqual(payload.query, {
    canonical: 'from $.inventory.items.*\nselect { sku = .sku qty = .qty }',
    clauses: ['from', 'select'],
    from: '$.inventory.items.*',
    select: '{ sku = .sku qty = .qty }',
  });
});

test('query tool reports evaluator diagnostics as JSON', () => {
  const result = runTool([
    '--format',
    'json',
    '--query',
    'from $.inventory.items.* where .sku select .sku',
  ]);

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.errors[0].code, 'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN');
  assert.equal(payload.errors[0].phase, 'where');
  assert.equal(payload.errors[0].candidateAddress, '$.inventory.items[0]');
});

test('query tool emits stable JSON result envelope', () => {
  const result = runTool([
    '--fixture',
    'fixtures/query-inventory.json',
    '--format',
    'json',
    '--query',
    'from $.inventory.items.* where contains(.sku, "B") select .sku',
  ]);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'evaluate');
  assert.equal(payload.count, 1);
  assert.deepEqual(payload.results[0], {
    type: 'queryResult',
    address: '$.inventory.items[1]',
    binding: {
      address: '$.inventory.items[1]',
      index: 1,
      representationKind: 'object',
    },
    value: {
      type: 'bindingSet',
      bindings: [
        {
          address: '$.inventory.items[1].sku',
          name: 'sku',
          semanticType: 'string',
          representationKind: 'string',
          value: 'B-200',
        },
      ],
    },
  });
});
