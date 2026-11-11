// Adapted from Aeonic comparison boundary at fefc72be3fc10db24a279862d7194507c36ec94a.
// MIT; see LICENSE and docs/aeonic-comparison.md. Declared order is unavailable.
import { FINITE_NUMBER, compareFiniteNumbers } from './aeonic-exact-number.js';
import { exceedsJsonDepth, parseStrictJson } from './aeonic-json.js';

const BASELINE = 'aeonic.operations.comparison.baseline.v1';
const CODEPOINT = 'aeonic.operations.string.codepoint.v1';
export const AEONIC_COMPARISON_DEFAULT_RESOURCE_LIMITS = Object.freeze({
  maxRequestBytes: 4194304, maxRequestDepth: 32, maxNumericCharacters: 65536,
  maxStringScalars: 65536, maxSymbolScalars: 65536,
  maxDeclarations: 64, maxDeclaredSymbols: 1024,
});
const SUPPORTED = new Set(['finiteNumber', 'string', 'boolean', 'symbol']);
const DEFERRED = new Set([
  'positiveInfinity', 'negativeInfinity', 'nan', 'explicitNull', 'explicitAbsence',
  'toggle', 'hex', 'radix', 'encoding', 'separator', 'sansaAddress', 'referenceForm',
  'temporal', 'container',
]);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const scalar = (value) => typeof value === 'string' && !/[\uD800-\uDFFF]/u.test(value);
const identifier = (value) => scalar(value) && value.length > 0;
const pointer = (path, key) => scalar(String(key))
  ? `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}` : null;

class OperationFailure extends Error {
  constructor(reason, stage, path) {
    super(reason);
    this.result = { outcome: 'diagnostic', reason, context: { stage, path } };
  }
}
const stop = (reason, stage, path) => { throw new OperationFailure(reason, stage, path); };
const invalidPolicy = (path) => stop('invalid_policy', 3, path);

function limitsFor(options) {
  if (!record(options)) throw new TypeError('Aeonic comparison options must be an object');
  for (const key of Object.keys(options)) {
    if (key !== 'resourceLimits') throw new TypeError(`Unknown trusted Aeonic comparison option: ${key}`);
  }
  const supplied = options.resourceLimits === undefined ? {} : options.resourceLimits;
  if (!record(supplied)) throw new TypeError('resourceLimits must be an object');
  for (const [name, limit] of Object.entries(supplied)) {
    if (!Object.hasOwn(AEONIC_COMPARISON_DEFAULT_RESOURCE_LIMITS, name) || !Number.isSafeInteger(limit) || limit < 0) {
      throw new TypeError(`Invalid trusted resource limit: ${name}`);
    }
  }
  return { ...AEONIC_COMPARISON_DEFAULT_RESOURCE_LIMITS, ...supplied };
}

function closed(object, allowed, path, reason, stage) {
  for (const key of Object.keys(object).sort(compareScalars)) {
    if (!allowed.includes(key)) stop(reason, stage, pointer(path, key));
  }
}

