import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('civil-datetime driver binds frozen target, roots, cwd and matching complete provider selection', () => {
  const folder = mkdtempSync(join(tmpdir(), 'sansa datetime driver '));
  try {
    mkdirSync(join(folder, 'runners')); mkdirSync(join(folder, 'cts'));
    writeFileSync(join(folder, 'runners/run_aeonic_temporal_civil_datetime.py'), 'import json,sys\nprint(json.dumps(sys.argv[1:]))\n');
    const run = args => spawnSync(process.execPath, [resolve('scripts/cts-aeonic-datetime.mjs'), ...args], {
      cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, PYTHON: 'python3', AEONITE_CTS_ROOT: join(folder, 'cts'), AEONITE_SPECS_ROOT: 'legacy', AEONITE_DATETIME_SPECS_ROOT: folder },
    });
    const plain = run([]); assert.equal(plain.status, 0, plain.stderr);
    const argv = JSON.parse(plain.stdout), field = (args, name) => args[args.indexOf(name) + 1];
    assert.equal(field(argv, '--manifest'), join(folder, 'cts/aeonic-temporal-civil-datetime/v1/aeonic-temporal-civil-datetime-cts.v1.snapshot-0.1.json'));
    assert.equal(field(argv, '--specs-root'), folder); assert.equal(field(argv, '--cwd'), resolve('.'));
    const custom = run(['--capability-set', 'relations', '--cts', join(folder, 'explicit.json'), '--specs-root', folder, '--report', join(folder, 'report.json')]);
    assert.equal(custom.status, 0, custom.stderr); const selected = JSON.parse(custom.stdout);
    assert.equal(field(selected, '--capability-set'), 'relations');
    assert.match(field(selected, '--sut'), /--capability-set relations$/);
    assert.equal(field(selected, '--manifest'), join(folder, 'explicit.json'));
    for (const args of [['--capability-set', 'empty'], ['--cts', 'one', '--cts', 'two'], ['--report'], ['--unknown', 'x']]) assert.notEqual(run(args).status, 0);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('civil-datetime adapter rejects malformed trusted limits without fabricating values', () => {
  const fixture = { request: { operation: 'equal', input: {
    left: { temporal: { category: 'civilDateTime', value: '2024-03T09:30' } }, right: { temporal: { category: 'civilDateTime', value: '2024-03T09:30' } },
    context: { profile: 'aeonic.operations.temporal.civil-datetime.v1' },
  } } };
  const run = limits => spawnSync(process.execPath, ['scripts/cts-aeonic-temporal-civil-datetime-adapter.mjs'], { encoding: 'utf8', timeout: 10000,
    input: JSON.stringify({ lane: 'aeonic-temporal-civil-datetime', case_id: 'binding', fixture, policy: { resourceLimits: limits } }) });
  assert.equal(run({}).status, 0);
  assert.equal(JSON.parse(run({}).stdout).result.value.value, 'equal');
  for (const limits of [null, [], { maxRequestBytes: null }, { unknown: 1 }]) {
    const result = run(limits); assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.match(result.stderr, /harness failure/);
  }
});
