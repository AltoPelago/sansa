import { applyMutationPlan, planInstruction, planMutation, resolveAddress, validateMutationPlanTarget } from '../../src/index.js';
import { namespaceFromAeonSource } from '../query-web/runtime.mjs';

const HANDLE_PROPERTY = '__sansaMutateWorkbenchHandle';
const HANDLE_PREFIX = 'mutate-workbench';
const AEON_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WORKBENCH_POLICY_TOP_LEVEL_FIELDS = new Set(['default', 'rules']);
const WORKBENCH_POLICY_RULE_FIELDS = new Set([
  'allow',
  'operations',
  'operation',
  'target',
  'parent',
  'container',
  'source',
  'anchor',
  'names',
  'name',
  'datatypes',
  'datatype',
  'kinds',
  'kind',
  'values',
  'value',
]);

export async function runMutationForWorkbench({
  source,
  requestSource,
  requestKind = 'structured',
  mode = 'plan',
  options = {},
}) {
  const namespaceResult = await namespaceFromAeonSource(source);
  if (!namespaceResult.ok) {
    return {
      ...namespaceResult,
      mode,
    };
  }

  const root = getRoot(namespaceResult.namespace);
  assignStableHandles(root);
  const namespace = mutableNamespace(namespaceResult.namespace);
  const planOptions = mutationPlanOptions(options);
  const applyOptions = mutationApplyOptions(options);
  const planResult = requestKind === 'instruction'
    ? planInstruction(String(requestSource ?? ''), namespace, planOptions)
    : planStructuredWorkbenchRequest(requestSource, namespace, planOptions);

  if (!planResult.ok) {
    const errors = normalizeDiagnostics(planResult.errors);
    return {
      ok: false,
      mode,
      requestKind: requestKind === 'instruction' ? 'instruction' : 'structured',
      phase: primaryDiagnosticPhase(errors, planResult.phase ?? 'plan'),
      ...(planResult.loweredRequest === undefined ? {} : { loweredRequest: planResult.loweredRequest }),
      text: renderDiagnosticText(planResult.errors),
      errors,
      source: renderBindingTree(root),
    };
  }

  const policyResult = enforceMutationPolicyForWorkbench(planResult.plan, namespace, options.policySource);
  if (!policyResult.ok) {
    return {
      ok: false,
      mode,
      requestKind: requestKind === 'instruction' ? 'instruction' : 'structured',
      phase: 'policy',
      ...(planResult.loweredRequest === undefined ? {} : { loweredRequest: planResult.loweredRequest }),
      text: renderDiagnosticText(policyResult.errors),
      errors: normalizeDiagnostics(policyResult.errors),
      plan: summarizePlan(planResult.plan),
      source: renderBindingTree(root),
    };
  }

  const targetResult = enforceTargetSurfaceForWorkbench(planResult.plan, options.targetFormat);
  if (!targetResult.ok) {
    return {
      ok: false,
      mode,
      requestKind: requestKind === 'instruction' ? 'instruction' : 'structured',
      phase: 'target',
      ...(planResult.loweredRequest === undefined ? {} : { loweredRequest: planResult.loweredRequest }),
      text: renderDiagnosticText(targetResult.errors),
      errors: normalizeDiagnostics(targetResult.errors),
      plan: summarizePlan(planResult.plan),
      source: renderBindingTree(root),
    };
  }

  const plan = summarizePlan(planResult.plan);
  if (mode !== 'apply') {
    return {
      ok: true,
      mode: 'plan',
      requestKind: requestKind === 'instruction' ? 'instruction' : 'structured',
      text: renderPlanText(planResult.plan),
      plan,
      ...(planResult.loweredRequest === undefined ? {} : { loweredRequest: planResult.loweredRequest }),
      source: renderBindingTree(root),
      diagnostics: normalizeDiagnostics(planResult.diagnostics ?? []),
    };
  }

  const applied = applyMutationPlan(planResult.plan, namespace, applyOptions);
  if (!applied.ok) {
    return {
      ok: false,
      mode: 'apply',
      text: renderDiagnosticText(applied.errors),
      plan,
      errors: normalizeDiagnostics(applied.errors),
      operationResults: summarizeOperationResults(applied.operationResults ?? []),
      source: renderBindingTree(root),
    };
  }

  return {
    ok: true,
    mode: 'apply',
    requestKind: requestKind === 'instruction' ? 'instruction' : 'structured',
    text: renderApplyText(applied),
    plan,
    ...(planResult.loweredRequest === undefined ? {} : { loweredRequest: planResult.loweredRequest }),
    result: {
      planId: applied.planId,
      stateBefore: sanitizeJsonValue(applied.stateBefore),
      stateAfter: sanitizeJsonValue(applied.stateAfter),
      operationResults: summarizeOperationResults(applied.operationResults),
      diagnostics: normalizeDiagnostics(applied.diagnostics ?? []),
    },
    source: renderBindingTree(root),
  };
}

export function enforceMutationPolicyForWorkbench(plan, namespace, policySource) {
  if (policySource === undefined || policySource === null || String(policySource).trim().length === 0) {
    return { ok: true, diagnostics: [] };
  }

  let policy;
  try {
    policy = JSON.parse(String(policySource));
  } catch (error) {
    return {
      ok: false,
      errors: [workbenchPolicyError(
        'SANSA_MUTATE_POLICY_INVALID_JSON',
        error instanceof Error ? error.message : 'Mutation policy JSON is invalid',
      )],
    };
  }

  const normalized = normalizeWorkbenchPolicy(policy);
  if (!normalized.ok) return { ok: false, errors: [normalized.error] };

  for (let operationIndex = 0; operationIndex < plan.operations.length; operationIndex += 1) {
    const operation = plan.operations[operationIndex];
    const decision = authorizeWorkbenchOperation(operation, operationIndex, normalized.policy, namespace);
    if (!decision.ok) return { ok: false, errors: [decision.error] };
  }
  return { ok: true, diagnostics: [] };
}

function enforceTargetSurfaceForWorkbench(plan, targetFormat) {
  return validateMutationPlanTarget(plan, targetFormat ?? 'aeon');
}

function normalizeWorkbenchPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return {
      ok: false,
      error: workbenchPolicyError('SANSA_MUTATE_POLICY_INVALID', 'Mutation policy must be an object'),
    };
  }
  const unsupportedTopLevelField = Object.keys(policy).find((field) => !WORKBENCH_POLICY_TOP_LEVEL_FIELDS.has(field));
  if (unsupportedTopLevelField !== undefined) {
    return {
      ok: false,
      error: workbenchPolicyError(
        'SANSA_MUTATE_POLICY_INVALID',
        `Mutation policy field '${unsupportedTopLevelField}' is not supported`,
        { policyScope: 'topLevel', policyField: unsupportedTopLevelField },
      ),
    };
  }
  if (policy.default !== undefined && policy.default !== 'allow' && policy.default !== 'deny') {
    return {
      ok: false,
      error: workbenchPolicyError(
        'SANSA_MUTATE_POLICY_INVALID',
        'Mutation policy default must be "allow" or "deny"',
        { policyScope: 'topLevel', policyField: 'default' },
      ),
    };
  }
  if (!Array.isArray(policy.rules)) {
    return {
      ok: false,
      error: workbenchPolicyError(
        'SANSA_MUTATE_POLICY_INVALID',
        'Mutation policy rules must be a list',
        { policyScope: 'topLevel', policyField: 'rules' },
      ),
    };
  }
  for (let ruleIndex = 0; ruleIndex < policy.rules.length; ruleIndex += 1) {
    const rule = policy.rules[ruleIndex];
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
      return {
        ok: false,
        error: workbenchPolicyError(
          'SANSA_MUTATE_POLICY_INVALID',
          'Mutation policy rules must be objects',
          { ruleIndex, policyScope: 'rule' },
        ),
      };
    }
    const unsupportedRuleField = Object.keys(rule).find((field) => !WORKBENCH_POLICY_RULE_FIELDS.has(field));
    if (unsupportedRuleField !== undefined) {
      return {
        ok: false,
        error: workbenchPolicyError(
          'SANSA_MUTATE_POLICY_INVALID',
          `Mutation policy rule field '${unsupportedRuleField}' is not supported`,
          { ruleIndex, policyScope: 'rule', policyField: unsupportedRuleField },
        ),
      };
    }
    if (rule.allow !== true && rule.allow !== false) {
      return {
        ok: false,
        error: workbenchPolicyError(
          'SANSA_MUTATE_POLICY_INVALID',
          'Mutation policy rules must declare allow as true or false',
          { ruleIndex, policyScope: 'rule', policyField: 'allow' },
        ),
      };
    }
  }
  return {
    ok: true,
    policy: {
      default: policy.default ?? 'deny',
      rules: policy.rules,
    },
  };
}

function authorizeWorkbenchOperation(operation, operationIndex, policy, namespace) {
  for (let ruleIndex = 0; ruleIndex < policy.rules.length; ruleIndex += 1) {
    const rule = policy.rules[ruleIndex];
    const match = workbenchPolicyRuleMatches(operation, rule, namespace);
    if (!match.ok) {
      const { ok: _ok, matched: _matched, code, message, ...details } = match;
      return {
        ok: false,
        error: workbenchPolicyError(code, message, { ...details, operationIndex, ruleIndex }),
      };
    }
    if (!match.matched) continue;
    if (rule.allow === false) {
      return {
        ok: false,
        error: workbenchPolicyError(
          'SANSA_MUTATE_POLICY_DENIED',
          `Mutation policy rule ${ruleIndex} denies ${operation.op}`,
          { operationIndex, ruleIndex },
        ),
      };
    }
    return { ok: true };
  }

  if (policy.default === 'allow') return { ok: true };
  return {
    ok: false,
    error: workbenchPolicyError(
      'SANSA_MUTATE_POLICY_DENIED',
      `Mutation policy has no allow rule for ${operation.op}`,
      { operationIndex },
    ),
  };
}

function workbenchPolicyRuleMatches(operation, rule, namespace) {
  if (!matchesPolicyList(rule.operations ?? rule.operation, operation.op)) return { ok: true, matched: false };
  if (!matchesPolicyList(rule.names ?? rule.name, operation.name)) return { ok: true, matched: false };
  if (!matchesPolicyList(rule.datatypes ?? rule.datatype, effectiveMutationDatatype(operation))) return { ok: true, matched: false };
  if (!matchesPolicyList(rule.kinds ?? rule.kind, effectiveMutationKind(operation))) return { ok: true, matched: false };
  if (!matchesPolicyValue(rule.values ?? rule.value, operation.value)) return { ok: true, matched: false };

  for (const role of ['target', 'parent', 'source', 'container']) {
    if (rule[role] === undefined) continue;
    const target = operation[role];
    if (!target?.canonicalAddress) return { ok: true, matched: false };
    const addressMatch = workbenchPolicyAddressMatches(rule[role], target.canonicalAddress, namespace, role);
    if (!addressMatch.ok || !addressMatch.matched) return addressMatch;
  }
  if (rule.anchor !== undefined) {
    const anchor = operation.placement?.anchor;
    if (!anchor?.canonicalAddress) return { ok: true, matched: false };
    const addressMatch = workbenchPolicyAddressMatches(rule.anchor, anchor.canonicalAddress, namespace, 'anchor');
    if (!addressMatch.ok || !addressMatch.matched) return addressMatch;
  }
  return { ok: true, matched: true };
}

function workbenchPolicyAddressMatches(expression, canonicalAddress, namespace, policyField) {
  if (typeof expression !== 'string' || expression.trim().length === 0) {
    return {
      ok: false,
      code: 'SANSA_MUTATE_POLICY_INVALID',
      message: 'Mutation policy address matchers must be non-empty strings',
      policyScope: 'matcher',
      policyField,
    };
  }
  const resolved = resolveAddress(expression, namespace);
  if (!resolved.ok) {
    return {
      ok: false,
      code: 'SANSA_MUTATE_POLICY_INVALID_ADDRESS',
      message: `Mutation policy address matcher '${expression}' is invalid or unsupported`,
      policyScope: 'matcher',
      policyField,
      policyAddress: expression,
    };
  }
  return {
    ok: true,
    matched: resolved.bindings.some((binding) => binding.address === canonicalAddress),
  };
}

