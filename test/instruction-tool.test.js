import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const toolPath = fileURLToPath(new URL('../scripts/instruction.mjs', import.meta.url));

function runTool(args) {
  return spawnSync(process.execPath, [toolPath, ...args], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  });
}

test('instruction tool help documents core options', () => {
  const result = runTool(['--help']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /sansa-instruction --instruction <source>/);
  assert.match(result.stdout, /--mode <mode>/);
  assert.match(result.stdout, /parse, lower, or plan/);
  assert.match(result.stdout, /Defaults to fixtures\/query-inventory\.json/);
});

test('instruction tool parses instruction source', () => {
  const result = runTool([
    '--mode',
    'parse',
    '--instruction',
    'replace $.inventory.items[1].qty with :int32 10',
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), 'replace $.inventory.items[1].qty with :int32, 10');
});

test('instruction tool lowers query-shaped instructions against the default fixture', () => {
  const result = runTool([
    '--mode',
    'lower',
    '--instruction',
    [
      'from $.inventory.items.*',
      'where .sku == "B-200"',
      'replace .qty with :int32, 10',
    ].join('\n'),
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim(), 'replace $.inventory.items[1].qty = 10 (datatype:int32, kind:number)');
});

test('instruction tool plans lowered instructions against the default fixture', () => {
  const result = runTool([
    '--mode',
    'plan',
    '--instruction',
    [
      'from $.inventory.items.*',
      'where .sku == "B-200"',
      'replace .qty with :int32, 10',
    ].join('\n'),
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /replace \$\.inventory\.items\[1\]\.qty = 10 \(datatype:int32, kind:number\)/);
  assert.match(result.stdout, /plan: 1 operation/);
});

test('instruction tool emits JSON diagnostics', () => {
  const result = runTool([
    '--format',
    'json',
    '--mode',
    'lower',
    '--instruction',
    'from $.inventory.items.*\nreplace .missing with "x"',
  ]);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.mode, 'lower');
  assert.equal(payload.errors[0].code, 'SANSA_INSTRUCTION_TARGET_MISS');
});
