#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAddress } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ctsRoot = process.env.AEONITE_CTS_ROOT
  ? resolve(process.env.AEONITE_CTS_ROOT)
  : resolve(root, '..', '..', 'aeonite-org', 'aeonite-cts', 'cts');
const manifestPath = readArg('--cts') ?? resolve(ctsRoot, 'sansa', 'v1', 'sansa-resolve-cts.v1.json');

const manifest = readJson(manifestPath);
let pass = 0;
let fail = 0;

console.log('Running SANSA resolve CTS against @altopelago/sansa');

for (const suiteRef of manifest.suites ?? []) {
  const suitePath = resolve(dirname(manifestPath), suiteRef.file);
  const suite = readJson(suitePath);
  const namespaces = buildNamespaces(suite.fixtures?.namespaces ?? []);
  console.log(`\n--- Suite: ${suite.title} ---`);

  for (const test of suite.tests ?? []) {
    const failures = runTest(test, namespaces);
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

function runTest(test, namespaces) {
  const failures = [];
  const expected = test.expected ?? {};
  const source = String(test.input?.source ?? '');
  const fixture = namespaces.get(test.input?.namespace);

  if (!fixture) {
    failures.push(`unknown namespace fixture: ${test.input?.namespace ?? null}`);
    return failures;
  }

  const options = {};
  if (typeof test.input?.contextualRoot === 'string') {
    const contextualRoot = fixture.byAddress.get(test.input.contextualRoot);
    if (!contextualRoot) {
      failures.push(`unknown contextualRoot binding: ${test.input.contextualRoot}`);
      return failures;
    }
    options.contextualRoot = contextualRoot;
  }

  const result = resolveAddress(source, fixture.namespace, options);

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
    if (Number.isInteger(expected.selectorIndex)) {
      const actualSelectorIndex = result.errors?.[0]?.selectorIndex;
      if (actualSelectorIndex !== expected.selectorIndex) {
        failures.push(`selectorIndex mismatch: expected ${expected.selectorIndex}, got ${actualSelectorIndex ?? null}`);
      }
    }
    return failures;
  }

  if (Array.isArray(expected.addresses)) {
    compareArray(expected.addresses, result.bindings.map((binding) => binding.address), 'addresses', failures);
  }

  return failures;
}

function buildNamespaces(entries) {
  const output = new Map();
  for (const entry of entries) {
    const byAddress = new Map();
    indexBindingTree(entry.root, byAddress);
    output.set(entry.id, {
      byAddress,
      namespace: {
        root: entry.root,
        children: (binding) => binding.children ?? [],
        attributeSpace: (binding) => binding.attributeSpace,
        ...(entry.supportsLocalSpaces === true
          ? { localSpace: (binding, name) => binding.localSpaces?.[name] }
          : {}),
      },
    });
  }
  return output;
}

function indexBindingTree(binding, output) {
  output.set(binding.address, binding);
  for (const child of binding.children ?? []) indexBindingTree(child, output);
  if (binding.attributeSpace) indexBindingTree(binding.attributeSpace, output);
  for (const localSpace of Object.values(binding.localSpaces ?? {})) indexBindingTree(localSpace, output);
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
