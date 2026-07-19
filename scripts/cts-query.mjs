#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateQuery, parseQuery, parseQueryExpression } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ctsRoot = process.env.AEONITE_CTS_ROOT
  ? resolve(process.env.AEONITE_CTS_ROOT)
  : resolve(root, '..', '..', 'aeonite-org', 'aeonite-cts', 'cts');
const manifestPath = readArg('--cts') ?? resolve(ctsRoot, 'sansa', 'v1', 'sansa-query-parser-cts.v1.json');

const manifest = readJson(manifestPath);
let pass = 0;
let fail = 0;

console.log('Running SANSA query parser CTS against @altopelago/sansa');

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
  const isExpressionCase = typeof test.input?.expression === 'string';
  const isEvaluateCase = typeof test.input?.namespace === 'string';
  const source = String(isExpressionCase ? test.input.expression : test.input?.source ?? '');
  const fixture = isEvaluateCase ? namespaces.get(test.input.namespace) : null;
  if (isEvaluateCase && !fixture) {
    failures.push(`unknown namespace fixture: ${test.input.namespace}`);
    return failures;
  }
  const result = isEvaluateCase
    ? evaluateQuery(source, fixture.namespace)
    : isExpressionCase
      ? parseQueryExpression(source)
      : parseQuery(source);

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

  if (isExpressionCase) {
    const expression = result.expression;
    if (typeof expected.canonical === 'string' && expression.canonical !== expected.canonical) {
      failures.push(`canonical mismatch: expected ${JSON.stringify(expected.canonical)}, got ${JSON.stringify(expression.canonical)}`);
    }
    if (expected.ast && !matchesSubset(expected.ast, expression)) {
      failures.push(`ast mismatch: expected subset ${JSON.stringify(expected.ast)}, got ${JSON.stringify(expression)}`);
    }
    return failures;
  }

  if (isEvaluateCase) {
    if (Array.isArray(expected.resultAddresses)) {
      compareArray(expected.resultAddresses, result.results.map((entry) => entry.binding.address), 'resultAddresses', failures);
    }
    if (Array.isArray(expected.values)) {
      compareJson(expected.values, result.results.map((entry) => entry.value), 'values', failures);
    }
    if (Array.isArray(expected.selectedAddresses)) {
      compareJson(
        expected.selectedAddresses,
        result.results.map((entry) => entry.value.type === 'bindingSet'
          ? entry.value.bindings.map((binding) => binding.address)
          : null),
        'selectedAddresses',
        failures,
      );
    }
    return failures;
  }

  const query = result.query;
  if (typeof expected.canonical === 'string' && query.canonical !== expected.canonical) {
    failures.push(`canonical mismatch: expected ${JSON.stringify(expected.canonical)}, got ${JSON.stringify(query.canonical)}`);
  }
  if (typeof expected.from === 'string' && query.from.address.canonical !== expected.from) {
    failures.push(`from mismatch: expected ${expected.from}, got ${query.from.address.canonical}`);
  }
  if (typeof expected.where === 'string' && query.where?.expression !== expected.where) {
    failures.push(`where mismatch: expected ${expected.where}, got ${query.where?.expression ?? null}`);
  }
  if (Array.isArray(expected.order)) {
    compareArray(
      expected.order.map((key) => `${key.expression}|${key.direction}`),
      query.orderBy?.keys.map((key) => `${key.expression}|${key.direction}`) ?? [],
      'order',
      failures,
    );
  }
  if (Number.isInteger(expected.offset) && query.offset?.value !== expected.offset) {
    failures.push(`offset mismatch: expected ${expected.offset}, got ${query.offset?.value ?? null}`);
  }
  if (Number.isInteger(expected.limit) && query.limit?.value !== expected.limit) {
    failures.push(`limit mismatch: expected ${expected.limit}, got ${query.limit?.value ?? null}`);
  }
  if (typeof expected.select === 'string' && query.select.expression !== expected.select) {
    failures.push(`select mismatch: expected ${expected.select}, got ${query.select.expression}`);
  }
  if (Array.isArray(expected.clauses)) {
    compareArray(expected.clauses, query.clauses, 'clauses', failures);
  }

  return failures;
}

function buildNamespaces(entries) {
  const output = new Map();
  for (const entry of entries) {
    output.set(entry.id, {
      namespace: {
        root: entry.root,
        children: (binding) => binding.children ?? [],
      },
    });
  }
  return output;
}

function matchesSubset(expected, actual) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return false;
    return expected.every((item, index) => matchesSubset(item, actual[index]));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false;
    return Object.entries(expected).every(([key, value]) => matchesSubset(value, actual[key]));
  }
  return Object.is(expected, actual);
}

function compareJson(expected, actual, label, failures) {
  const expectedJson = JSON.stringify(expected);
  const actualJson = JSON.stringify(actual);
  if (expectedJson !== actualJson) {
    failures.push(`${label} mismatch: expected ${expectedJson}, got ${actualJson}`);
  }
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
