import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('civil-anchor driver binds frozen target, roots, cwd and complete anchoring provider', () => {
  const folder = mkdtempSync(join(tmpdir(), 'sansa clock driver '));
  try {
    mkdirSync(join(folder, 'runners')); mkdirSync(join(folder, 'cts'));
    writeFileSync(join(folder, 'runners/run_aeonic_temporal_civil_anchor.py'), 'import json,sys\nprint(json.dumps(sys.argv[1:]))\n');
    const run = args => spawnSync(process.execPath, [resolve('scripts/cts-aeonic-anchor.mjs'), ...args], {
      cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, PYTHON: 'python3', AEONITE_CTS_ROOT: join(folder, 'cts'), AEONITE_SPECS_ROOT: 'legacy', AEONITE_ANCHOR_SPECS_ROOT: folder },
    });
    const plain = run([]); assert.equal(plain.status, 0, plain.stderr);
    const argv = JSON.parse(plain.stdout), field = (args, name) => args[args.indexOf(name) + 1];
    assert.equal(field(argv, '--manifest'), join(folder, 'cts/aeonic-temporal-civil-anchor/v1/aeonic-temporal-civil-anchor-cts.v1.snapshot-0.1.json'));
    assert.equal(field(argv, '--specs-root'), folder); assert.equal(field(argv, '--cwd'), resolve('.'));
    const custom = run(['--cts', join(folder, 'explicit.json'), '--specs-root', folder, '--report', join(folder, 'report.json')]);
    assert.equal(custom.status, 0, custom.stderr); const selected = JSON.parse(custom.stdout);
    assert.equal(field(selected, '--sut'), 'node scripts/cts-aeonic-temporal-civil-anchor-adapter.mjs');
    assert.equal(field(selected, '--manifest'), join(folder, 'explicit.json'));
    for (const args of [['--capability-set', 'empty'], ['--cts', 'one', '--cts', 'two'], ['--report'], ['--unknown', 'x']]) assert.notEqual(run(args).status, 0);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('civil-anchor adapter rejects malformed trusted limits without fabricating values', () => {
  const fixture = { request: { operation: 'anchor', input: { anchor: { temporal: { category: 'civilDate', value: '2024-02-28' } }, clock: { temporal: { category: 'civilClock', value: '09:30:00' } }, context: { profile: 'aeonic.operations.temporal.civil-anchor.v1' } } } };
  const run = limits => spawnSync(process.execPath, ['scripts/cts-aeonic-temporal-civil-anchor-adapter.mjs'], { encoding: 'utf8', timeout: 10000,
    input: JSON.stringify({ lane: 'aeonic-temporal-civil-anchor', case_id: 'binding', fixture, policy: { resourceLimits: limits } }) });
  assert.equal(run({}).status, 0);
  assert.equal(JSON.parse(run({}).stdout).result.value.temporal.pieces[0].at, '2024-02-28T09:30:00');
  for (const limits of [null, [], { maxRequestBytes: null }, { unknown: 1 }]) {
    const result = run(limits); assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.match(result.stderr, /harness failure/);
  }
});
