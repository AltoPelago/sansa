#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lowerInstruction, parseInstruction, planInstruction, validateMutationPlanTarget } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ctsRoot = process.env.AEONITE_CTS_ROOT
  ? resolve(process.env.AEONITE_CTS_ROOT)
  : resolve(root, '..', '..', 'aeonite-org', 'aeonite-cts', 'cts');
const manifestPath = readArg('--cts') ?? resolve(ctsRoot, 'sansa', 'v1', 'sansa-instruction-cts.v1.json');

const manifest = readJson(manifestPath);
let pass = 0;
let fail = 0;

console.log('Running experimental SANSA instruction CTS against @altopelago/sansa');

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
  const mode = test.input?.mode ?? 'parse';
  const source = String(test.input?.source ?? '');
  const fixture = test.input?.namespace === undefined ? null : namespaces.get(test.input.namespace);
  if (test.input?.namespace !== undefined && !fixture) {
    failures.push(`unknown namespace fixture: ${test.input.namespace}`);
    return failures;
  }

  const result = runMode(mode, source, fixture?.namespace, test.input?.options ?? {});

  if (mode === 'target') {
    if (!result.ok) {
      compareError(expected, result, failures);
      return failures;
    }
    const targetResult = validateMutationPlanTarget(result.plan, test.input?.target ?? 'aeon');
    if (targetResult.ok !== Boolean(expected.ok)) {
      failures.push(`target ok mismatch: expected ${Boolean(expected.ok)}, got ${targetResult.ok}`);
    }
    if (!targetResult.ok) compareError(expected, targetResult, failures);
    if (targetResult.ok) {
      compareArray(expected.targetDiagnostics, (targetResult.diagnostics ?? []).map((diagnostic) => diagnostic.code), 'targetDiagnostics', failures);
    }
    return failures;
  }

  if (result.ok !== Boolean(expected.ok)) {
    failures.push(`ok mismatch: expected ${Boolean(expected.ok)}, got ${result.ok}`);
  }

  if (!result.ok) {
    compareError(expected, result, failures);
    return failures;
  }

  if (mode === 'parse') {
    compareField(expected.canonical, result.instruction.canonical, 'canonical', failures);
    compareArray(expected.clauses, result.instruction.clauses, 'clauses', failures);
    compareField(expected.provenanceReason, result.instruction.provenance?.reason, 'provenanceReason', failures);
    compareField(expected.provenanceClaimedAuthor, result.instruction.provenance?.claimedAuthor, 'provenanceClaimedAuthor', failures);
    return failures;
  }

  if (mode === 'lower') {
    compareLoweredOperations(expected.operations ?? [], result.request, failures);
    compareLoweredPreconditions(expected.preconditions, result.request, failures);
    return failures;
  }

  if (mode === 'plan') {
    comparePlannedOperations(expected.operations ?? [], result.plan.operations, failures);
    compareArray(expected.preconditions, result.plan.preconditions.map((precondition) => precondition.canonical), 'preconditions', failures);
    compareField(expected.sourceProvenanceType, result.plan.sourceProvenance?.type, 'sourceProvenanceType', failures);
    compareField(expected.sourceProvenanceReason, result.plan.sourceProvenance?.reason, 'sourceProvenanceReason', failures);
    compareField(expected.sourceProvenanceClaimedAuthor, result.plan.sourceProvenance?.claimedAuthor, 'sourceProvenanceClaimedAuthor', failures);
    return failures;
  }

  failures.push(`unsupported mode: ${mode}`);
  return failures;
}

function runMode(mode, source, namespace, options) {
  if (mode === 'parse') return parseInstruction(source, options.parse ?? options);
  if (mode === 'lower') return lowerInstruction(source, namespace, options);
  if (mode === 'plan' || mode === 'target') return planInstruction(source, namespace, options);
  return {
    ok: false,
    errors: [{ code: 'CTS_UNSUPPORTED_MODE', message: `Unsupported instruction CTS mode '${mode}'` }],
  };
}

function compareError(expected, result, failures) {
  if (typeof expected.error === 'string') {
    const actualCode = result.errors?.[0]?.code ?? null;
    if (actualCode !== expected.error) {
      failures.push(`error mismatch: expected ${expected.error}, got ${actualCode}`);
    }
  }
  if (typeof expected.errorPhase === 'string') {
    const actualPhase = result.phase ?? result.errors?.[0]?.phase ?? null;
    if (actualPhase !== expected.errorPhase) {
      failures.push(`errorPhase mismatch: expected ${expected.errorPhase}, got ${actualPhase}`);
    }
  }
  if (typeof expected.errorTargetFormat === 'string') {
    const actualTargetFormat = result.errors?.[0]?.targetFormat ?? null;
    if (actualTargetFormat !== expected.errorTargetFormat) {
      failures.push(`errorTargetFormat mismatch: expected ${expected.errorTargetFormat}, got ${actualTargetFormat}`);
    }
  }
  if (typeof expected.errorDatatype === 'string') {
    const actualDatatype = result.errors?.[0]?.datatype ?? null;
    if (actualDatatype !== expected.errorDatatype) {
      failures.push(`errorDatatype mismatch: expected ${expected.errorDatatype}, got ${actualDatatype}`);
    }
  }
  if (typeof expected.errorValuePath === 'string') {
    const actualValuePath = result.errors?.[0]?.valuePath ?? null;
    if (actualValuePath !== expected.errorValuePath) {
      failures.push(`errorValuePath mismatch: expected ${expected.errorValuePath}, got ${actualValuePath}`);
    }
  }
}

