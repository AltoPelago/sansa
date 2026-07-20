import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const toolPath = fileURLToPath(new URL('../scripts/query.mjs', import.meta.url));

function runTool(args) {
  return spawnSync(process.execPath, [toolPath, ...args], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
}

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