function matchesPolicyList(expected, actual) {
  if (expected === undefined) return true;
  const expectedList = Array.isArray(expected) ? expected : [expected];
  if (expectedList.includes('*')) return true;
  if (actual === undefined) return false;
  return expectedList.includes(actual);
}

function matchesPolicyValue(expected, actual) {
  if (expected === undefined) return true;
  const expectedList = Array.isArray(expected) ? expected : [expected];
  return expectedList.some((entry) => Object.is(entry, actual));
}

function effectiveMutationDatatype(operation) {
  if (operation.datatype !== undefined) return operation.datatype;
  if (operation.op === 'replace') return operation.target?.binding?.semanticType;
  if (operation.op === 'create' || operation.op === 'insert') return semanticTypeFromJsonValue(operation.value);
  return undefined;
}

function effectiveMutationKind(operation) {
  if (operation.kind !== undefined) return operation.kind;
  if (operation.op === 'replace') {
    return operation.target?.binding?.scalarKind
      ?? operation.target?.binding?.representationKind
      ?? operation.target?.binding?.semanticType;
  }
  if (operation.op === 'create' || operation.op === 'insert') return semanticTypeFromJsonValue(operation.value);
  return undefined;
}

function workbenchPolicyError(code, message, details = {}) {
  return {
    code,
    message,
    phase: 'policy',
    ...details,
  };
}

function planStructuredWorkbenchRequest(requestSource, namespace, planOptions) {
  let request;
  try {
    request = JSON.parse(requestSource);
  } catch (error) {
    return {
      ok: false,
      errors: [{
        code: 'SANSA_MUTATE_WORKBENCH_INVALID_MUTATION_JSON',
        message: error.message,
        phase: 'parse',
      }],
    };
  }
  return planMutation(request, namespace, planOptions);
}

function mutableNamespace(namespace) {
  const root = getRoot(namespace);
  return {
    ...namespace,
    root,
    attributeSpace: (binding) => binding.attributeSpace ?? ensureAttributeSpace(binding),
    mutate: {
      supportsCreate: true,
      supportsReplace: true,
      supportsRemove: true,
      supportsOrderedInsert: true,
      supportsMove: true,
      supportsStableBindingIdentity: true,
      supportsAtomicApply: true,
      bindingHandle: (binding) => binding[HANDLE_PROPERTY],
      observedState: (binding) => binding.revision ?? 0,
      sameBinding: (left, right) => left === right || left?.[HANDLE_PROPERTY] === right?.[HANDLE_PROPERTY],
      create(parent, name, value, operation) {
        const validation = validateAeonWorkbenchValue(value, operation);
        if (!validation.ok) return validation;
        const child = bindingFromJsonValue(value, {
          name,
          datatype: operation.datatype,
          kind: operation.kind,
          address: appendMember(parent.address ?? '$', name),
          parent,
        });
        parent.children = [...(parent.children ?? []), child];
        bump(parent);
        return { binding: child, resultingAddress: child.address };
      },
      replace(target, value, operation) {
        const validation = validateAeonWorkbenchValue(value, operation);
        if (!validation.ok) return validation;
        const replacement = bindingFromJsonValue(value, {
          name: target.name,
          index: target.index,
          datatype: operation.datatype,
          kind: operation.kind,
          address: target.address,
          parent: target.parent,
          handle: target[HANDLE_PROPERTY],
        });
        replaceBindingContents(target, replacement);
        bump(target);
        return { binding: target, resultingAddress: target.address };
      },
      remove(target) {
        const parent = target.parent;
        if (parent) {
          parent.children = (parent.children ?? []).filter((child) => child !== target);
          if (parent.representationKind === 'list') reindexOrderedChildren(parent);
          bump(parent);
        }
        return { binding: target, affectedAddress: target.address };
      },
      insert(container, placement, value, operation) {
        const validation = validateAeonWorkbenchValue(value, operation);
        if (!validation.ok) return validation;
        const child = bindingFromJsonValue(value, {
          datatype: operation.datatype,
          kind: operation.kind,
          address: `${container.address ?? '$'}[new]`,
          parent: container,
        });
        container.children = [...(container.children ?? [])];
        container.children.splice(placementIndex(container, placement), 0, child);
        reindexOrderedChildren(container);
        bump(container);
        return { binding: child, resultingAddress: child.address };
      },
      move(source, container, placement) {
        container.children = (container.children ?? []).filter((child) => child !== source);
        container.children.splice(placementIndex(container, placement), 0, source);
        source.parent = container;
        reindexOrderedChildren(container);
        bump(container);
        return { binding: source, resultingAddress: source.address };
      },
    },
  };
}

function getRoot(namespace) {
  return typeof namespace.root === 'function' ? namespace.root() : namespace.root;
}

function assignStableHandles(binding, counter = { value: 0 }) {
  if (!binding || typeof binding !== 'object') return;
  if (!Object.hasOwn(binding, HANDLE_PROPERTY)) {
    Object.defineProperty(binding, HANDLE_PROPERTY, {
      value: `${HANDLE_PREFIX}:${counter.value}`,
      enumerable: false,
      configurable: true,
    });
    counter.value += 1;
  }
  for (const child of binding.children ?? []) {
    child.parent = binding;
    assignStableHandles(child, counter);
  }
  if (binding.attributeSpace) {
    binding.attributeSpace.parent = binding;
    assignStableHandles(binding.attributeSpace, counter);
  }
}