function compareScalars(left, right) {
  const a = left[Symbol.iterator]();
  const b = right[Symbol.iterator]();
  while (true) {
    const x = a.next(); const y = b.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const difference = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
}

function validateText(value, path, reason, stage, nonempty, limit) {
  if (typeof value !== 'string') stop(reason, stage, path);
  let count = 0;
  for (const character of value) {
    if (character.length === 1 && /[\uD800-\uDFFF]/u.test(character)) stop(reason, stage, path);
    count += 1;
    if (count > limit) stop('resource_limit', stage, path);
  }
  if (nonempty && count === 0) stop(reason, stage, path);
}

function validateOrder(order, path, limits) {
  if (!Array.isArray(order) || order.length === 0) invalidPolicy(path);
  if (order.length > limits.maxDeclaredSymbols) stop('resource_limit', 3, path);
  const seen = new Set();
  for (const [index, symbol] of order.entries()) {
    const at = pointer(path, index);
    if (!record(symbol) || symbol.category !== 'symbol') invalidPolicy(pointer(at, 'category'));
    closed(symbol, ['category', 'value'], at, 'invalid_policy', 3);
    validateText(symbol.value, pointer(at, 'value'), 'invalid_policy', 3, true, limits.maxSymbolScalars);
    if (seen.has(symbol.value)) invalidPolicy(at);
    seen.add(symbol.value);
  }
}

function validateReference(reference, path) {
  if (!record(reference)) invalidPolicy(path);
  closed(reference, ['id', 'version'], path, 'invalid_policy', 3);
  for (const key of ['id', 'version']) if (!identifier(reference[key])) invalidPolicy(pointer(path, key));
}

function validateConfig(config, path, context, limits) {
  if (!record(config)) invalidPolicy(path);
  closed(config, context ? ['profile', 'strings', 'symbols', 'declarations'] : ['profile', 'strings', 'symbols'], path, 'invalid_policy', 3);
  if (Object.hasOwn(config, 'profile') && !identifier(config.profile)) invalidPolicy(pointer(path, 'profile'));
  if (Object.hasOwn(config, 'strings')) {
    const at = pointer(path, 'strings');
    if (!record(config.strings)) invalidPolicy(at);
    closed(config.strings, ['profile'], at, 'invalid_policy', 3);
    if (!identifier(config.strings.profile)) invalidPolicy(pointer(at, 'profile'));
  }
  if (Object.hasOwn(config, 'symbols')) {
    const symbols = config.symbols; const at = pointer(path, 'symbols');
    if (!record(symbols)) invalidPolicy(at);
    closed(symbols, ['mode', 'profile', 'declaration'], at, 'invalid_policy', 3);
    if (!['string-profile', 'declared-order'].includes(symbols.mode)) invalidPolicy(pointer(at, 'mode'));
    if (symbols.mode === 'string-profile') {
      if (Object.hasOwn(symbols, 'declaration')) invalidPolicy(pointer(at, 'declaration'));
      if (!identifier(symbols.profile)) invalidPolicy(pointer(at, 'profile'));
    } else {
      if (Object.hasOwn(symbols, 'profile')) invalidPolicy(pointer(at, 'profile'));
      const declaration = symbols.declaration; const target = pointer(at, 'declaration');
      if (!record(declaration)) invalidPolicy(target);
      closed(declaration, ['order', 'reference'], target, 'invalid_policy', 3);
      if (Object.hasOwn(declaration, 'order') === Object.hasOwn(declaration, 'reference')) invalidPolicy(target);
      if (Object.hasOwn(declaration, 'order')) validateOrder(declaration.order, pointer(target, 'order'), limits);
      else validateReference(declaration.reference, pointer(target, 'reference'));
    }
  }
  if (Object.hasOwn(config, 'declarations')) {
    const declarations = config.declarations; const at = pointer(path, 'declarations');
    if (!Array.isArray(declarations)) invalidPolicy(at);
    if (declarations.length > limits.maxDeclarations) stop('resource_limit', 3, at);
    const seen = new Set();
    for (const [index, declaration] of declarations.entries()) {
      const target = pointer(at, index);
      if (!record(declaration)) invalidPolicy(target);
      closed(declaration, ['id', 'version', 'order'], target, 'invalid_policy', 3);
      for (const key of ['id', 'version']) if (!identifier(declaration[key])) invalidPolicy(pointer(target, key));
      const identity = JSON.stringify([declaration.id, declaration.version]);
      if (seen.has(identity)) invalidPolicy(target);
      seen.add(identity);
      validateOrder(declaration.order, pointer(target, 'order'), limits);
    }
  }
}

function resolvePolicy(input) {
  const context = input.context ?? {}; const policy = input.policy ?? {};
  const select = (key, fallback) => Object.hasOwn(policy, key)
    ? { value: policy[key], path: `/input/policy/${key}` }
    : Object.hasOwn(context, key) ? { value: context[key], path: `/input/context/${key}` }
      : { value: fallback, path: null };
  const profile = select('profile', BASELINE);
  if (profile.value !== BASELINE) stop('unsupported_profile', 3, profile.path);
  const strings = select('strings', { profile: CODEPOINT });
  if (strings.value.profile !== CODEPOINT) stop('unsupported_profile', 3, `${strings.path}/profile`);
  const symbols = select('symbols', { mode: 'string-profile', profile: CODEPOINT });
  let effectiveSymbols;
  if (symbols.value.mode === 'string-profile') {
    if (symbols.value.profile !== CODEPOINT) stop('unsupported_profile', 3, `${symbols.path}/profile`);
    effectiveSymbols = { mode: 'string-profile', profile: CODEPOINT };
  } else {
    stop('unsupported_profile', 3, `${symbols.path}/mode`);
  }
  return { profile: BASELINE, strings: { profile: CODEPOINT }, symbols: effectiveSymbols };
}

function validateOperand(operand, path, limits) {
  const invalid = (at) => stop('invalid_operand', 4, at);
  if (!record(operand)) invalid(path);
  if (!SUPPORTED.has(operand.category) && !DEFERRED.has(operand.category)) invalid(pointer(path, 'category'));
  if (DEFERRED.has(operand.category)) return;
  closed(operand, ['category', 'value'], path, 'invalid_operand', 4);
  const at = pointer(path, 'value');
  if (operand.category === 'boolean') {
    if (typeof operand.value !== 'boolean') invalid(at);
  } else if (operand.category === 'finiteNumber') {
    if (typeof operand.value !== 'string') invalid(at);
    if (operand.value.length > limits.maxNumericCharacters) stop('resource_limit', 4, at);
    if (!FINITE_NUMBER.test(operand.value)) invalid(at);
  } else {
    validateText(operand.value, at, 'invalid_operand', 4, operand.category === 'symbol',
      operand.category === 'symbol' ? limits.maxSymbolScalars : limits.maxStringScalars);
  }
}

function objectAdmission(request, limit) {
  const stack = [[request, 1, false]];
  const ancestors = new Set();
  const checkedDepth = new WeakMap();
  while (stack.length) {
    const [value, depth, leaving] = stack.pop();
    if (value === null || typeof value !== 'object') continue;
    if (leaving) {
      ancestors.delete(value);
      checkedDepth.set(value, depth);
      continue;
    }
    if (depth > limit) stop('resource_limit', 1, null);
    if (ancestors.has(value)) stop('invalid_operand', 2, null);
    // Completed shared subtrees only need another visit at a greater depth.
    // Check active ancestors first so memoization cannot hide a cycle.
    if ((checkedDepth.get(value) ?? 0) >= depth) continue;
    ancestors.add(value);
    stack.push([value, depth, true]);
    for (const child of Object.values(value)) stack.push([child, depth + 1, false]);
  }
}

function evaluate(request, limits) {
  if (!record(request)) stop('invalid_operand', 2, null);
  if (!identifier(request.operation)) stop('invalid_operand', 2, '/operation');
  if (!record(request.input)) stop('invalid_operand', 2, '/input');
  for (const key of ['left', 'right']) if (!Object.hasOwn(request.input, key)) stop('invalid_operand', 2, `/input/${key}`);
  closed(request, ['operation', 'input'], '', 'invalid_operand', 2);
  closed(request.input, ['left', 'right', 'context', 'policy'], '/input', 'invalid_operand', 2);
  if (!['equal', 'compare'].includes(request.operation)) stop('unsupported_operation', 2, '/operation');
  const input = request.input;
  if (Object.hasOwn(input, 'context')) validateConfig(input.context, '/input/context', true, limits);
  if (Object.hasOwn(input, 'policy')) validateConfig(input.policy, '/input/policy', false, limits);
  const effectivePolicy = resolvePolicy(input);
  validateOperand(input.left, '/input/left', limits);
  validateOperand(input.right, '/input/right', limits);
  for (const key of ['left', 'right']) if (!SUPPORTED.has(input[key].category)) stop('unsupported_domain', 5, `/input/${key}/category`);
  if (input.left.category !== input.right.category) stop('incompatible_comparison', 5, '/input');
  const domain = input.left.category;
  const left = input.left.value; const right = input.right.value;
  let comparison;
  let method;
  if (domain === 'finiteNumber') {
    comparison = compareFiniteNumbers(left, right); method = 'exact-numeric';
  } else if (domain === 'boolean') {
    comparison = left === right ? 0 : left ? 1 : -1; method = 'boolean';
  } else { comparison = compareScalars(left, right); method = 'string-profile'; }
  const symbol = request.operation === 'equal' ? (comparison === 0 ? 'equal' : 'notEqual')
    : comparison < 0 ? 'less' : comparison > 0 ? 'greater' : 'equal';
  return {
    outcome: 'value', value: { category: 'symbol', value: symbol },
    metadata: { effectivePolicy: { ...effectivePolicy, domain, comparison: method } },
  };
}

function guarded(action) {
  try { return action(); }
  catch (error) { if (error instanceof OperationFailure) return error.result; throw error; }
}

/** Typed logical API. Numeric text is never converted through a host float. */
export function evaluateAeonicComparison(request, options = {}) {
  const limits = limitsFor(options);
  return guarded(() => { objectAdmission(request, limits.maxRequestDepth); return evaluate(request, limits); });
}

/** Exact logical JSON ingress. Byte/depth guards run before strict decoding. */
export function evaluateAeonicComparisonText(requestText, options = {}) {
  if (!scalar(requestText)) throw new TypeError('requestText must be Unicode scalar text');
  const limits = limitsFor(options);
  return guarded(() => {
    if (new TextEncoder().encode(requestText).byteLength > limits.maxRequestBytes || exceedsJsonDepth(requestText, limits.maxRequestDepth)) {
      stop('resource_limit', 1, null);
    }
    let request;
    try { request = parseStrictJson(requestText); }
    catch (error) { if (error instanceof SyntaxError) stop('invalid_operand', 2, null); throw error; }
    return evaluate(request, limits);
  });
}

/** Structured CTS ingress checks depth before invoking the host serializer. */
export function evaluateAeonicComparisonStructuredJson(request, options = {}) {
  const limits = limitsFor(options);
  return guarded(() => {
    objectAdmission(request, limits.maxRequestDepth);
    return evaluateAeonicComparisonText(JSON.stringify(request), options);
  });
}

export { BASELINE as AEONIC_COMPARISON_BASELINE_PROFILE, CODEPOINT as AEONIC_COMPARISON_CODEPOINT_PROFILE };
