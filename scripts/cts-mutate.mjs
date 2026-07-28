#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMutationPlan, planMutation, validateMutationPlanTarget } from '../src/index.js';
import { enforceMutationPolicyForWorkbench } from '../tools/mutate-web/runtime.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ctsRoot = process.env.AEONITE_CTS_ROOT
  ? resolve(process.env.AEONITE_CTS_ROOT)
  : resolve(root, '..', '..', 'aeonite-org', 'aeonite-cts', 'cts');
const manifestPath = readArg('--cts') ?? resolve(ctsRoot, 'sansa', 'v1', 'sansa-mutate-cts.v1.json');

const manifest = readJson(manifestPath);
let pass = 0;
let fail = 0;

console.log('Running experimental SANSA mutate CTS against @altopelago/sansa');

for (const suiteRef of manifest.suites ?? []) {
  const suitePath = resolve(dirname(manifestPath), suiteRef.file);
  const suite = readJson(suitePath);
  console.log(`\n--- Suite: ${suite.title} ---`);

  for (const test of suite.tests ?? []) {
    const namespaces = buildNamespaces(suite.fixtures?.namespaces ?? []);
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
  const fixture = namespaces.get(test.input?.namespace);
  if (!fixture) {
    failures.push(`unknown namespace fixture: ${test.input?.namespace ?? null}`);
    return failures;
  }

  const operations = Array.isArray(test.input?.operations)
    ? test.input.operations
    : [test.input?.operation];
  const request = Array.isArray(test.input?.preconditions)
    ? {
        operations,
        preconditions: test.input.preconditions,
        ...(test.input.provenance === undefined ? {} : { provenance: test.input.provenance }),
      }
    : operations.length === 1
      ? operations[0]
      : operations;
  const planOptions = test.input?.planOptions ?? test.input?.options ?? {};
  const applyOptions = test.input?.applyOptions ?? test.input?.options ?? {};
  const planResult = planMutation(request, fixture.namespace, planOptions);
  const mode = test.input?.mode ?? 'plan';
  const target = test.input?.target;
  const result = target && planResult.ok
    ? validateMutationPlanTarget(planResult.plan, target)
    : mode === 'policy' && planResult.ok
      ? enforceMutationPolicyForWorkbench(planResult.plan, fixture.namespace, JSON.stringify(test.input?.policy ?? {}))
    : mode === 'apply' && planResult.ok
      ? applyPlannedMutation(test, planResult.plan, fixture, applyOptions)
      : planResult;

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
    if (Number.isInteger(expected.operationIndex)) {
      const actualIndex = result.errors?.[0]?.operationIndex;
      if (actualIndex !== expected.operationIndex) {
        failures.push(`operationIndex mismatch: expected ${expected.operationIndex}, got ${actualIndex ?? null}`);
      }
    }
    if (Number.isInteger(expected.ruleIndex)) {
      const actualIndex = result.errors?.[0]?.ruleIndex;
      if (actualIndex !== expected.ruleIndex) {
        failures.push(`ruleIndex mismatch: expected ${expected.ruleIndex}, got ${actualIndex ?? null}`);
      }
    }
    if (typeof expected.errorPhase === 'string') {
      const actualPhase = result.errors?.[0]?.phase ?? null;
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
    if (typeof expected.errorBudget === 'string') {
      const actualBudget = result.errors?.[0]?.budget ?? null;
      if (actualBudget !== expected.errorBudget) {
        failures.push(`errorBudget mismatch: expected ${expected.errorBudget}, got ${actualBudget}`);
      }
    }
    if (Number.isSafeInteger(expected.errorLimit)) {
      const actualLimit = result.errors?.[0]?.limit ?? null;
      if (actualLimit !== expected.errorLimit) {
        failures.push(`errorLimit mismatch: expected ${expected.errorLimit}, got ${actualLimit}`);
      }
    }
    if (Number.isSafeInteger(expected.errorObserved)) {
      const actualObserved = result.errors?.[0]?.observed ?? null;
      if (actualObserved !== expected.errorObserved) {
        failures.push(`errorObserved mismatch: expected ${expected.errorObserved}, got ${actualObserved}`);
      }
    }
    compareApplyResultExpectations(expected, result, failures);
    compareValuesByAddress(expected.valuesByAddress ?? {}, fixture.byAddress, failures);
    compareChildrenByAddress(expected.childrenByAddress ?? {}, fixture.byAddress, 'name', failures);
    compareChildrenByAddress(expected.childrenValuesByAddress ?? {}, fixture.byAddress, 'value', failures);
    return failures;
  }

  if (target) {
    if (Array.isArray(expected.targetDiagnostics)) {
      compareArray(
        expected.targetDiagnostics,
        (result.diagnostics ?? []).map((diagnostic) => diagnostic.code),
        'targetDiagnostics',
        failures,
      );
    }
    return failures;
  }

  if (mode === 'plan') {
    comparePlannedOperations(expected.operations ?? [], result.plan.operations, failures);
    if (Object.hasOwn(expected, 'sourceProvenance')) {
      compareJsonLike(expected.sourceProvenance, result.plan.sourceProvenance, 'sourceProvenance', failures);
    }
    if (Array.isArray(expected.portabilityWarnings)) {
      compareArray(
        expected.portabilityWarnings,
        (result.plan.portabilityWarnings ?? []).map((warning) => warning.code),
        'portabilityWarnings',
        failures,
      );
    }
    if (Array.isArray(expected.preconditions)) {
      compareArray(
        expected.preconditions,
        result.plan.preconditions.map((entry) => entry.canonical),
        'preconditions',
        failures,
      );
    }
    return failures;
  }

  compareApplyResultExpectations(expected, result, failures);
  compareValuesByAddress(expected.valuesByAddress ?? {}, fixture.byAddress, failures);
  compareChildrenByAddress(expected.childrenByAddress ?? {}, fixture.byAddress, 'name', failures);
  compareChildrenByAddress(expected.childrenValuesByAddress ?? {}, fixture.byAddress, 'value', failures);
  return failures;
}

function applyPlannedMutation(test, plan, fixture, options) {
  applyDrift(test.input?.driftBeforeApply, fixture);
  fixture.control.hookFailureBeforeApply = test.input?.hookFailureBeforeApply ?? null;
  try {
    return applyMutationPlan(plan, fixture.namespace, options);
  } finally {
    fixture.control.hookFailureBeforeApply = null;
  }
}

function compareApplyResultExpectations(expected, result, failures) {
  if (Array.isArray(expected.operationStatuses)) {
    compareArray(
      expected.operationStatuses,
      (result.operationResults ?? []).map((entry) => entry.status),
      'operationStatuses',
      failures,
    );
  }
  if (Array.isArray(expected.operationReports)) {
    compareOperationReports(expected.operationReports, result.operationResults ?? [], failures);
  }
}

function comparePlannedOperations(expected, actual, failures) {
  if (expected.length !== actual.length) {
    failures.push(`operations length mismatch: expected ${expected.length}, got ${actual.length}`);
    return;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index].op !== actual[index].op) {
      failures.push(`operations[${index}].op mismatch: expected ${expected[index].op}, got ${actual[index].op}`);
    }
    if (typeof expected[index].target === 'string') {
      const actualTarget = actual[index].target?.canonicalAddress
        ?? actual[index].source?.canonicalAddress
        ?? actual[index].parent?.canonicalAddress
        ?? actual[index].container?.canonicalAddress;
      if (expected[index].target !== actualTarget) {
        failures.push(`operations[${index}].target mismatch: expected ${expected[index].target}, got ${actualTarget ?? null}`);
      }
    }
    if (Object.hasOwn(expected[index], 'datatype') && expected[index].datatype !== actual[index].datatype) {
      failures.push(`operations[${index}].datatype mismatch: expected ${expected[index].datatype}, got ${actual[index].datatype ?? null}`);
    }
    if (Object.hasOwn(expected[index], 'kind') && expected[index].kind !== actual[index].kind) {
      failures.push(`operations[${index}].kind mismatch: expected ${expected[index].kind}, got ${actual[index].kind ?? null}`);
    }
    if (Object.hasOwn(expected[index], 'provenance')) {
      compareJsonLike(expected[index].provenance, actual[index].provenance, `operations[${index}].provenance`, failures);
    }
  }
}