function ensureAttributeSpace(binding) {
  if (!binding || typeof binding !== 'object') return undefined;
  if (binding.representationKind === 'attributeSpace') return undefined;
  binding.attributeSpace = {
    address: `${binding.address ?? '$'}.@`,
    representationKind: 'attributeSpace',
    parent: binding,
    revision: 0,
    children: [],
  };
  Object.defineProperty(binding.attributeSpace, HANDLE_PROPERTY, {
    value: `${HANDLE_PREFIX}:attribute:${binding[HANDLE_PROPERTY] ?? binding.address ?? Math.random().toString(36).slice(2)}`,
    enumerable: false,
    configurable: true,
  });
  return binding.attributeSpace;
}

function validateAeonWorkbenchValue(value, hints = {}, path = 'value') {
  const representation = representationKindFromHints(hints);
  if (representation === 'node') return validateAeonWorkbenchNodeValue(value, path);
  const scalarValidation = validateAeonWorkbenchScalarValue(value, representation, path);
  if (!scalarValidation.ok) return scalarValidation;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = validateAeonWorkbenchValue(value[index], {}, `${path}[${index}]`);
      if (!result.ok) return result;
    }
    return { ok: true };
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      const entryPath = `${path}${renderWorkbenchValuePathSegment(key)}`;
      if (key.length === 0) return invalidAeonWorkbenchValue('Keys must not be empty', entryPath);
      const result = validateAeonWorkbenchValue(entry, {}, entryPath);
      if (!result.ok) return result;
    }
  }
  return { ok: true };
}

function validateAeonWorkbenchNodeValue(value, path) {
  if (value === undefined || value === null) return { ok: true };
  if (Array.isArray(value)) return validateAeonWorkbenchValue(value, {}, `${path}.children`);
  if (typeof value !== 'object') {
    return invalidAeonWorkbenchValue('Node values must be an object with tag/children or an array of children', path);
  }
  if (value.tag !== undefined && !validNodeTag(value.tag)) {
    return invalidAeonWorkbenchValue('Node tags must be non-empty AEON identifiers', `${path}.tag`);
  }
  if (value.children !== undefined && !Array.isArray(value.children)) {
    return invalidAeonWorkbenchValue('Node children must be a list when provided', `${path}.children`);
  }
  if (Array.isArray(value.children)) {
    for (let index = 0; index < value.children.length; index += 1) {
      const result = validateAeonWorkbenchValue(value.children[index], {}, `${path}.children[${index}]`);
      if (!result.ok) return result;
    }
  }
  if (value.attributes !== undefined) {
    if (!value.attributes || typeof value.attributes !== 'object' || Array.isArray(value.attributes)) {
      return invalidAeonWorkbenchValue('Node attributes must be an object when provided', `${path}.attributes`);
    }
    for (const [key, entry] of Object.entries(value.attributes)) {
      const entryPath = `${path}.attributes${renderWorkbenchValuePathSegment(key)}`;
      if (key.length === 0) return invalidAeonWorkbenchValue('Keys must not be empty', entryPath);
      const result = validateAeonWorkbenchValue(entry, {}, entryPath);
      if (!result.ok) return result;
    }
  }
  return { ok: true };
}

function invalidAeonWorkbenchValue(message, path) {
  return {
    ok: false,
    message: `SANSA_MUTATE_WORKBENCH_INVALID_AEON_VALUE: ${message} at ${path}`,
  };
}

function renderWorkbenchValuePathSegment(key) {
  return AEON_IDENTIFIER_PATTERN.test(String(key)) ? `.${key}` : `[${JSON.stringify(String(key))}]`;
}

function validateAeonWorkbenchScalarValue(value, representation, path) {
  if (representation === undefined || ['object', 'list', 'tuple', 'node'].includes(representation)) {
    return { ok: true };
  }
  switch (representation) {
    case 'string':
      return typeof value === 'string'
        ? { ok: true }
        : invalidAeonWorkbenchValue('String literals must use JSON string payloads', path);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? { ok: true }
        : invalidAeonWorkbenchValue('Number literals must use finite JSON number payloads', path);
    case 'boolean':
      return typeof value === 'boolean'
        ? { ok: true }
        : invalidAeonWorkbenchValue('Boolean literals must use JSON boolean payloads', path);
    case 'hex':
      return typeof value === 'string' && /^[0-9A-Fa-f]+$/.test(value)
        ? { ok: true }
        : invalidAeonWorkbenchValue('Hex literals must be non-empty hexadecimal text without the # prefix', path);
    case 'radix':
      return typeof value === 'string' && /^[A-Za-z0-9_]+$/.test(value)
        ? { ok: true }
        : invalidAeonWorkbenchValue('Radix literals must be non-empty ASCII radix text without the % prefix', path);
    case 'encoding':
      return typeof value === 'string' && value.length > 0
        ? { ok: true }
        : invalidAeonWorkbenchValue('Encoding literals must be non-empty text without the & prefix', path);
    case 'separator':
      return typeof value === 'string' && value.length > 0
        ? { ok: true }
        : invalidAeonWorkbenchValue('Separator literals must be non-empty text without the ^ prefix', path);
    case 'sansa':
    case 'sansaAddress':
      return typeof value === 'string' && value.length > 0
        ? { ok: true }
        : invalidAeonWorkbenchValue('SANSA literals must be non-empty address text', path);
    case 'toggle':
      return ['yes', 'no', 'on', 'off'].includes(value)
        ? { ok: true }
        : invalidAeonWorkbenchValue('Toggle literals must be one of yes, no, on, or off', path);
    case 'null':
      return value === null || (typeof value === 'string' && AEON_IDENTIFIER_PATTERN.test(value))
        ? { ok: true }
        : invalidAeonWorkbenchValue('Null literals must be null or an AEON identifier reason', path);
    case 'nan':
      return value === null || value === 'NaN'
        ? { ok: true }
        : invalidAeonWorkbenchValue('NaN literals must use null or "NaN" as the JSON payload', path);
    case 'infinity':
      return ['Infinity', '+Infinity', '-Infinity'].includes(value)
        ? { ok: true }
        : invalidAeonWorkbenchValue('Infinity literals must use "Infinity", "+Infinity", or "-Infinity"', path);
    case 'date':
    case 'time':
    case 'datetime':
    case 'zrut':
      return typeof value === 'string' && value.length > 0
        ? { ok: true }
        : invalidAeonWorkbenchValue(`${representation} literals must be non-empty text`, path);
    case 'cloneReference':
    case 'pointerReference':
    case 'referenceForm':
      return typeof value === 'string' && value.length > 0
        ? { ok: true }
        : invalidAeonWorkbenchValue('Reference literals must be non-empty target text', path);
    default:
      return { ok: true };
  }
}

