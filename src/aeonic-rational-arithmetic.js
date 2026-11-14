// Adapted from Aeonic rational arithmetic/convenience at 64347f19181041f86135e958da5a16ecc4b60b57.
// Copyright (c) 2026 Patrik. MIT; see LICENSE and docs/aeonic-rational-arithmetic.md.
import { FINITE_NUMBER } from './aeonic-exact-number.js';
import { exceedsJsonDepth, parseStrictJson } from './aeonic-json.js';
import { RationalJsonNumber } from './aeonic-rational-json.js';

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

export const AEONIC_RATIONAL_ARITHMETIC_PROFILE = 'aeonic.operations.arithmetic.rational.v1';
export const AEONIC_RATIONAL_ARITHMETIC_DEFAULT_RESOURCE_LIMITS = Object.freeze({
  maxRequestBytes: 16384, maxRequestDepth: 32, maxNumericCharacters: 1024,
  maxCoefficientDigits: 512, maxDenominatorDigits: 512, maxExponentMagnitude: 1000000,
  maxWorkspaceDigits: 4096, maxOutputCharacters: 1024,
});
const FINITE_PROFILE = 'aeonic.operations.arithmetic.exact.v1';
const MODES = new Set(['half-even', 'half-away-from-zero', 'half-toward-zero',
  'toward-zero', 'away-from-zero', 'floor', 'ceiling']);
const DEFERRED = new Set(['string', 'boolean', 'symbol', 'positiveInfinity', 'negativeInfinity',
  'nan', 'explicitNull', 'explicitAbsence', 'toggle', 'hex', 'radix', 'encoding',
  'separator', 'sansaAddress', 'referenceForm', 'temporal', 'container']);