function compareLoweredOperations(expected, actual, failures) {
  const operations = Array.isArray(actual)
    ? actual
    : Array.isArray(actual?.operations)
      ? actual.operations
      : [actual];
  if (expected.length !== operations.length) {
    failures.push(`operations length mismatch: expected ${expected.length}, got ${operations.length}`);
    return;
  }
  for (let index = 0; index < expected.length; index += 1) {
    const current = operations[index] ?? {};
    compareField(expected[index].op, current.op, `operations[${index}].op`, failures);
    compareField(expected[index].target, current.target ?? current.parent ?? current.container ?? current.source, `operations[${index}].target`, failures);
    compareField(expected[index].parent, current.parent, `operations[${index}].parent`, failures);
    compareField(expected[index].container, current.container, `operations[${index}].container`, failures);
    compareField(expected[index].source, current.source, `operations[${index}].source`, failures);
    compareField(expected[index].name, current.name, `operations[${index}].name`, failures);
    compareField(expected[index].datatype, current.datatype, `operations[${index}].datatype`, failures);
    compareField(expected[index].kind, current.kind, `operations[${index}].kind`, failures);
    comparePlacement(expected[index].placement, current.placement, `operations[${index}].placement`, failures);
    if (Object.hasOwn(expected[index], 'value')) compareJsonLike(expected[index].value, current.value, `operations[${index}].value`, failures);
  }
}

function compareLoweredPreconditions(expected, actual, failures) {
  if (expected === undefined) return;
  const preconditions = Array.isArray(actual?.preconditions) ? actual.preconditions : [];
  compareJsonLike(expected, preconditions, 'preconditions', failures);
}

function comparePlannedOperations(expected, actual, failures) {
  if (expected.length !== actual.length) {
    failures.push(`operations length mismatch: expected ${expected.length}, got ${actual.length}`);
    return;
  }
  for (let index = 0; index < expected.length; index += 1) {
    const current = actual[index] ?? {};
    compareField(expected[index].op, current.op, `operations[${index}].op`, failures);
    const actualTarget = current.target?.canonicalAddress
      ?? current.source?.canonicalAddress
      ?? current.parent?.canonicalAddress
      ?? current.container?.canonicalAddress;
    compareField(expected[index].target, actualTarget, `operations[${index}].target`, failures);
    compareField(expected[index].parent, current.parent?.canonicalAddress, `operations[${index}].parent`, failures);
    compareField(expected[index].container, current.container?.canonicalAddress, `operations[${index}].container`, failures);
    compareField(expected[index].source, current.source?.canonicalAddress, `operations[${index}].source`, failures);
    compareField(expected[index].name, current.name, `operations[${index}].name`, failures);
    compareField(expected[index].datatype, current.datatype, `operations[${index}].datatype`, failures);
    compareField(expected[index].kind, current.kind, `operations[${index}].kind`, failures);
    const actualPlacement = current.placement === undefined
      ? undefined
      : {
          kind: current.placement.kind,
          ...(current.placement.anchor?.canonicalAddress === undefined ? {} : { anchor: current.placement.anchor.canonicalAddress }),
        };
    comparePlacement(expected[index].placement, actualPlacement, `operations[${index}].placement`, failures);
    if (Object.hasOwn(expected[index], 'value')) compareJsonLike(expected[index].value, current.value, `operations[${index}].value`, failures);
  }
}

function comparePlacement(expected, actual, label, failures) {
  if (expected === undefined) return;
  compareJsonLike(expected, actual, label, failures);
}

function compareJsonLike(expected, actual, label, failures) {
  const expectedJson = JSON.stringify(expected);
  const actualJson = JSON.stringify(actual);
  if (expectedJson !== actualJson) {
    failures.push(`${label} mismatch: expected ${expectedJson}, got ${actualJson}`);
  }
}

function compareField(expected, actual, label, failures) {
  if (expected === undefined) return;
  if (!Object.is(expected, actual)) {
    failures.push(`${label} mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function compareArray(expected, actual, label, failures) {
  if (expected === undefined) return;
  if (expected.length !== actual.length) {
    failures.push(`${label} length mismatch: expected ${expected.length}, got ${actual.length}`);
    return;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (!Object.is(expected[index], actual[index])) {
      failures.push(`${label}[${index}] mismatch: expected ${JSON.stringify(expected[index])}, got ${JSON.stringify(actual[index])}`);
    }
  }
}

function buildNamespaces(entries) {
  const output = new Map();
  for (const entry of entries) {
    const rootBinding = structuredClone(entry.root);
    indexBindingTree(rootBinding);
    output.set(entry.id, {
      namespace: {
        root: rootBinding,
        children: (binding) => binding.children ?? [],
        parent: (binding) => binding.parent,
        bindingHandle: (binding) => binding.id ?? binding.address,
        observedState: (binding) => binding.revision,
      },
    });
  }
  return output;
}

function indexBindingTree(binding, parent = null) {
  binding.parent = parent;
  for (const child of binding.children ?? []) indexBindingTree(child, binding);
  if (binding.attributeSpace) indexBindingTree(binding.attributeSpace, binding);
  for (const localSpace of Object.values(binding.localSpaces ?? {})) indexBindingTree(localSpace, binding);
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] ? resolve(process.argv[index + 1]) : null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