function bindingFromJsonValue(value, { name, index, datatype, kind, address, parent, handle } = {}) {
  const representation = representationKindFromHints({ datatype, kind });
  const binding = {
    ...(name === undefined ? {} : { name }),
    ...(index === undefined ? {} : { index }),
    address,
    parent,
    revision: 0,
    children: [],
  };
  Object.defineProperty(binding, HANDLE_PROPERTY, {
    value: handle ?? `${HANDLE_PREFIX}:new:${Math.random().toString(36).slice(2)}`,
    enumerable: false,
    configurable: true,
  });

  if (representation === 'node') {
    return assignNodeBinding(binding, value, { datatype, kind }, address);
  }

  if (Array.isArray(value)) {
    binding.semanticType = datatype ?? 'list';
    binding.representationKind = representation === 'tuple' ? 'tuple' : 'list';
    binding.children = value.map((entry, childIndex) => bindingFromJsonValue(entry, {
      index: childIndex,
      address: `${address}[${childIndex}]`,
      parent: binding,
    }));
    return binding;
  }

  if (value && typeof value === 'object') {
    binding.semanticType = datatype ?? 'object';
    binding.representationKind = 'object';
    binding.children = Object.entries(value).map(([key, entry]) => bindingFromJsonValue(entry, {
      name: key,
      address: appendMember(address, key),
      parent: binding,
    }));
    return binding;
  }

  const scalarValue = scalarValueFromHints(value, { datatype, kind });
  binding.value = scalarValue.value;
  if (scalarValue.nullReason !== undefined) binding.nullReason = scalarValue.nullReason;
  binding.semanticType = datatype ?? semanticTypeFromRepresentationKind(representation) ?? semanticTypeFromJsonValue(value);
  binding.representationKind = scalarValue.representationKind ?? representation ?? semanticTypeFromJsonValue(value);
  binding.scalarKind = scalarValue.scalarKind ?? scalarKindFromHints({ datatype, kind }) ?? binding.representationKind;
  return binding;
}

function scalarValueFromHints(value, hints) {
  const representation = representationKindFromHints(hints);
  if (representation === 'null' && typeof value === 'string') {
    return { value: null, nullReason: value, scalarKind: 'null', representationKind: 'null' };
  }
  if (representation === 'nan') {
    return { value: Number.NaN, scalarKind: 'nan', representationKind: 'nan' };
  }
  if (representation === 'infinity') {
    return {
      value: value === '-Infinity' ? -Infinity : Infinity,
      scalarKind: 'infinity',
      representationKind: 'infinity',
    };
  }
  if (representation === 'cloneReference' || representation === 'pointerReference' || representation === 'referenceForm') {
    const canonical = referenceCanonicalFromWorkbenchValue(value, representation);
    return {
      value: {
        type: canonical.startsWith('~>') ? 'PointerReference' : 'CloneReference',
        canonical,
      },
      scalarKind: 'referenceForm',
      representationKind: canonical.startsWith('~>') ? 'pointerReference' : 'cloneReference',
    };
  }
  return { value };
}

function referenceCanonicalFromWorkbenchValue(value, representation) {
  const text = String(value);
  if (text.startsWith('~>') || text.startsWith('~')) return text;
  return `${representation === 'pointerReference' ? '~>' : '~'}${text}`;
}

function assignNodeBinding(binding, value, hints, address) {
  const node = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { children: Array.isArray(value) ? value : [] };
  binding.semanticType = hints.datatype ?? 'node';
  binding.representationKind = 'node';
  binding.nodeTag = validNodeTag(node.tag) ? node.tag : 'node';
  const children = Array.isArray(node.children) ? node.children : [];
  binding.children = children.map((entry, childIndex) => bindingFromJsonValue(entry, {
    index: childIndex,
    address: `${address}[${childIndex}]`,
    parent: binding,
  }));
  if (node.attributes && typeof node.attributes === 'object' && !Array.isArray(node.attributes)) {
    const attributeSpace = {
      address: `${address}.@`,
      representationKind: 'attributeSpace',
      parent: binding,
      revision: 0,
      children: [],
    };
    attributeSpace.children = Object.entries(node.attributes).map(([key, entry]) => bindingFromJsonValue(entry, {
      name: key,
      address: appendMember(`${address}.@`, key),
      parent: attributeSpace,
    }));
    binding.attributeSpace = attributeSpace;
  }
  return binding;
}

function replaceBindingContents(target, replacement) {
  const preserved = {
    name: target.name,
    index: target.index,
    address: target.address,
    parent: target.parent,
    handle: target[HANDLE_PROPERTY],
    attributeSpace: target.attributeSpace,
  };
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, replacement, {
    ...(preserved.name === undefined ? {} : { name: preserved.name }),
    ...(preserved.index === undefined ? {} : { index: preserved.index }),
    address: preserved.address,
    parent: preserved.parent,
    attributeSpace: replacement.attributeSpace ?? preserved.attributeSpace,
  });
  Object.defineProperty(target, HANDLE_PROPERTY, {
    value: preserved.handle,
    enumerable: false,
    configurable: true,
  });
  for (const child of target.children ?? []) child.parent = target;
  if (target.attributeSpace) target.attributeSpace.parent = target;
}

function placementIndex(container, placement) {
  if (placement.kind === 'first') return 0;
  if (placement.kind === 'last') return (container.children ?? []).length;
  const anchorIndex = (container.children ?? []).indexOf(placement.anchor.binding);
  return Math.max(0, anchorIndex + (placement.kind === 'after' ? 1 : 0));
}

