#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const settings = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (!['--cts-root', '--cts', '--specs-root', '--report'].includes(args[i]) || !args[i + 1] || settings.has(args[i])) {
    throw new Error('Expected unique --cts-root, --cts, --specs-root or --report path arguments');
  }
  settings.set(args[i], resolve(args[i + 1]));
}
const ctsRoot = resolve(settings.get('--cts-root') ?? process.env.AEONITE_CTS_ROOT ?? resolve(root, '../../aeonite-org/aeonite-cts/cts'));
const specsRoot = resolve(settings.get('--specs-root') ?? process.env.AEONITE_SPECS_ROOT ?? resolve(root, '../../aeonite-org/aeonite-specs'));
const adapter = 'node scripts/cts-aeonic-arithmetic-adapter.mjs';
const command = [join(dirname(ctsRoot), 'runners/run_aeonic_arithmetic.py'),
  '--manifest', settings.get('--cts') ?? join(ctsRoot, 'aeonic-arithmetic/v1/aeonic-arithmetic-cts.v1.snapshot-0.1.json'),
  '--specs-root', specsRoot, '--cwd', root, '--sut', adapter];
if (settings.has('--report')) command.push('--report', settings.get('--report'));
const result = spawnSync(process.env.PYTHON ?? 'python3', command, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
