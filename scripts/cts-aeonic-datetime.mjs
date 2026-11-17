#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), settings = new Map();
for (let i = 0; i < args.length; i += 2) {
  if (!['--cts-root', '--cts', '--specs-root', '--report', '--capability-set'].includes(args[i]) || !args[i + 1] || settings.has(args[i])) {
    throw new Error('Expected unique --cts-root, --cts, --specs-root, --report or --capability-set arguments');
  }
  settings.set(args[i], args[i + 1]);
}
const choice = settings.get('--capability-set') ?? 'all';
if (!['all', 'relations', 'arithmetic'].includes(choice)) throw new Error('Invalid capability selection');
const ctsRoot = resolve(settings.get('--cts-root') ?? process.env.AEONITE_CTS_ROOT ?? resolve(root, '../../aeonite-org/aeonite-cts/cts'));
const specsRoot = resolve(settings.get('--specs-root') ?? process.env.AEONITE_DATETIME_SPECS_ROOT ?? process.env.AEONITE_SPECS_ROOT ?? resolve(root, '../../aeonite-org/aeonite-specs'));
const command = [join(dirname(ctsRoot), 'runners/run_aeonic_temporal_civil_datetime.py'),
  '--manifest', settings.has('--cts') ? resolve(settings.get('--cts')) : join(ctsRoot, 'aeonic-temporal-civil-datetime/v1/aeonic-temporal-civil-datetime-cts.v1.snapshot-0.1.json'),
  '--specs-root', specsRoot, '--cwd', root, '--capability-set', choice,
  '--sut', 'node scripts/cts-aeonic-temporal-civil-datetime-adapter.mjs --capability-set ' + choice];
if (settings.has('--report')) command.push('--report', resolve(settings.get('--report')));
const result = spawnSync(process.env.PYTHON ?? 'python3', command, { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