function reindexOrderedChildren(container) {
  if (!['list', 'tuple', 'node'].includes(container.representationKind)) return;
  container.children = (container.children ?? []).map((child, index) => {
    child.index = index;
    child.name = undefined;
    child.address = `${container.address}[${index}]`;
    child.parent = container;
    readdressDescendants(child);
    return child;
  });
}

function readdressDescendants(binding) {
  for (const child of binding.children ?? []) {
    child.parent = binding;
    child.address = child.name === undefined
      ? `${binding.address}[${child.index}]`
      : appendMember(binding.address, child.name);
    readdressDescendants(child);
  }
}

function bump(binding) {
  binding.revision = (binding.revision ?? 0) + 1;
}

function mutationPlanOptions(options) {
  return {
    ...mutationBudgetOptions(options),
    ...parseLimitOption(options),
  };
}

function mutationApplyOptions(options) {
  return {
    ...mutationBudgetOptions(options),
    ...(options?.requireAtomic === true ? { requireAtomic: true } : {}),
    ...(options?.recheckPreconditions === false ? { recheckPreconditions: false } : {}),
  };
}

function mutationBudgetOptions(options) {
  const budget = {};
  for (const key of ['maxOperations', 'maxPreconditions', 'maxValueNodes', 'maxValueDepth', 'maxStringLength']) {
    if (Number.isSafeInteger(options?.[key]) && options[key] >= 0) budget[key] = options[key];
  }
  return Object.keys(budget).length === 0 ? {} : { budget };
}

function parseLimitOption(options) {
  if (!Number.isSafeInteger(options?.maxPositionIndex) || options.maxPositionIndex < 0) return {};
  return { parse: { maxPositionIndex: options.maxPositionIndex } };
}

function summarizePlan(plan) {
  return {
    type: plan.type,
    planVersion: plan.planVersion,
    planId: plan.planId,
    namespaceState: sanitizeJsonValue(plan.namespaceState),
    operations: plan.operations.map(summarizeOperation),
    preconditions: plan.preconditions.map((precondition) => ({
      expression: precondition.expression,
      canonical: precondition.canonical,
      ...(precondition.target ? { target: summarizeTarget(precondition.target) } : {}),
    })),
    sourceProvenance: sanitizeJsonValue(plan.sourceProvenance),
    portabilityWarnings: normalizeDiagnostics(plan.portabilityWarnings ?? []),
    diagnostics: normalizeDiagnostics(plan.diagnostics ?? []),
  };
}

function summarizeOperation(operation) {
  return {
    op: operation.op,
    ...(operation.target ? { target: summarizeTarget(operation.target) } : {}),
    ...(operation.parent ? { parent: summarizeTarget(operation.parent) } : {}),
    ...(operation.source ? { source: summarizeTarget(operation.source) } : {}),
    ...(operation.container ? { container: summarizeTarget(operation.container) } : {}),
    ...(operation.placement ? { placement: summarizePlacement(operation.placement) } : {}),
    ...(operation.name === undefined ? {} : { name: operation.name }),
    ...(operation.datatype === undefined ? {} : { datatype: operation.datatype }),
    ...(operation.kind === undefined ? {} : { kind: operation.kind }),
    ...(operation.value === undefined ? {} : { value: sanitizeJsonValue(operation.value) }),
    ...(operation.provenance === undefined ? {} : { provenance: sanitizeJsonValue(operation.provenance) }),
  };
}

function summarizePlacement(placement) {
  return {
    kind: placement.kind,
    ...(placement.anchor ? { anchor: summarizeTarget(placement.anchor) } : {}),
  };
}

function summarizeTarget(target) {
  return {
    requestedAddress: target.requestedAddress,
    canonicalAddress: target.canonicalAddress,
    bindingHandle: sanitizeJsonValue(target.bindingHandle),
    observedState: sanitizeJsonValue(target.observedState),
    portabilityWarnings: normalizeDiagnostics(target.portabilityWarnings ?? []),
  };
}

function summarizeOperationResults(results) {
  return results.map((entry) => ({
    operationIndex: entry.operationIndex,
    status: entry.status,
    targetAddress: entry.targetAddress,
    parentAddress: entry.parentAddress,
    containerAddress: entry.containerAddress,
    sourceAddress: entry.sourceAddress,
    anchorAddress: entry.anchorAddress,
    previousAddress: entry.previousAddress,
    affectedAddress: entry.affectedAddress,
    resultingAddress: entry.resultingAddress,
    affectedBinding: entry.affectedBinding ? summarizeBinding(entry.affectedBinding) : undefined,
  }));
}

function summarizeBinding(binding) {
  return {
    address: binding.address,
    name: binding.name,
    index: binding.index,
    semanticType: binding.semanticType,
    representationKind: binding.representationKind,
    scalarKind: binding.scalarKind,
    nullReason: binding.nullReason,
    nodeTag: binding.nodeTag,
    value: sanitizeJsonValue(binding.value),
  };
}

function renderPlanText(plan) {
  const lines = [
    `planVersion: ${plan.planVersion}`,
    `operations: ${plan.operations.length}`,
  ];
  for (const [index, operation] of plan.operations.entries()) {
    const target = operation.target ?? operation.parent ?? operation.source ?? operation.container;
    lines.push(`${index}: ${operation.op} ${target?.canonicalAddress ?? ''}`.trim());
  }
  if (plan.sourceProvenance?.reason !== undefined || plan.sourceProvenance?.claimedAuthor !== undefined) {
    lines.push('', 'provenance:');
    if (plan.sourceProvenance.reason !== undefined) lines.push(`because ${JSON.stringify(plan.sourceProvenance.reason)}`);
    if (plan.sourceProvenance.claimedAuthor !== undefined) lines.push(`by ${JSON.stringify(plan.sourceProvenance.claimedAuthor)}`);
  }
  if ((plan.preconditions ?? []).length > 0) {
    lines.push('', `preconditions: ${plan.preconditions.length}`);
    for (const [index, precondition] of plan.preconditions.entries()) {
      lines.push(`${index}: require ${precondition.canonical}${precondition.target?.canonicalAddress === undefined ? '' : ` at ${precondition.target.canonicalAddress}`}`);
    }
  }
  if ((plan.portabilityWarnings ?? []).length > 0) {
    lines.push('', 'portabilityWarnings:', ...plan.portabilityWarnings.map((warning) => `- ${warning.code}: ${warning.message}`));
  }
  return lines.join('\n');
}

