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
});
