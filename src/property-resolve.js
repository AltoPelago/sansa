// Runtime-owned standalone Resolve property state. Never exposed in options,
// bindings or serialized results. Other consumers must explicitly deny admission.
export const DEFAULT_PROPERTY_INSPECTIONS = 10_000;
export const MAX_PROPERTY_INSPECTIONS = 1_000_000;

export function validPropertyLimit(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_PROPERTY_INSPECTIONS;
}
const internalFailures = new WeakSet();
class PropertyFailure {
  constructor(code) { this.code = code; internalFailures.add(this); }
}
const invalid = () => { throw new PropertyFailure('SANSA_RESOLVE_INVALID_PROPERTY_METADATA'); };
const objectLike = value => value !== null && (typeof value === 'object' || typeof value === 'function');
function faultCode(error) {
  if (internalFailures.has(error)) return error.code;
  // Explicit checked faults are plain data; never evaluate fault accessors or
  // copy host messages/foreign values into diagnostics.
  try {
    const type = Object.getOwnPropertyDescriptor(error, 'type');
    const kind = Object.getOwnPropertyDescriptor(error, 'kind');
    if (type?.value === 'SansaPropertyAccessFault') switch (kind?.value) {
      case 'invalidMetadata': return 'SANSA_RESOLVE_INVALID_PROPERTY_METADATA';
      case 'scopeViolation': return 'SANSA_RESOLVE_PROPERTY_SCOPE_VIOLATION';
      case 'adapterFailure': return 'SANSA_RESOLVE_PROPERTY_ADAPTER_ERROR';
    }
  } catch { /* untyped host fault */ }
  return 'SANSA_RESOLVE_PROPERTY_ADAPTER_ERROR';
}
function diagnostic(code, selector, selectorIndex, extra = {}) {
  return {code, message: 'Property resolution failed', property: selector.property, selectorIndex, ...extra};
}
export function prepareProperties(namespace, selectors) {
  let facet;
  try {
    facet = namespace.properties;
    const methods = {};
    const method = name => {
      if (!Object.hasOwn(methods, name)) methods[name] = facet?.[name];
      return methods[name];
    };
    for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
      const selector = selectors[selectorIndex];
      if (selector.type !== 'propertyFilter') continue;
      if (typeof method('scope') !== 'function') return {error: diagnostic('SANSA_RESOLVE_UNSUPPORTED_PROPERTY_SCOPE', selector, selectorIndex)};
      const required = selector.property === 'key' ? ['key'] : ['nodeKind', 'nodeTag', 'nodeHeads'];
      for (const name of required) if (typeof method(name) !== 'function') return {error: diagnostic(selector.property === 'key' ? 'SANSA_RESOLVE_UNSUPPORTED_KEY' : 'SANSA_RESOLVE_UNSUPPORTED_TAG', selector, selectorIndex)};
    }
    // Snapshot requested callback references once: capability checking performs
    // no metadata reads and later callbacks cannot silently remove the contract.
    return {facet, methods};
  } catch (error) {
    const index = selectors.findIndex(s => s.type === 'propertyFilter');
    return {error: diagnostic(faultCode(error), selectors[index], index)};
  }
}
function scalar(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') invalid();
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) invalid();
  }
  return value;
}
export function propertyContext(scopeRoot, evaluationRoot, directHeadOf) {
  return Object.freeze({scopeRoot, evaluationRoot, ...(directHeadOf === undefined ? {} : {directHeadOf})});
}
export function selectProperty(binding, context, prepared, selector, selectorIndex, budget) {
  const {facet, methods} = prepared;
  const call = (name, candidate, ctx) => methods[name].call(facet, candidate, ctx);
  const charge = () => {
    if (budget.inspected >= budget.limit) throw new PropertyFailure('SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED');
    budget.inspected++;
  };
  const authorize = (candidate, ctx) => {
    const role = call('scope', candidate, ctx);
    if (role === 'outside') throw new PropertyFailure('SANSA_RESOLVE_PROPERTY_SCOPE_VIOLATION');
    if (!['root', 'inside'].includes(role) || (role === 'root') !== (candidate === ctx.scopeRoot)) invalid();
    return role;
  };
  const kind = (candidate, ctx) => {
    const value = call('nodeKind', candidate, ctx);
    if (!['NodeLiteral', 'NodeHead', 'Other'].includes(value)) invalid();
    return value;
  };
  try {
    charge();
    const role = authorize(binding, context);
    if (selector.property === 'key') return {match: role === 'root' ? false : scalar(call('key', binding, context)) === selector.value};
    const nodeKind = kind(binding, context);
    if (selector.property === 'headTag') return {match: nodeKind === 'NodeHead' && scalar(call('nodeTag', binding, context)) === selector.value};
    if (nodeKind !== 'NodeLiteral') return {match: false};
    let iterator, finished = false, match = false;
    try {
      const iterable = call('nodeHeads', binding, context);
      const create = iterable?.[Symbol.iterator];
      if (typeof create !== 'function') invalid();
      iterator = create.call(iterable);
      if (!objectLike(iterator)) invalid();
      const next = iterator.next;
      if (typeof next !== 'function') invalid();
      while (true) {
        const step = next.call(iterator);
        if (!objectLike(step)) invalid();
        if (step.done) { finished = true; break; }
        charge();
        const head = step.value;
        if (!objectLike(head)) invalid();
        const headContext = propertyContext(context.scopeRoot, context.evaluationRoot, binding);
        authorize(head, headContext);
        if (kind(head, headContext) !== 'NodeHead') invalid();
        if (scalar(call('nodeTag', head, headContext)) === selector.value) { match = true; break; }
      }
    } finally {
      // Also close after next() faults. Standard for-of does not cover that
      // case, while the checked property contract explicitly requires it.
      if (iterator && !finished) {
        const close = iterator.return;
        if (close !== undefined) {
          if (typeof close !== 'function') invalid();
          const closed = close.call(iterator);
          if (!objectLike(closed)) invalid();
        }
      }
    }
    return {match};
  } catch (error) {
    const code = faultCode(error);
    return {error: diagnostic(code, selector, selectorIndex, code === 'SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED' ? {budget: 'maxPropertyInspections', limit: budget.limit, observed: budget.limit + 1} : {})};
  }
}
