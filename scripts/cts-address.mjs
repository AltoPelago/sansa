#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAddress } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ctsRoot = process.env.AEONITE_CTS_ROOT
  ? resolve(process.env.AEONITE_CTS_ROOT)
  : resolve(root, '..', '..', 'aeonite-org', 'aeonite-cts', 'cts');
const manifestPath = readArg('--cts') ?? resolve(ctsRoot, 'sansa', 'v1', 'sansa-address-parser-cts.v1.json');

const manifest = readJson(manifestPath);
let pass = 0;
let fail = 0;

console.log(`Running SANSA parser CTS against @altopelago/sansa`);

for (const suiteRef of manifest.suites ?? []) {
  const suitePath = resolve(dirname(manifestPath), suiteRef.file);
  const suite = readJson(suitePath);
  console.log(`\n--- Suite: ${suite.title} ---`);

  for (const test of suite.tests ?? []) {
    const failures = runTest(test);
    if (failures.length > 0) {
      fail += 1;
      console.log(`❌ ${test.id}: FAIL`);
      for (const failure of failures) console.log(`   - ${failure}`);
    } else {
      pass += 1;
      console.log(`✅ ${test.id}: PASS`);
    }
  }
}

console.log(`\nSummary: pass=${pass} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);

function runTest(test) {
  const failures = [];
  const expected = test.expected ?? {};
  const source = String(test.input?.source ?? '');
  const result = parseAddress(source);

  if (result.ok !== Boolean(expected.ok)) {
    failures.push(`ok mismatch: expected ${Boolean(expected.ok)}, got ${result.ok}`);
  }

  if (!result.ok) {
    const expectedCode = expected.error;
    if (typeof expectedCode === 'string') {
      const actualCode = result.errors?.[0]?.code ?? null;
      if (actualCode !== expectedCode) {
        failures.push(`error mismatch: expected ${expectedCode}, got ${actualCode}`);
      }
    }
    return failures;
  }

  const address = result.address;
  if (typeof expected.canonical === 'string' && address.canonical !== expected.canonical) {
    failures.push(`canonical mismatch: expected ${JSON.stringify(expected.canonical)}, got ${JSON.stringify(address.canonical)}`);
  }
  if (typeof expected.exact === 'boolean' && address.isExact !== expected.exact) {
    failures.push(`exact mismatch: expected ${expected.exact}, got ${address.isExact}`);
  }
  if (typeof expected.root === 'string' && address.root?.kind !== expected.root) {
    failures.push(`root mismatch: expected ${expected.root}, got ${address.root?.kind ?? null}`);
  }
  if (Array.isArray(expected.selectors)) {
    compareArray(expected.selectors, address.selectors.map((selector) => selector.type), 'selectors', failures);
  }
  if (Array.isArray(expected.qualifier_terms)) {
    compareArray(
      expected.qualifier_terms,
      address.qualifierExpression?.terms.map((term) => term.name) ?? [],
      'qualifier_terms',
      failures,
    );
  }

  return failures;
}

function compareArray(expected, actual, label, failures) {
  if (expected.length !== actual.length) {
    failures.push(`${label} length mismatch: expected ${expected.length}, got ${actual.length}`);
    return;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (expected[i] !== actual[i]) {
      failures.push(`${label}[${i}] mismatch: expected ${expected[i]}, got ${actual[i]}`);
    }
  }
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] ? resolve(process.argv[index + 1]) : null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
