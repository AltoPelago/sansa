// Adapted from Aeonic exact arithmetic at 9433ce2d57200dec2efe50ed0c02bf6b74e636e9.
// Copyright (c) 2026 Patrik. MIT; see LICENSE and docs/aeonic-arithmetic.md.
import { FINITE_NUMBER } from './aeonic-exact-number.js';
import { exceedsJsonDepth, parseStrictJson } from './aeonic-json.js';

export const AEONIC_ARITHMETIC_PROFILE = 'aeonic.operations.arithmetic.exact.v1';
export const AEONIC_ARITHMETIC_DEFAULT_RESOURCE_LIMITS = Object.freeze({
  maxRequestBytes: 4194304, maxRequestDepth: 32, maxNumericCharacters: 65536,
  maxCoefficientDigits: 65536, maxExponentMagnitude: 1000000,
  maxWorkspaceDigits: 131072, maxOutputCharacters: 65536,
});
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

// Count only through the allowance; avoid a whole-input TextEncoder buffer.
function utf8ByteLength(text, limit) {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > limit) break;
  }
  return bytes;
}

const DEFERRED = new Set(['string', 'boolean', 'symbol', 'positiveInfinity', 'negativeInfinity',
  'nan', 'explicitNull', 'explicitAbsence', 'toggle', 'hex', 'radix', 'encoding',
  'separator', 'sansaAddress', 'referenceForm', 'temporal', 'container']);
const HISTORY = ['none-declared', 'approximation-declared'];
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const scalar = (v) => typeof v === 'string' && !/[\uD800-\uDFFF]/u.test(v);
const identifier = (v) => scalar(v) && v.length > 0;
const pointer = (p, k) => p === null || !scalar(String(k)) ? null
  : `${p}/${String(k).replaceAll('~', '~0').replaceAll('/', '~1')}`;