function renderApplyText(result) {
  return [
    `applied: ${result.operationResults.length}`,
    ...result.operationResults.map((entry) => (
      `${entry.operationIndex}: ${entry.status} ${entry.previousAddress ?? entry.parentAddress ?? entry.containerAddress ?? ''} -> ${entry.resultingAddress ?? entry.affectedAddress ?? '(none)'}`
    )),
  ].join('\n');
}

function renderBindingTree(root) {
  return (root.children ?? []).flatMap((child) => renderNamedBinding(child, 0)).join('\n');
}

function renderNamedBinding(binding, depth) {
  const indent = '  '.repeat(depth);
  const label = binding.name === undefined ? renderAnonymousPrefix(binding) : renderBindingName(binding.name);
  const datatype = renderDatatype(binding);
  const head = `${indent}${label}${renderInlineAttributes(binding)}:${datatype} = `;
  return renderBindingAssignment(binding, depth, head);
}

function renderAnonymousBinding(binding, depth) {
  const indent = '  '.repeat(depth);
  const datatype = renderDatatype(binding);
  const attributes = renderInlineAttributes(binding);
  const head = attributes
    ? `${indent}${attributes}:${datatype} = `
    : `${indent}`;
  return renderBindingAssignment(binding, depth, head);
}

function renderBindingAssignment(binding, depth, head) {
  if (isContainerBinding(binding)) {
    return renderContainerAssignment(binding, depth, head);
  }
  return [`${head}${renderScalarValue(binding)}`];
}

function isContainerBinding(binding) {
  return ['object', 'list', 'tuple', 'node'].includes(binding.representationKind);
}

function renderContainerAssignment(binding, depth, head) {
  const indent = '  '.repeat(depth);
  const kind = binding.representationKind;
  if (kind === 'list') {
    return [
      `${head}[`,
      ...(binding.children ?? []).flatMap((child) => renderAnonymousBinding(child, depth + 1)),
      `${indent}]`,
    ];
  }
  if (kind === 'tuple') {
    return [
      `${head}(`,
      ...(binding.children ?? []).flatMap((child) => renderAnonymousBinding(child, depth + 1)),
      `${indent})`,
    ];
  }
  if (kind === 'node') {
    const tag = validNodeTag(binding.nodeTag) ? binding.nodeTag : 'node';
    if ((binding.children ?? []).length === 0) return [`${head}<${tag}>`];
    return [
      `${head}<${tag}(`,
      ...(binding.children ?? []).flatMap((child) => renderAnonymousBinding(child, depth + 1)),
      `${indent})>`,
    ];
  }
  return [
    `${head}{`,
    ...(binding.children ?? []).flatMap((child) => renderNamedBinding(child, depth + 1)),
    `${indent}}`,
  ];
}

function renderAnonymousPrefix(binding) {
  if (binding.index !== undefined) return `[${binding.index}]`;
  return renderBindingName(String(binding.name ?? 'value'));
}

function renderBindingName(name) {
  return AEON_IDENTIFIER_PATTERN.test(name) ? name : JSON.stringify(String(name));
}

function renderDatatype(binding) {
  return binding.semanticType ?? semanticTypeFromJsonValue(binding.value);
}

function renderInlineAttributes(binding) {
  const attributes = binding.attributeSpace?.children ?? [];
  if (attributes.length === 0) return '';
  return `@{${attributes.map(renderAttributeBinding).join(', ')}}`;
}

function validNodeTag(value) {
  return typeof value === 'string' && AEON_IDENTIFIER_PATTERN.test(value);
}

function renderAttributeBinding(binding) {
  return `${renderBindingName(binding.name)}:${renderDatatype(binding)} = ${renderScalarValue(binding)}`;
}