function compareValuesByAddress(expected, byAddress, failures) {
  for (const [address, value] of Object.entries(expected)) {
    const binding = byAddress.get(address);
    if (!binding) {
      failures.push(`valuesByAddress missing binding: ${address}`);
      continue;
    }
    if (!Object.is(binding.value, value)) {
      failures.push(`valuesByAddress[${address}] mismatch: expected ${JSON.stringify(value)}, got ${JSON.stringify(binding.value)}`);
    }
  }
}

function compareChildrenByAddress(expected, byAddress, field, failures) {
  for (const [address, values] of Object.entries(expected)) {
    const binding = byAddress.get(address);
    if (!binding) {
      failures.push(`childrenByAddress missing binding: ${address}`);
      continue;
    }
    compareArray(values, (binding.children ?? []).map((child) => child[field]), `${field} children at ${address}`, failures);
  }
}

function compareOperationReports(expected, actual, failures) {
  if (expected.length !== actual.length) {
    failures.push(`operationReports length mismatch: expected ${expected.length}, got ${actual.length}`);
    return;
  }
  for (let index = 0; index < expected.length; index += 1) {
    for (const [field, expectedValue] of Object.entries(expected[index])) {
      const actualValue = actual[index]?.[field];
      if (!Object.is(expectedValue, actualValue)) {
        failures.push(`operationReports[${index}].${field} mismatch: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
      }
    }
  }
}

function compareJsonLike(expected, actual, label, failures) {
  const expectedJson = JSON.stringify(expected);
  const actualJson = JSON.stringify(actual);
  if (expectedJson !== actualJson) {
    failures.push(`${label} mismatch: expected ${expectedJson}, got ${actualJson}`);
  }
}

function buildNamespaces(entries) {
  const output = new Map();
  for (const entry of entries) {
    const rootBinding = structuredClone(entry.root);
    const byAddress = new Map();
    indexBindingTree(rootBinding, byAddress);
    const control = { hookFailureBeforeApply: null };
    output.set(entry.id, {
      byAddress,
      control,
      namespace: {
        root: rootBinding,
        children: (binding) => binding.children ?? [],
        parent: (binding) => binding.parent,
        bindingHandle: (binding) => binding.id ?? binding.address,
        observedState: (binding) => binding.revision,
        ...(entry.supportsMutation === true
          ? { mutate: mutationAdapter(entry, byAddress, control) }
          : {}),
      },
    });
  }
  return output;
}

function mutationAdapter(entry, byAddress, control) {
  return {
    ...(entry.supportsCreate === undefined ? {} : { supportsCreate: entry.supportsCreate }),
    ...(entry.supportsReplace === undefined ? {} : { supportsReplace: entry.supportsReplace }),
    ...(entry.supportsRemove === undefined ? {} : { supportsRemove: entry.supportsRemove }),
    ...(entry.supportsOrderedInsert === undefined ? {} : { supportsOrderedInsert: entry.supportsOrderedInsert }),
    ...(entry.supportsMove === undefined ? {} : { supportsMove: entry.supportsMove }),
    ...(entry.supportsStableBindingIdentity === undefined ? {} : { supportsStableBindingIdentity: entry.supportsStableBindingIdentity }),
    supportsAtomicApply: entry.supportsAtomicApply === true,
    sameBinding: (left, right) => left === right,
    create(parent, name, value) {
      const childAddress = `${parent.address}.${name}`;
      const child = {
        id: childAddress,
        name,
        address: childAddress,
        representationKind: typeof value,
        value,
        parent,
        children: [],
      };
      parent.children = [...(parent.children ?? []), child];
      byAddress.set(child.address, child);
      return { binding: child, resultingAddress: child.address };
    },
    replace(target, value) {
      const failure = hookFailure(control, 'replace', target.address);
      if (failure) return failure;
      target.value = value;
      target.revision = (target.revision ?? 0) + 1;
      return { binding: target, resultingAddress: target.address };
    },
    remove(target) {
      target.parent.children = target.parent.children.filter((child) => child !== target);
      byAddress.delete(target.address);
      return { binding: target };
    },
    insert(container, placement, value) {
      const child = {
        id: `${container.address}:inserted:${String(value)}`,
        address: `${container.address}[inserted]`,
        representationKind: typeof value,
        value,
        parent: container,
        children: [],
      };
      const index = placementIndex(container, placement);
      container.children = [...(container.children ?? [])];
      container.children.splice(index, 0, child);
      byAddress.set(child.address, child);
      return { binding: child, resultingAddress: child.address };
    },
    move(source, container, placement) {
      container.children = (container.children ?? []).filter((child) => child !== source);
      const index = placementIndex(container, placement);
      container.children.splice(index, 0, source);
      return { binding: source, resultingAddress: source.address };
    },
  };
}

function hookFailure(control, op, address) {
  const failure = control.hookFailureBeforeApply;
  if (!failure || failure.op !== op || failure.address !== address) return null;
  if (failure.throw === true) {
    throw new Error(failure.message ?? `CTS hook failure for ${op} at ${address}`);
  }
  return { ok: false, message: failure.message ?? `CTS hook failure for ${op} at ${address}` };
}

function placementIndex(container, placement) {
  if (placement.kind === 'first') return 0;
  if (placement.kind === 'last') return (container.children ?? []).length;
  const anchorIndex = (container.children ?? []).indexOf(placement.anchor.binding);
  return anchorIndex + (placement.kind === 'after' ? 1 : 0);
}

function applyDrift(drift, fixture) {
  if (!drift?.replaceBindingAtAddress) return;
  const target = fixture.byAddress.get(drift.replaceBindingAtAddress);
  if (!target || !target.parent) return;
  if (Object.hasOwn(drift, 'value')) {
    target.value = drift.value;
    return;
  }
  const replacement = structuredClone(drift.with);
  replacement.parent = target.parent;
  const siblings = target.parent.children ?? [];
  const index = siblings.indexOf(target);
  if (index >= 0) siblings[index] = replacement;
  fixture.byAddress.set(replacement.address, replacement);
}

function indexBindingTree(binding, output, parent = null) {
  binding.parent = parent;
  output.set(binding.address, binding);
  for (const child of binding.children ?? []) indexBindingTree(child, output, binding);
  if (binding.attributeSpace) indexBindingTree(binding.attributeSpace, output, binding);
  for (const localSpace of Object.values(binding.localSpaces ?? {})) indexBindingTree(localSpace, output, binding);
}

function compareArray(expected, actual, label, failures) {
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

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] ? resolve(process.argv[index + 1]) : null;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