class Failure extends Error {
  constructor(reason, stage, path) {
    super(reason); this.result = { outcome: 'diagnostic', reason, context: { stage, path } };
  }
}
const stop = (r, s, p) => { throw new Failure(r, s, p); };
function configured(options) {
  if (!record(options) || Object.keys(options).some((k) => k !== 'resourceLimits')) throw new TypeError('Invalid trusted options');
  const supplied = Object.hasOwn(options, 'resourceLimits') ? options.resourceLimits : {};
  if (!record(supplied)) throw new TypeError('resourceLimits must be an object');
  for (const [k, v] of Object.entries(supplied)) {
    if (!Object.hasOwn(AEONIC_ARITHMETIC_DEFAULT_RESOURCE_LIMITS, k) || !Number.isSafeInteger(v) || v < 0) throw new TypeError('Invalid resource limit: ' + k);
  }
  return { ...AEONIC_ARITHMETIC_DEFAULT_RESOURCE_LIMITS, ...supplied };
}
function closed(v, fields, p, r, s) {
  for (const k of Object.keys(v).sort(compareScalars)) if (!fields.includes(k)) stop(r, s, pointer(p, k));
}
function required(v, fields, p, r, s) {
  for (const k of fields) if (!Object.hasOwn(v, k)) stop(r, s, pointer(p, k));
}
function admission(v, limit) {
  const stack = [[v, 1, false]], active = new Set(), checked = new WeakMap();
  while (stack.length) {
    const [item, depth, leaving] = stack.pop();
    if (item === null || typeof item !== 'object') continue;
    if (leaving) { active.delete(item); checked.set(item, depth); continue; }
    if (depth > limit) stop('resource_limit', 1, null);
    if (active.has(item)) stop('invalid_operand', 2, null);
    if ((checked.get(item) ?? 0) >= depth) continue;
    active.add(item); stack.push([item, depth, true]);
    for (const child of Object.values(item)) stack.push([child, depth + 1, false]);
  }
}
function structuredText(value, limit, depthLimit) {
  const pending = [{ value, depth: 1 }], pieces = [], active = new Set();
  let bytes = 0;
  function append(text) {
    bytes += utf8ByteLength(text, limit - bytes);
    if (bytes > limit) stop('resource_limit', 1, null);
    pieces.push(text);
  }
  while (pending.length) {
    const task = pending.pop();
    if (task.frame) {
      const { item, array, keys, index, depth } = task;
      const length = array ? item.length : keys.length;
      if (index === length) { append(array ? ']' : '}'); active.delete(item); continue; }
      if (index) append(',');
      const key = array ? index : keys[index];
      if (!array) {
        if (key.length > limit) stop('resource_limit', 1, null);
        append(JSON.stringify(key)); append(':');
      }
      pending.push({ ...task, index: index + 1 }, { value: item[key], depth: depth + 1 });
      continue;
    }
    const item = task.value;
    if (item !== null && typeof item === 'object') {
      if (task.depth > depthLimit) stop('resource_limit', 1, null);
      if (active.has(item)) stop('invalid_operand', 2, null);
      const array = Array.isArray(item);
      append(array ? '[' : '{');
      active.add(item);
      pending.push({ frame: true, item, array, keys: array ? null : Object.keys(item), index: 0, depth: task.depth });
    } else {
      if (typeof item === 'string' && item.length > limit) stop('resource_limit', 1, null);
      const encoded = JSON.stringify(item);
      if (encoded === undefined) throw new TypeError('Structured ingress requires JSON values');
      append(encoded);
    }
  }
  return pieces.join('');
}
function selection(input, materialize) {
  for (const key of ['context', 'policy']) {
    if (!Object.hasOwn(input, key)) {
      if (key === 'policy' && materialize) stop('invalid_policy', 3, '/input/policy');
      continue;
    }
    const v = input[key], p = '/input/' + key;
    if (!record(v)) stop('invalid_policy', 3, p);
    if (key === 'policy' && materialize) required(v, ['family'], p, 'invalid_policy', 3);
    closed(v, key === 'policy' && materialize ? ['profile', 'family', 'zeroSign'] : ['profile'], p, 'invalid_policy', 3);
  }
  for (const key of ['context', 'policy']) {
    if (!Object.hasOwn(input, key)) continue;
    const v = input[key], p = '/input/' + key;
    if (Object.hasOwn(v, 'profile') && !identifier(v.profile)) stop('invalid_policy', 3, p + '/profile');
    if (key === 'policy' && materialize) {
      if (!['integer', 'decimal', 'exponent'].includes(v.family)) stop('invalid_policy', 3, p + '/family');
      if (Object.hasOwn(v, 'zeroSign') && !['positive', 'negative'].includes(v.zeroSign)) stop('invalid_policy', 3, p + '/zeroSign');
    }
  }
  const policy = input.policy ?? {}, context = input.context ?? {};
  const owner = Object.hasOwn(policy, 'profile') ? 'policy' : Object.hasOwn(context, 'profile') ? 'context' : null;
  if (owner && input[owner].profile !== AEONIC_ARITHMETIC_PROFILE) stop('unsupported_profile', 3, '/input/' + owner + '/profile');
  return { profile: AEONIC_ARITHMETIC_PROFILE, ...(materialize ? { family: policy.family, zeroSign: policy.zeroSign ?? 'positive' } : {}) };
}
const abs = (v) => v < 0n ? -v : v;
function bounds(c, e, limits, stage, path) {
  if (c.replace('-', '').length > limits.maxCoefficientDigits || abs(e) > BigInt(limits.maxExponentMagnitude)) stop('resource_limit', stage, path);
}
function normalize(c, e) {
  if (c === '0' || c === '-0') return { c: '0', e: 0n };
  const trimmed = c.replace(/0+$/u, '');
  return { c: trimmed, e: e + BigInt(c.length - trimmed.length) };
}
function operand(bundle, p, limits) {
  if (!record(bundle)) stop('invalid_operand', 4, p);
  required(bundle, ['number'], p, 'invalid_operand', 4);
  const number = bundle.number, np = p + '/number';
  if (!record(number)) stop('invalid_operand', 4, np);
  if (!['finiteNumber', 'exactNumber'].includes(number.category) && !DEFERRED.has(number.category)) stop('invalid_operand', 4, np + '/category');
  if (number.category === 'exactNumber') required(bundle, ['history'], p, 'invalid_operand', 4);
  closed(bundle, ['number', 'history'], p, 'invalid_operand', 4);
  const history = Object.hasOwn(bundle, 'history') ? bundle.history : HISTORY[0];
  if (!HISTORY.includes(history)) stop('invalid_operand', 4, p + '/history');
  if (DEFERRED.has(number.category)) return { deferred: true, history };
  const fields = number.category === 'finiteNumber' ? ['value'] : ['coefficient', 'exponent'];
  required(number, fields, np, 'invalid_operand', 4);
  closed(number, ['category', ...fields], np, 'invalid_operand', 4);
  let count = 0;
  for (const k of fields) {
    if (typeof number[k] !== 'string') stop('invalid_operand', 4, np + '/' + k);
    for (const character of number[k]) {
      if (++count > limits.maxNumericCharacters) stop('resource_limit', 4, np + '/' + k);
    }
    const valid = k === 'value' ? FINITE_NUMBER.test(number[k])
      : k === 'coefficient' ? /^(?:0|-?[1-9](?:[0-9]*[1-9])?)$(?![\s\S])/u.test(number[k])
        : /^(?:0|-?[1-9][0-9]*)$(?![\s\S])/u.test(number[k]);
    if (!valid) stop('invalid_operand', 4, np + '/' + k);
  }
  let c, e;
  if (number.category === 'exactNumber') {
    c = number.coefficient; e = BigInt(number.exponent);
    if (c === '0' && e !== 0n) stop('invalid_operand', 4, np + '/exponent');
    if (c.replace('-', '').length > limits.maxCoefficientDigits) stop('resource_limit', 4, np + '/coefficient');
    if (abs(e) > BigInt(limits.maxExponentMagnitude)) stop('resource_limit', 4, np + '/exponent');
  } else {
    const [mantissa, exponent = '0'] = number.value.toLowerCase().split('e');
    e = BigInt(exponent);
    const at = np + '/value';
    if (abs(e) > BigInt(limits.maxExponentMagnitude)) stop('resource_limit', 4, at);
    const negative = mantissa.startsWith('-');
    const unsigned = mantissa.replace(/^[+-]/u, '');
    const [integer, fraction = ''] = unsigned.split('.');
    const digits = (integer + fraction).replace(/^0+/u, '') || '0';
    ({ c, e } = normalize((negative && digits !== '0' ? '-' : '') + digits, e - BigInt(fraction.length)));
    bounds(c, e, limits, 4, at);
  }
  return { c, e, history };
}
function calculate(op, a, b, limits) {
  let result;
  const x = BigInt(a.c), y = BigInt(b.c);
  if (op === 'multiply' && (x === 0n || y === 0n)) result = { c: '0', e: 0n };
  else if (op !== 'multiply' && x === 0n) result = { c: (op === 'subtract' ? -y : y).toString(), e: b.e };
  else if (op !== 'multiply' && y === 0n) result = { c: a.c, e: a.e };
  else if (op !== 'multiply' && a.e === b.e && x === (op === 'subtract' ? y : -y)) result = { c: '0', e: 0n };
  else if (op === 'multiply') {
    if (BigInt(a.c.replace('-', '').length + b.c.replace('-', '').length) > BigInt(limits.maxWorkspaceDigits)) stop('resource_limit', 6, null);
    result = normalize((x * y).toString(), a.e + b.e);
  } else {
    const e = a.e < b.e ? a.e : b.e;
    for (const v of [a, b]) {
      if (BigInt(v.c.replace('-', '').length) + v.e - e > BigInt(limits.maxWorkspaceDigits)) stop('resource_limit', 6, null);
    }
    const left = x * 10n ** (a.e - e), right = y * 10n ** (b.e - e);
    result = normalize((op === 'add' ? left + right : left - right).toString(), e);
  }
  bounds(result.c, result.e, limits, 6, null);
  return result;
}
function render(a, policy, limits) {
  const { c, e } = a;
  if (policy.family === 'integer' && c !== '0' && e < 0n) stop('unrepresentable_result', 7, null);
  const negative = c.startsWith('-') || (c === '0' && policy.zeroSign === 'negative');
  const digits = c.replace('-', ''), sign = negative ? '-' : '';
  const width = BigInt(digits.length), point = width + e;
  let length;
  if (policy.family === 'exponent') length = width + 1n + BigInt(e.toString().length);
  else if (policy.family === 'integer') length = width + e;
  else length = e >= 0n ? width + e + 2n : point > 0n ? width + 1n : 2n - point + width;
  if (length + BigInt(sign.length) > BigInt(limits.maxOutputCharacters)) stop('resource_limit', 7, null);
  if (policy.family === 'exponent') return sign + digits + 'e' + e;
  if (policy.family === 'integer') return sign + digits + '0'.repeat(Number(e));
  if (e >= 0n) return sign + digits + '0'.repeat(Number(e)) + '.0';
  if (point > 0n) return sign + digits.slice(0, Number(point)) + '.' + digits.slice(Number(point));
  return sign + '0.' + '0'.repeat(Number(-point)) + digits;
}
function evaluate(request, limits) {
  if (!record(request)) stop('invalid_operand', 2, null);
  required(request, ['operation', 'input'], '', 'invalid_operand', 2);
  if (!identifier(request.operation)) stop('invalid_operand', 2, '/operation');
  if (!record(request.input)) stop('invalid_operand', 2, '/input');
  closed(request, ['operation', 'input'], '', 'invalid_operand', 2);
  const input = request.input;
  closed(input, ['left', 'right', 'value', 'context', 'policy'], '/input', 'invalid_operand', 2);
  if (!['add', 'subtract', 'multiply', 'materialize'].includes(request.operation)) stop('unsupported_operation', 2, '/operation');
  const materialize = request.operation === 'materialize', keys = materialize ? ['value'] : ['left', 'right'];
  required(input, keys, '/input', 'invalid_operand', 2);
  closed(input, [...keys, 'context', 'policy'], '/input', 'invalid_operand', 2);
  const policy = selection(input, materialize);
  const operands = keys.map((key) => operand(input[key], '/input/' + key, limits));
  for (const [i, value] of operands.entries()) if (value.deferred) stop('unsupported_domain', 5, '/input/' + keys[i] + '/number/category');
  const history = operands.some((v) => v.history === HISTORY[1]) ? HISTORY[1] : HISTORY[0];
  const number = materialize ? { category: 'finiteNumber', value: render(operands[0], policy, limits) }
    : (() => { const v = calculate(request.operation, ...operands, limits); return { category: 'exactNumber', coefficient: v.c, exponent: v.e.toString() }; })();
  return { outcome: 'value', value: { number, history }, metadata: { evaluation: 'exact-for-operands', effectivePolicy: policy } };
}
function guarded(action) {
  try { return action(); } catch (e) { if (e instanceof Failure) return e.result; throw e; }
}
export function evaluateAeonicArithmetic(request, options = {}) {
  const limits = configured(options);
  return guarded(() => { admission(request, limits.maxRequestDepth); return evaluate(request, limits); });
}
export function evaluateAeonicArithmeticText(text, options = {}) {
  if (!scalar(text)) throw new TypeError('requestText must be Unicode scalar text');
  const limits = configured(options);
  return guarded(() => {
    if (utf8ByteLength(text, limits.maxRequestBytes) > limits.maxRequestBytes || exceedsJsonDepth(text, limits.maxRequestDepth)) stop('resource_limit', 1, null);
    let request;
    try { request = parseStrictJson(text); } catch (e) { if (e instanceof SyntaxError) stop('invalid_operand', 2, null); throw e; }
    return evaluate(request, limits);
  });
}
export function evaluateAeonicArithmeticStructuredJson(request, options = {}) {
  const limits = configured(options);
  return guarded(() => {
    return evaluateAeonicArithmeticText(structuredText(request, limits.maxRequestBytes, limits.maxRequestDepth), options);
  });
}