function renderScalarValue(binding) {
  const value = binding.value;
  const kind = binding.scalarKind ?? binding.valueKind ?? binding.literalKind ?? binding.representationKind ?? binding.kind ?? binding.type;
  const datatypeBase = typeof binding.semanticType === 'string'
    ? binding.semanticType.split(/[<\[]/, 1)[0]
    : undefined;
  if (['trimtick', 'prose'].includes(datatypeBase)) return renderBlockString(value);
  if ((kind === 'null' || value === null) && typeof binding.nullReason === 'string') return `!${binding.nullReason}`;
  if (kind === 'nan' || (typeof value === 'number' && Number.isNaN(value))) return 'NaN';
  if (value === -Infinity) return '-Infinity';
  if (kind === 'infinity' || value === Infinity) return 'Infinity';
  if (kind === 'toggle') return String(value);
  if (kind === 'hex') return `#${value}`;
  if (kind === 'radix') return `%${value}`;
  if (kind === 'encoding') return `&${value}`;
  if (kind === 'separator') return `^${value}`;
  if (['date', 'time', 'datetime', 'zrut'].includes(kind)) return String(value);
  if (kind === 'sansaAddress' || kind === 'sansa') {
    return value?.canonical ?? value?.address?.canonical ?? value?.address ?? String(value);
  }
  if (kind === 'referenceForm') return value?.canonical ?? JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}

function renderBlockString(value) {
  const text = String(value ?? '').replace(/`/g, '\\`');
  return `>\`${text}\``;
}

function renderDiagnosticText(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return '(no diagnostics)';
  return errors.map((error) => {
    const phase = typeof error.phase === 'string' ? ` [${error.phase}]` : '';
    const operation = Number.isInteger(error.operationIndex) ? ` operation ${error.operationIndex}` : '';
    const rule = Number.isInteger(error.ruleIndex) ? ` rule ${error.ruleIndex}` : '';
    const budget = typeof error.budget === 'string' ? ` ${error.budget}` : '';
    const location = Number.isInteger(error.index) ? ` index ${error.index}` : '';
    const details = renderDiagnosticDetails(error);
    const cause = error.cause && typeof error.cause === 'object'
      ? `\n  cause ${renderDiagnosticText([error.cause])}`
      : '';
    return `${error.code}${phase}${operation}${rule}${budget}${location}${details}: ${error.message}${cause}`;
  }).join('\n');
}

function renderDiagnosticDetails(error) {
  const parts = [];
  if (typeof error.targetFormat === 'string') parts.push(`target ${error.targetFormat}`);
  if (typeof error.datatype === 'string') parts.push(`datatype ${error.datatype}`);
  if (typeof error.valuePath === 'string') parts.push(`value ${error.valuePath}`);
  if (typeof error.policyField === 'string') parts.push(`field ${error.policyField}`);
  if (typeof error.policyScope === 'string') parts.push(`scope ${error.policyScope}`);
  if (typeof error.policyAddress === 'string') parts.push(`address ${error.policyAddress}`);
  return parts.length === 0 ? '' : ` (${parts.join(', ')})`;
}

function normalizeDiagnostics(errors) {
  return (errors ?? []).map((error) => ({
    code: error.code,
    message: error.message,
    ...(typeof error.phase === 'string' ? { phase: error.phase } : {}),
    ...(Number.isInteger(error.operationIndex) ? { operationIndex: error.operationIndex } : {}),
    ...(Number.isInteger(error.preconditionIndex) ? { preconditionIndex: error.preconditionIndex } : {}),
    ...(Number.isInteger(error.ruleIndex) ? { ruleIndex: error.ruleIndex } : {}),
    ...(typeof error.policyField === 'string' ? { policyField: error.policyField } : {}),
    ...(typeof error.policyScope === 'string' ? { policyScope: error.policyScope } : {}),
    ...(typeof error.policyAddress === 'string' ? { policyAddress: error.policyAddress } : {}),
    ...(typeof error.budget === 'string' ? { budget: error.budget } : {}),
    ...(typeof error.targetFormat === 'string' ? { targetFormat: error.targetFormat } : {}),
    ...(typeof error.datatype === 'string' ? { datatype: error.datatype } : {}),
    ...(typeof error.valuePath === 'string' ? { valuePath: error.valuePath } : {}),
    ...(Number.isSafeInteger(error.limit) ? { limit: error.limit } : {}),
    ...(Number.isSafeInteger(error.observed) ? { observed: error.observed } : {}),
    ...(Number.isInteger(error.index) ? { index: error.index } : {}),
    ...(error.cause ? { cause: normalizeDiagnostics([error.cause])[0] } : {}),
  }));
}

function primaryDiagnosticPhase(errors, fallback) {
  const first = Array.isArray(errors) ? errors[0] : null;
  if (typeof first?.phase === 'string') return first.phase;
  if (typeof fallback === 'string') return fallback;
  return undefined;
}

function errorResult(code, message, mode) {
  const errors = [{ code, message }];
  return {
    ok: false,
    mode,
    text: renderDiagnosticText(errors),
    errors,
  };
}

function appendMember(base, name) {
  return AEON_IDENTIFIER_PATTERN.test(name)
    ? `${base}.${name}`
    : `${base}.[${JSON.stringify(name)}]`;
}

function semanticTypeFromJsonValue(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'list';
  return typeof value;
}

function semanticTypeFromRepresentationKind(kind) {
  if (typeof kind !== 'string') return undefined;
  switch (kind) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'toggle':
    case 'hex':
    case 'radix':
    case 'encoding':
    case 'separator':
    case 'sansa':
    case 'date':
    case 'time':
    case 'datetime':
    case 'zrut':
    case 'null':
    case 'nan':
    case 'infinity':
    case 'cloneReference':
    case 'pointerReference':
    case 'referenceForm':
      return kind === 'sansa' ? 'sansa' : kind;
    default:
      return undefined;
  }
}

function representationKindFromHints({ datatype, kind } = {}) {
  return kind === undefined
    ? representationKindFromName(datatype, { allowUnknown: false })
    : representationKindFromName(kind, { allowUnknown: true });
}

function representationKindFromName(name, { allowUnknown = false } = {}) {
  const base = datatypeBaseName(name);
  const lowered = typeof base === 'string' ? base.toLowerCase() : base;
  if (['object', 'obj', 'o', 'envelope'].includes(base)) return 'object';
  if (base === 'list') return 'list';
  if (base === 'tuple') return 'tuple';
  if (base === 'node') return 'node';
  if (['string', 'trimtick', 'prose'].includes(base)) return 'string';
  if (['number', 'int', 'uint', 'float', 'n'].includes(base)) return 'number';
  if (base === 'bool' || base === 'boolean') return 'boolean';
  if (base === 'toggle') return 'toggle';
  if (base === 'hex') return 'hex';
  if (lowered === 'radix' || /^radix\d+$/.test(lowered)) return 'radix';
  if (base === 'nan') return 'nan';
  if (base === 'infinity') return 'infinity';
  if (base === 'null') return 'null';
  if (base === 'sep' || base === 'separator' || base === 'kadot') return 'separator';
  if (base === 'sansa') return 'sansa';
  if (base === 'encoding' || ['base64', 'embed', 'inline'].includes(base)) return 'encoding';
  if (['date', 'time', 'datetime', 'zrut'].includes(base)) return base;
  if (['cloneReference', 'pointerReference', 'referenceForm'].includes(base)) return base;
  return allowUnknown ? base : undefined;
}

function scalarKindFromHints(hints) {
  const kind = representationKindFromHints(hints);
  if (kind === 'sansa') return 'sansaAddress';
  return kind;
}

function datatypeBaseName(datatype) {
  if (typeof datatype !== 'string') return undefined;
  const genericCut = datatype.indexOf('<');
  const argumentCut = datatype.indexOf('[');
  const cut = [genericCut, argumentCut].filter((index) => index >= 0).sort((left, right) => left - right)[0];
  return (cut === undefined ? datatype : datatype.slice(0, cut)).trim();
}

function sanitizeJsonValue(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(sanitizeJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeJsonValue(entry)]));
  }
  return value;
}
