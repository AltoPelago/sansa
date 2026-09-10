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
  assert.match(result.stdout, /--target <target>/);
  assert.match(result.stdout, /aeon, json, json-compatible, telex, or telex\.aes/);
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

test('instruction tool renders claimed source provenance in plan summaries', () => {
  const result = runTool([
    '--mode',
    'plan',
    '--instruction',
    [
      'because "manual correction"',
      'by "Bob"',
      'from $.inventory.items.*',
      'where .sku == "B-200"',
      'replace .qty with :int32, 10',
    ].join('\n'),
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /provenance:/);
  assert.match(result.stdout, /because "manual correction"/);
  assert.match(result.stdout, /by "Bob"/);
  assert.match(result.stdout, /replace \$\.inventory\.items\[1\]\.qty = 10 \(datatype:int32, kind:number\)/);
});

test('instruction tool emits claimed source provenance in JSON plan summaries', () => {
  const result = runTool([
    '--format',
    'json',
    '--mode',
    'plan',
    '--instruction',
    [
      'because "manual correction"',
      'by "Bob"',
      'from $.inventory.items.*',
      'where .sku == "B-200"',
      'replace .qty with :int32, 10',
    ].join('\n'),
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.plan.sourceProvenance.reason, 'manual correction');
  assert.equal(payload.plan.sourceProvenance.claimedAuthor, 'Bob');
  assert.equal(payload.plan.operations[0].provenance, undefined);
});

test('instruction tool validates planned instructions against target surfaces', () => {
  const ok = runTool([
    '--mode',
    'plan',
    '--target',
    'aeon',
    '--instruction',
    [
      'from $.inventory.items.*',
      'where .sku == "B-200"',
      'replace .qty with :int32, 10',
    ].join('\n'),
  ]);

  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stderr, '');
  assert.match(ok.stdout, /target: aeon ok/);

  const telex = runTool([
    '--mode',
    'plan',
    '--target',
    'telex',
    '--instruction',
    'replace $.inventory.items[0].sku with "A-101"',
  ]);

  assert.equal(telex.status, 0, telex.stderr);
  assert.equal(telex.stderr, '');
  assert.match(telex.stdout, /target: telex ok/);

  const rejected = runTool([
    '--mode',
    'plan',
    '--target',
    'json',
    '--format',
    'json',
    '--instruction',
    'create $.types.selectorCliProbe with :sansa, $.inventory.items.*',
  ]);

  assert.equal(rejected.status, 1);
  assert.equal(rejected.stderr, '');
  const payload = JSON.parse(rejected.stdout);
  assert.equal(payload.ok, false);
  assert.equal(payload.mode, 'plan');
  assert.equal(payload.phase, 'target');
  assert.equal(payload.target, 'json');
  assert.equal(payload.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');

  const aliasRejected = runTool([
    '--mode',
    'plan',
    '--target',
    'json-compatible',
    '--format',
    'json',
    '--instruction',
    'create $.types.selectorCliAliasProbe with :sansa, $.inventory.items.*',
  ]);

  assert.equal(aliasRejected.status, 1);
  assert.equal(aliasRejected.stderr, '');
  const aliasPayload = JSON.parse(aliasRejected.stdout);
  assert.equal(aliasPayload.ok, false);
  assert.equal(aliasPayload.phase, 'target');
  assert.equal(aliasPayload.target, 'json-compatible');
  assert.equal(aliasPayload.errors[0].targetFormat, 'json');
  assert.equal(aliasPayload.errors[0].code, 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE');

  const rejectedText = runTool([
    '--mode',
    'plan',
    '--target',
    'json',
    '--instruction',
    'create $.types.selectorCliProbeText with :sansa, $.inventory.items.*',
  ]);

  assert.equal(rejectedText.status, 1);
  assert.equal(rejectedText.stdout, '');
  assert.match(rejectedText.stderr, /SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE \[target\] \(operation 0, target json, datatype sansa\):/);
});

test('instruction tool rejects unsupported target surface names before planning', () => {
  const result = runTool([
    '--mode',
    'plan',
    '--target',
    'xml',
    '--instruction',
    'replace $.inventory.items[0].sku with "A-101"',
  ]);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /unsupported --target 'xml'/);
  assert.match(result.stderr, /Expected 'aeon', 'json', 'json-compatible', 'telex', or 'telex\.aes'/);
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