const NONE = 'none-declared', MARKED = 'approximation-declared';
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const scalar = (v) => typeof v === 'string' && !/[\uD800-\uDFFF]/u.test(v);
const identifier = (v) => scalar(v) && v.length > 0;
const abs = (n) => n < 0n ? -n : n;
const digits = (n) => abs(n).toString().length;
const zero = () => ({ c: 0n, e: 0n, d: 1n });
const pointer = (p, k) => !scalar(k) ? null : p + '/' + k.replaceAll('~', '~0').replaceAll('/', '~1');
const COEFFICIENT = /^(?:0|-?[1-9](?:[0-9]*[1-9])?)$(?![\s\S])/u;
const EXPONENT = /^(?:0|-?[1-9][0-9]*)$(?![\s\S])/u;
const DENOMINATOR = /^[1-9][0-9]*$(?![\s\S])/u;
class Failure extends Error {
  constructor(reason, stage, path) {
    super(reason); this.result = { outcome: 'diagnostic', reason, context: { stage, path } };
  }
}
function stop(reason, stage, path) { throw new Failure(reason, stage, path); }
function required(value, fields, path, reason, stage) {
  for (const field of fields) if (!Object.hasOwn(value, field)) stop(reason, stage, pointer(path, field));
}
function closed(value, fields, path, reason, stage) {
  for (const field of Object.keys(value).sort(compareScalars)) {
    if (!fields.includes(field)) stop(reason, stage, pointer(path, field));
  }
}
function configured(options) {
  if (!record(options) || Object.keys(options).some((k) => k !== 'resourceLimits')) throw new TypeError('Invalid trusted options');
  const supplied = Object.hasOwn(options, 'resourceLimits') ? options.resourceLimits : {};
  if (!record(supplied)) throw new TypeError('resourceLimits must be an object');
  for (const [k, v] of Object.entries(supplied)) {
    if (!Object.hasOwn(AEONIC_RATIONAL_ARITHMETIC_DEFAULT_RESOURCE_LIMITS, k) || !Number.isSafeInteger(v) || v < 0) {
      throw new TypeError('Invalid resource limit: ' + k);
    }
  }
  return { ...AEONIC_RATIONAL_ARITHMETIC_DEFAULT_RESOURCE_LIMITS, ...supplied };
}
function characters(texts, allowance, stage, path) {
  let count = 0;
  for (const text of texts) for (const character of text) {
    if (++count > allowance) stop('resource_limit', stage, path);
  }
}
function exponent(text, limits, stage, path) {
  // Grammar is checked by the caller. Compare the magnitude lexically before
  // converting: even an all-zero authored coefficient must pass this guard.
  const magnitude = text.replace(/^[+-]/u, '').replace(/^0+/u, '') || '0';
  const bound = String(limits.maxExponentMagnitude);
  if (magnitude.length > bound.length || (magnitude.length === bound.length && magnitude > bound)) {
    stop('resource_limit', stage, path);
  }
  const value = BigInt(magnitude);
  return text.startsWith('-') ? -value : value;
}
function stringBounds(c, e, limits, stage, path) {
  if (c.replace(/^-/, '').length > limits.maxCoefficientDigits) stop('resource_limit', stage, path);
  if (abs(e) > BigInt(limits.maxExponentMagnitude)) stop('resource_limit', stage, path);
}
function resultBounds(value, limits) {
  if (digits(value.c) > limits.maxCoefficientDigits) stop('resource_limit', 6, null);
  if (abs(value.e) > BigInt(limits.maxExponentMagnitude)) stop('resource_limit', 6, null);
  if (value.d !== 1n && digits(value.d) > limits.maxDenominatorDigits) stop('resource_limit', 6, null);
  return value;
}
function gcd(a, b) {
  a = abs(a); b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
function strip(c, e, d = 1n) {
  if (c === 0n) return zero();
  const source = c.toString(), trimmed = source.replace(/0+$/u, '');
  return { c: BigInt(trimmed), e: e + BigInt(source.length - trimmed.length), d };
}
function authored(value, limits, path) {
  if (typeof value !== 'string') stop('invalid_operand', 4, path);
  characters([value], limits.maxNumericCharacters, 4, path);
  if (!FINITE_NUMBER.test(value)) stop('invalid_operand', 4, path);
  const [mantissa, original = '0'] = value.toLowerCase().split('e');
  let e = exponent(original, limits, 4, path);
  const negative = mantissa.startsWith('-');
  const [integer, fraction = ''] = mantissa.replace(/^[+-]/u, '').split('.');
  let c = (integer + fraction).replace(/^0+/u, '') || '0';
  if (c === '0') e = 0n;
  else {
    const trimmed = c.replace(/0+$/u, '');
    e += BigInt(c.length - trimmed.length) - BigInt(fraction.length);
    c = (negative ? '-' : '') + trimmed;
  }
  stringBounds(c, e, limits, 4, path);
  return { c: BigInt(c), e, d: 1n };
}
function derived(number, limits, path, increment = false) {
  const stage = increment ? 3 : 4, reason = increment ? 'invalid_policy' : 'invalid_operand';
  const rational = !increment && number.category === 'exactRational';
  const fields = rational ? ['coefficient', 'exponent', 'denominator'] : ['coefficient', 'exponent'];
  required(number, fields, path, reason, stage);
  closed(number, ['category', ...fields], path, reason, stage);
  for (const field of fields) if (typeof number[field] !== 'string') stop(reason, stage, path + '/' + field);
  characters(fields.map((k) => number[k]), limits.maxNumericCharacters, stage, path + '/coefficient');
  characters([number.coefficient.replace(/^-/, '')], limits.maxCoefficientDigits, stage, path + '/coefficient');
  const c = number.coefficient;
  if (!COEFFICIENT.test(c) || (rational && c === '0') || (increment && (c === '0' || c.startsWith('-')))) {
    stop(reason, stage, path + '/coefficient');
  }
  if (!EXPONENT.test(number.exponent)) stop(reason, stage, path + '/exponent');
  const e = exponent(number.exponent, limits, stage, path + '/exponent');
  if (c === '0' && e !== 0n) stop(reason, stage, path + '/exponent');
  let d = 1n;
  if (rational) {
    characters([number.denominator], limits.maxDenominatorDigits, stage, path + '/denominator');
    if (!DENOMINATOR.test(number.denominator)) stop(reason, stage, path + '/denominator');
    d = BigInt(number.denominator);
    if (d <= 1n || d % 2n === 0n || d % 5n === 0n) stop(reason, stage, path + '/denominator');
  }
  const coefficient = BigInt(c);
  if (rational && gcd(coefficient, d) !== 1n) stop(reason, stage, path + '/denominator');
  return { c: coefficient, e, d };
}
function operand(bundle, limits, path) {
  if (!record(bundle)) stop('invalid_operand', 4, path);
  required(bundle, ['number'], path, 'invalid_operand', 4);
  const number = bundle.number, at = path + '/number';
  if (!record(number)) stop('invalid_operand', 4, at);
  if (!['finiteNumber', 'exactNumber', 'exactRational'].includes(number.category) && !DEFERRED.has(number.category)) {
    stop('invalid_operand', 4, at + '/category');
  }
  if (['exactNumber', 'exactRational'].includes(number.category)) required(bundle, ['history'], path, 'invalid_operand', 4);
  closed(bundle, ['number', 'history'], path, 'invalid_operand', 4);
  const history = Object.hasOwn(bundle, 'history') ? bundle.history : NONE;
  if (![NONE, MARKED].includes(history)) stop('invalid_operand', 4, path + '/history');
  if (DEFERRED.has(number.category)) return { deferred: true, history };
  if (number.category === 'finiteNumber') {
    required(number, ['value'], at, 'invalid_operand', 4);
    closed(number, ['category', 'value'], at, 'invalid_operand', 4);
    return { ...authored(number.value, limits, at + '/value'), history };
  }
  return { ...derived(number, limits, at), history };
}
function selection(input, operation, limits) {
  const unary = operation === 'quantize' || operation === 'materialize';
  for (const key of ['context', 'policy']) {
    const path = '/input/' + key;
    if (!Object.hasOwn(input, key)) {
      if (key === 'policy' && unary) stop('invalid_policy', 3, path);
      continue;
    }
    const value = input[key];
    if (!record(value)) stop('invalid_policy', 3, path);
    if (key === 'policy' && unary) required(value, operation === 'quantize' ? ['increment', 'rounding'] : ['family'], path, 'invalid_policy', 3);
    const extra = key !== 'policy' ? [] : operation === 'quantize' ? ['increment', 'rounding']
      : operation === 'materialize' ? ['family', 'zeroSign'] : [];
    closed(value, ['profile', ...extra], path, 'invalid_policy', 3);
  }
  for (const key of ['context', 'policy']) {
    if (Object.hasOwn(input[key] ?? {}, 'profile') && !identifier(input[key].profile)) {
      stop('invalid_policy', 3, '/input/' + key + '/profile');
    }
  }
  const policy = input.policy ?? {}, context = input.context ?? {};
  let increment;
  if (operation === 'quantize') {
    const at = '/input/policy/increment', value = policy.increment;
    if (!record(value)) stop('invalid_policy', 3, at);
    required(value, ['category'], at, 'invalid_policy', 3);
    if (value.category !== 'exactNumber') stop('invalid_policy', 3, at + '/category');
    increment = derived(value, limits, at, true);
    if (!MODES.has(policy.rounding)) stop('invalid_policy', 3, '/input/policy/rounding');
  } else if (operation === 'materialize') {
    if (!['integer', 'decimal', 'exponent'].includes(policy.family)) stop('invalid_policy', 3, '/input/policy/family');
    if (Object.hasOwn(policy, 'zeroSign') && !['positive', 'negative'].includes(policy.zeroSign)) {
      stop('invalid_policy', 3, '/input/policy/zeroSign');
    }
  }
  const owner = Object.hasOwn(policy, 'profile') ? 'policy' : Object.hasOwn(context, 'profile') ? 'context' : null;
  const profile = owner ? input[owner].profile : FINITE_PROFILE;
  if (profile !== AEONIC_RATIONAL_ARITHMETIC_PROFILE) stop('unsupported_profile', 3, owner ? '/input/' + owner + '/profile' : null);
  const effective = { profile };
  if (operation === 'quantize') Object.assign(effective, { increment: descriptor(increment), rounding: policy.rounding });
  if (operation === 'materialize') Object.assign(effective, { family: policy.family, zeroSign: policy.zeroSign ?? 'positive' });
  return { effective, increment };
}
function workspace(width, limits) {
  if (width > BigInt(limits.maxWorkspaceDigits)) stop('resource_limit', 6, null);
}
const width = (n) => BigInt(digits(n));
const max = (a, b) => a > b ? a : b;
function multiply(a, b, limits) {
  if (a.c === 0n || b.c === 0n) return zero();
  const sign = (a.c < 0n) !== (b.c < 0n) ? -1n : 1n;
  const g1 = gcd(a.c, b.d), g2 = gcd(b.c, a.d);
  const A = abs(a.c) / g1, B = abs(b.c) / g2, C = a.d / g2, D = b.d / g1;
  workspace(max(width(A) + width(B), width(C) + width(D)), limits);
  return strip(sign * A * B, a.e + b.e, C * D);
}
function divide(a, b, limits) {
  if (b.c === 0n) stop('division_by_zero', 6, '/input/right/number');
  if (a.c === 0n) return zero();
  const sign = (a.c < 0n) !== (b.c < 0n) ? -1n : 1n;
  const g1 = gcd(a.c, b.c), g2 = gcd(b.d, a.d);
  const A = abs(a.c) / g1, B = b.d / g2, D = a.d / g2;
  let C = abs(b.c) / g1, twos = 0n, fives = 0n;
  while (C % 2n === 0n) { C /= 2n; twos++; }
  while (C % 5n === 0n) { C /= 5n; fives++; }
  const t = max(twos, fives), p2 = t - twos, p5 = t - fives;
  const extra = (p2 ? 302n * p2 / 1000n + 1n : 0n) + (p5 ? 699n * p5 / 1000n + 1n : 0n);
  workspace(max(width(A) + width(B) + extra, width(C) + width(D)), limits);
  return { c: sign * A * B * (2n ** p2) * (5n ** p5), e: a.e - b.e - t, d: C * D };
}
function add(a, b, subtract, limits) {
  const right = subtract ? -b.c : b.c;
  if (a.c === 0n) return { c: right, e: b.e, d: b.d };
  if (right === 0n) return { c: a.c, e: a.e, d: a.d };
  if (a.e === b.e && a.d === b.d && a.c === -right) return zero();
  const g = gcd(a.d, b.d), sl = b.d / g, sr = a.d / g, e = a.e < b.e ? a.e : b.e;
  const xl = width(a.c) + width(sl) + a.e - e, xr = width(right) + width(sr) + b.e - e;
  workspace(max(max(xl, xr) + 1n, width(a.d) + width(sl)), limits);
  let c = a.c * sl * (10n ** (a.e - e)) + right * sr * (10n ** (b.e - e));
  let d = a.d * sl;
  const reduced = gcd(c, d); c /= reduced; d /= reduced;
  return strip(c, e, d);
}
function compareScaled(a, ea, b, eb) {
  const left = a.toString(), right = b.toString();
  const wa = BigInt(left.length) + ea, wb = BigInt(right.length) + eb;
  if (wa !== wb) return wa < wb ? -1 : 1;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? '0', y = right[i] ?? '0';
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
function roundingUp(mode, sign, half, whole = 0n) {
  if (mode === 'toward-zero') return false;
  if (mode === 'away-from-zero') return true;
  if (mode === 'floor') return sign < 0n;
  if (mode === 'ceiling') return sign > 0n;
  return half > 0 || (half === 0 && (mode === 'half-away-from-zero' || (mode === 'half-even' && whole % 2n === 1n)));
}
function quantize(value, increment, mode, limits) {
  if (value.c === 0n) return zero();
  const sign = value.c < 0n ? -1n : 1n;
  const q = divide({ c: abs(value.c), e: value.e, d: value.d }, increment, limits);
  if (q.d === 1n && q.e >= 0n) return { c: value.c, e: value.e, d: value.d };
  if (compareScaled(q.c, q.e, q.d, 0n) < 0) {
    workspace(max(width(q.c) + 1n, width(q.d)), limits);
    const half = compareScaled(2n * q.c, q.e, q.d, 0n);
    return roundingUp(mode, sign, half) ? { c: sign * increment.c, e: increment.e, d: 1n } : zero();
  }
  workspace(max(width(q.c) + max(q.e, 0n), width(q.d) + max(-q.e, 0n)), limits);
  const n = q.c * (10n ** max(q.e, 0n)), d = q.d * (10n ** max(-q.e, 0n));
  let k = n / d;
  const r = n % d, complement = d - r, half = r < complement ? -1 : r > complement ? 1 : 0;
  if (r && roundingUp(mode, sign, half, k)) k++;
  if (k === 0n) return zero();
  workspace(width(k) + width(increment.c), limits);
  return strip(sign * k * increment.c, increment.e);
}
function descriptor(value) {
  return { category: value.d === 1n ? 'exactNumber' : 'exactRational',
    coefficient: value.c.toString(), exponent: value.e.toString(),
    ...(value.d === 1n ? {} : { denominator: value.d.toString() }) };
}
function render(value, policy, limits) {
  if (value.d !== 1n || (policy.family === 'integer' && value.c !== 0n && value.e < 0n)) {
    stop('unrepresentable_result', 7, null);
  }
  const a = abs(value.c).toString(), e = value.e, w = BigInt(a.length), point = w + e;
  const sign = value.c < 0n || (value.c === 0n && policy.zeroSign === 'negative') ? '-' : '';
  const scientific = e + w - 1n;
  const length = policy.family === 'integer' ? w + e : policy.family === 'exponent'
    ? w + (w > 1n ? 1n : 0n) + 1n + BigInt(scientific.toString().length)
    : e >= 0n ? w + e + 2n : point > 0n ? w + 1n : 2n - point + w;
  if (length + BigInt(sign.length) > BigInt(limits.maxOutputCharacters)) stop('resource_limit', 7, null);
  if (policy.family === 'exponent') return sign + a[0] + (a.length > 1 ? '.' + a.slice(1) : '') + 'e' + scientific;
  if (policy.family === 'integer') return sign + a + '0'.repeat(Number(e));
  if (e >= 0n) return sign + a + '0'.repeat(Number(e)) + '.0';
  if (point > 0n) return sign + a.slice(0, Number(point)) + '.' + a.slice(Number(point));
  return sign + '0.' + '0'.repeat(Number(-point)) + a;
}
function evaluate(request, limits) {
  if (!record(request)) stop('invalid_operand', 2, null);
  required(request, ['operation', 'input'], '', 'invalid_operand', 2);
  if (!identifier(request.operation)) stop('invalid_operand', 2, '/operation');
  if (!record(request.input)) stop('invalid_operand', 2, '/input');
  closed(request, ['operation', 'input'], '', 'invalid_operand', 2);
  const input = request.input, operation = request.operation;
  closed(input, ['left', 'right', 'value', 'context', 'policy'], '/input', 'invalid_operand', 2);
  if (!['add', 'subtract', 'multiply', 'divide', 'quantize', 'materialize'].includes(operation)) stop('unsupported_operation', 2, '/operation');
  const keys = ['quantize', 'materialize'].includes(operation) ? ['value'] : ['left', 'right'];
  required(input, keys, '/input', 'invalid_operand', 2);
  closed(input, [...keys, 'context', 'policy'], '/input', 'invalid_operand', 2);
  const selected = selection(input, operation, limits);
  const values = keys.map((key) => operand(input[key], limits, '/input/' + key));
  for (const [i, value] of values.entries()) if (value.deferred) stop('unsupported_domain', 5, '/input/' + keys[i] + '/number/category');
  let history = values.some((value) => value.history === MARKED) ? MARKED : NONE;
  let evaluation = 'exact-for-operands', number;
  if (operation === 'materialize') number = { category: 'finiteNumber', value: render(values[0], selected.effective, limits) };
  else {
    const [a, b] = values;
    const result = operation === 'multiply' ? multiply(a, b, limits)
      : operation === 'divide' ? divide(a, b, limits)
        : operation === 'quantize' ? quantize(a, selected.increment, selected.effective.rounding, limits)
          : add(a, b, operation === 'subtract', limits);
    resultBounds(result, limits);
    if (operation === 'quantize' && (a.c !== result.c || a.e !== result.e || a.d !== result.d)) {
      history = MARKED; evaluation = 'rounded-for-operands';
    }
    number = descriptor(result);
  }
  return { outcome: 'value', value: { number, history }, metadata: { evaluation, effectivePolicy: selected.effective } };
}
function guarded(action) {
  try { return action(); } catch (error) { if (error instanceof Failure) return error.result; throw error; }
}
function structuredText(value, limits) {
  const stack = [{ value, depth: 1 }], active = new Set(), pieces = [];
  let bytes = 0;
  function append(text) {
    bytes += utf8ByteLength(text, limits.maxRequestBytes - bytes);
    if (bytes > limits.maxRequestBytes) stop('resource_limit', 1, null);
    pieces.push(text);
  }
  while (stack.length) {
    const task = stack.pop();
    if (task.frame) {
      const { item, array, keys, index, depth } = task, length = array ? item.length : keys.length;
      if (index === length) { append(array ? ']' : '}'); active.delete(item); continue; }
      if (index) append(',');
      const key = array ? index : keys[index];
      if (!array) {
        if (key.length > limits.maxRequestBytes) stop('resource_limit', 1, null);
        append(JSON.stringify(key)); append(':');
      }
      stack.push({ ...task, index: index + 1 }, { value: item[key], depth: depth + 1 });
      continue;
    }
    const item = task.value;
    if (item instanceof RationalJsonNumber) {
      if (item.text.length > limits.maxRequestBytes) stop('resource_limit', 1, null);
      append(item.text);
    } else if (item !== null && typeof item === 'object') {
      if (task.depth > limits.maxRequestDepth) stop('resource_limit', 1, null);
      if (active.has(item)) stop('invalid_operand', 2, null);
      const array = Array.isArray(item);
      if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) {
        throw new TypeError('Structured ingress requires JSON values');
      }
      append(array ? '[' : '{'); active.add(item);
      stack.push({ frame: true, item, array, keys: array ? null : Object.keys(item), index: 0, depth: task.depth });
    } else {
      if (typeof item === 'string' && item.length > limits.maxRequestBytes) stop('resource_limit', 1, null);
      if (typeof item === 'number' && !Number.isFinite(item)) throw new TypeError('Structured ingress requires JSON values');
      const text = JSON.stringify(item);
      if (text === undefined) throw new TypeError('Structured ingress requires JSON values');
      append(text);
    }
  }
  return pieces.join('');
}
export function evaluateAeonicRationalArithmeticText(text, options = {}) {
  if (!scalar(text)) throw new TypeError('requestText must be Unicode scalar text');
  const limits = configured(options);
  return guarded(() => {
    if (utf8ByteLength(text, limits.maxRequestBytes) > limits.maxRequestBytes || exceedsJsonDepth(text, limits.maxRequestDepth)) stop('resource_limit', 1, null);
    let request;
    try { request = parseStrictJson(text); } catch (error) {
      if (error instanceof SyntaxError) stop('invalid_operand', 2, null);
      throw error;
    }
    return evaluate(request, limits);
  });
}
export function evaluateAeonicRationalArithmeticStructuredJson(request, options = {}) {
  const limits = configured(options);
  return guarded(() => evaluateAeonicRationalArithmeticText(structuredText(request, limits), options));
}
export const evaluateAeonicRationalArithmetic = evaluateAeonicRationalArithmeticStructuredJson;
