import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('arithmetic driver selects one configured CTS root and preserves explicit overrides', () => {
  const folder = mkdtempSync(join(tmpdir(), 'sansa arithmetic '));
  try {
    mkdirSync(join(folder, 'runners'));
    mkdirSync(join(folder, 'cts'));
    writeFileSync(join(folder, 'runners/run_aeonic_arithmetic.py'), 'import json,sys\nprint(json.dumps(sys.argv[1:]))\n');
    const run = args => spawnSync(process.execPath, ['scripts/cts-aeonic-arithmetic.mjs', ...args], {
      encoding: 'utf8', env: { ...process.env, AEONITE_CTS_ROOT: join(folder, 'cts'), AEONITE_SPECS_ROOT: folder, PYTHON: 'python3' },
    });
    const implicit = run([]);
    assert.equal(implicit.status, 0, implicit.stderr);
    const argv = JSON.parse(implicit.stdout);
    assert.equal(argv[argv.indexOf('--manifest') + 1], join(folder, 'cts/aeonic-arithmetic/v1/aeonic-arithmetic-cts.v1.snapshot-0.1.json'));
    assert.equal(argv[argv.indexOf('--specs-root') + 1], folder);
    const explicit = run(['--cts', join(folder, 'explicit.json'), '--report', join(folder, 'report.json')]);
    assert.equal(explicit.status, 0, explicit.stderr);
    const selected = JSON.parse(explicit.stdout);
    assert.equal(selected[selected.indexOf('--manifest') + 1], join(folder, 'explicit.json'));
    assert.equal(selected[selected.indexOf('--report') + 1], join(folder, 'report.json'));
    assert.notEqual(run(['--cts', 'one', '--cts', 'two']).status, 0);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
