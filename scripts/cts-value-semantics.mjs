#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateValueSemanticsOperation } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ctsRoot = process.env.AEONITE_CTS_ROOT
  ? resolve(process.env.AEONITE_CTS_ROOT)
  : resolve(root, '..', '..', 'aeonite-org', 'aeonite-cts', 'cts');
const manifestPath = readArg('--cts') ?? resolve(ctsRoot, 'value-semantics', 'v1', 'value-semantics-cts.v1.json');

const manifest = readJson(manifestPath);
let pass = 0;
let fail = 0;

console.log('Running Shared AEON Value Semantics CTS against @altopelago/sansa');

for (const suiteRef of manifest.suites ?? []) {
  const suitePath = resolve(dirname(manifestPath), suiteRef.file);
  const suite = readJson(suitePath);
  console.log(`\n--- Suite: ${suite.title} ---`);

  for (const test of suite.tests ?? []) {
    const failures = runTest(test);
    if (failures.length > 0) {
      fail += 1;
      console.log(`FAIL ${test.id}`);
      for (const failure of failures) console.log(`   - ${failure}`);
    } else {
      pass += 1;
      console.log(`PASS ${test.id}`);
    }
  }
}

console.log(`\nSummary: pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);

function runTest(test) {
  const failures = [];
  const result = evaluateValueSemanticsOperation(test.operation, test.input ?? {});
  const expected = test.expected ?? {};

  if (result.outcome !== expected.outcome) {
    failures.push(`outcome mismatch: expected ${expected.outcome}, got ${result.outcome}`);
    return failures;
  }

  if (expected.outcome === 'diagnostic') {
    if (result.ok !== false) {
      failures.push(`ok mismatch: expected false diagnostic, got ${result.ok}`);
      return failures;
    }
    if (typeof expected.reason === 'string' && result.reason !== expected.reason) {
      failures.push(`reason mismatch: expected ${expected.reason}, got ${result.reason}`);
    }
    return failures;
  }

  if (result.ok !== true) {
    failures.push(`ok mismatch: expected true value, got ${result.ok}`);
    return failures;
  }
  if (Object.hasOwn(expected, 'value') && result.value !== expected.value) {
    failures.push(`value mismatch: expected ${expected.value}, got ${result.value}`);
  }
  if (typeof expected.relation === 'string' && result.relation !== expected.relation) {
    failures.push(`relation mismatch: expected ${expected.relation}, got ${result.relation}`);
  }
  return failures;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] ? resolve(process.argv[index + 1]) : null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
