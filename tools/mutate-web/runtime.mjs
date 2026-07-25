import { applyMutationPlan, planMutation } from '../../src/index.js';
import { namespaceFromAeonSource } from '../query-web/runtime.mjs';

const HANDLE_PROPERTY = '__sansaMutateWorkbenchHandle';
const HANDLE_PREFIX = 'mutate-workbench';

export async function runMutationForWorkbench({
  source,
  requestSource,
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

  let request;
  try {
    request = JSON.parse(requestSource);
  } catch (error) {
    return errorResult('SANSA_MUTATE_WORKBENCH_INVALID_MUTATION_JSON', error.message, mode);
  }

  const root = getRoot(namespaceResult.namespace);
  assignStableHandles(root);
  const namespace = mutableNamespace(namespaceResult.namespace);
  const planOptions = mutationPlanOptions(options);
  const applyOptions = mutationApplyOptions(options);
  const planResult = planMutation(request, namespace, planOptions);

  if (!planResult.ok) {
    return {
      ok: false,
      mode,
      text: renderDiagnosticText(planResult.errors),
      errors: normalizeDiagnostics(planResult.errors),
      source: renderBindingTree(root),
    };
  }

  const plan = summarizePlan(planResult.plan);
  if (mode !== 'apply') {
    return {
      ok: true,
      mode: 'plan',
      text: renderPlanText(planResult.plan),
      plan,
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
    text: renderApplyText(applied),
    plan,
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
        const child = bindingFromJsonValue(value, {
          name,
          datatype: operation.datatype,
          address: appendMember(parent.address ?? '$', name),
          parent,
        });
        parent.children = [...(parent.children ?? []), child];
        bump(parent);
        return { binding: child, resultingAddress: child.address };
      },
      replace(target, value, operation) {
        const replacement = bindingFromJsonValue(value, {
          name: target.name,
          index: target.index,
          datatype: operation.datatype,
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
        const child = bindingFromJsonValue(value, {
          datatype: operation.datatype,
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

function bindingFromJsonValue(value, { name, index, datatype, address, parent, handle } = {}) {
  const datatypeRepresentation = representationKindFromDatatype(datatype);
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

  if (datatypeRepresentation === 'node') {
    return assignNodeBinding(binding, value, datatype, address);
  }

  if (Array.isArray(value)) {
    binding.semanticType = datatype ?? 'list';
    binding.representationKind = datatypeRepresentation === 'tuple' ? 'tuple' : 'list';
    binding.children = value.map((entry, childIndex) => bindingFromJsonValue(entry, {
      index: childIndex,
      address: `${address}[${childIndex}]`,
      parent: binding,
    }));
    return binding;
  }

  if (value && typeof value === 'object') {
    binding.semanticType = datatype ?? 'object';
    binding.representationKind = datatypeRepresentation === 'object' ? 'object' : 'object';
    binding.children = Object.entries(value).map(([key, entry]) => bindingFromJsonValue(entry, {
      name: key,
      address: appendMember(address, key),
      parent: binding,
    }));
    return binding;
  }

  binding.value = value;
  binding.semanticType = datatype ?? semanticTypeFromJsonValue(value);
  binding.representationKind = representationKindFromDatatype(datatype) ?? semanticTypeFromJsonValue(value);
  binding.scalarKind = scalarKindFromDatatype(datatype) ?? binding.representationKind;
  return binding;
}

function assignNodeBinding(binding, value, datatype, address) {
  const node = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { children: Array.isArray(value) ? value : [] };
  binding.semanticType = datatype ?? 'node';
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
  };
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, replacement, {
    ...(preserved.name === undefined ? {} : { name: preserved.name }),
    ...(preserved.index === undefined ? {} : { index: preserved.index }),
    address: preserved.address,
    parent: preserved.parent,
  });
  Object.defineProperty(target, HANDLE_PROPERTY, {
    value: preserved.handle,
    enumerable: false,
    configurable: true,
  });
  for (const child of target.children ?? []) child.parent = target;
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
  for (const key of ['maxOperations', 'maxPreconditions']) {
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
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `[${JSON.stringify(String(name))}]`;
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
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
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
  if (kind === 'infinity' || value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
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
    const budget = typeof error.budget === 'string' ? ` ${error.budget}` : '';
    const location = Number.isInteger(error.index) ? ` index ${error.index}` : '';
    return `${error.code}${phase}${operation}${budget}${location}: ${error.message}`;
  }).join('\n');
}

function normalizeDiagnostics(errors) {
  return (errors ?? []).map((error) => ({
    code: error.code,
    message: error.message,
    ...(typeof error.phase === 'string' ? { phase: error.phase } : {}),
    ...(Number.isInteger(error.operationIndex) ? { operationIndex: error.operationIndex } : {}),
    ...(Number.isInteger(error.preconditionIndex) ? { preconditionIndex: error.preconditionIndex } : {}),
    ...(typeof error.budget === 'string' ? { budget: error.budget } : {}),
    ...(Number.isSafeInteger(error.limit) ? { limit: error.limit } : {}),
    ...(Number.isSafeInteger(error.observed) ? { observed: error.observed } : {}),
    ...(Number.isInteger(error.index) ? { index: error.index } : {}),
    ...(error.cause ? { cause: normalizeDiagnostics([error.cause])[0] } : {}),
  }));
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
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    ? `${base}.${name}`
    : `${base}.[${JSON.stringify(name)}]`;
}

function semanticTypeFromJsonValue(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'list';
  return typeof value;
}

function representationKindFromDatatype(datatype) {
  const base = datatypeBaseName(datatype);
  if (['object', 'obj', 'o', 'envelope'].includes(base)) return 'object';
  if (base === 'list') return 'list';
  if (base === 'tuple') return 'tuple';
  if (base === 'node') return 'node';
  if (['string', 'trimtick', 'prose'].includes(base)) return 'string';
  if (['number', 'int', 'uint', 'float', 'n'].includes(base)) return 'number';
  if (base === 'bool') return 'boolean';
  if (base === 'nan') return 'nan';
  if (base === 'infinity') return 'infinity';
  if (base === 'null') return 'null';
  if (base === 'sep' || base === 'kadot') return 'separator';
  if (base === 'sansa') return 'sansa';
  if (base === 'encoding' || ['base64', 'embed', 'inline'].includes(base)) return 'encoding';
  if (['date', 'time', 'datetime', 'zrut'].includes(base)) return base;
  return base;
}

function scalarKindFromDatatype(datatype) {
  const kind = representationKindFromDatatype(datatype);
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
