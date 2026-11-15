// Adapted from AltoPelago/aeonic at 627219ac90fdd09d17bfd0a3c25db717305d1d0f.
// Copyright (c) 2026 Patrik. MIT; see LICENSE and docs/aeonic-temporal-civil-date.md.
// Bounded UTF-8 count keeps the adapted engine usable in browser workers.
function utf8Bytes(text, allowance) {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > allowance) break;
  }
  return bytes;
}
import { exceedsJsonDepth, parseStrictJson } from './aeonic-json.js';
import { RationalJsonNumber } from './aeonic-rational-json.js';

export const AEONIC_TEMPORAL_CIVIL_DATE_PROFILE = 'aeonic.operations.temporal.civil-date.v1';
export const AEONIC_TEMPORAL_CIVIL_DATE_DEFAULT_RESOURCE_LIMITS = Object.freeze({ maxRequestBytes: 16384, maxRequestDepth: 32,
  maxInputRanges: 128, maxCountCharacters: 32, maxOutputRanges: 128, maxCalendarWork: 4096,
  maxOutputCharacters: 10, maxResultBytes: 16384 });
const OPERATIONS = { relations: ['equal', 'compare', 'relate'], calendar: ['shift', 'step', 'materialize'] };
const DEFERRED = new Set(['finiteNumber', 'exactNumber', 'exactRational', 'string', 'boolean', 'symbol',
  'positiveInfinity', 'negativeInfinity', 'nan', 'explicitNull', 'explicitAbsence', 'toggle', 'hex', 'radix',
  'encoding', 'separator', 'sansaAddress', 'referenceForm', 'temporal', 'container']);
const GRAINS = ['day', 'month', 'year'], NONE = 'none-declared', MARKED = 'clamping-declared';
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const scalar = v => typeof v === 'string' && !/[\uD800-\uDFFF]/u.test(v);
const identifier = v => scalar(v) && v.length > 0;
const pointer = (p, k) => scalar(k) ? p + '/' + k.replaceAll('~', '~0').replaceAll('/', '~1') : null;
function scalarOrder(a, b) {
  const x = a[Symbol.iterator](), y = b[Symbol.iterator]();
  for (;;) { const p = x.next(), q = y.next();
    if (p.done || q.done) return p.done === q.done ? 0 : p.done ? -1 : 1;
    if (p.value !== q.value) return p.value.codePointAt(0) - q.value.codePointAt(0);
  }
}
class Failure extends Error {
  constructor(reason, stage, path) { super(reason); this.result = { outcome: 'diagnostic', reason, context: { stage, path } }; }
}
function stop(reason, stage, path) { throw new Failure(reason, stage, path); }
function guarded(action) { try { return action(); } catch (e) { if (e instanceof Failure) return e.result; throw e; } }
function required(v, fields, path, reason, stage) {
  for (const k of fields) if (!Object.hasOwn(v, k)) stop(reason, stage, pointer(path, k));
}
function closed(v, fields, path, reason, stage) {
  for (const k of Object.keys(v).sort(scalarOrder)) if (!fields.includes(k)) stop(reason, stage, pointer(path, k));
}
function configured(options) {
  if (!record(options) || Object.keys(options).some(k => !['resourceLimits', 'capabilities'].includes(k))) throw new TypeError('Invalid trusted options');
  const supplied = Object.hasOwn(options, 'resourceLimits') ? options.resourceLimits : {};
  if (!record(supplied)) throw new TypeError('resourceLimits must be an object');
  for (const [k, v] of Object.entries(supplied)) {
    if (!Object.hasOwn(AEONIC_TEMPORAL_CIVIL_DATE_DEFAULT_RESOURCE_LIMITS, k) || !Number.isSafeInteger(v) || v < 0) throw new TypeError('Invalid resource limit: ' + k);
  }
  const capabilities = Object.hasOwn(options, 'capabilities') ? options.capabilities : ['relations', 'calendar'];
  if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some(k => typeof k !== 'string' || !Object.hasOwn(OPERATIONS, k)) || new Set(capabilities).size !== capabilities.length) throw new TypeError('Invalid trusted capabilities');
  return { limits: { ...AEONIC_TEMPORAL_CIVIL_DATE_DEFAULT_RESOURCE_LIMITS, ...supplied }, available: new Set(capabilities.flatMap(k => OPERATIONS[k])) };
}

// Pure civil calendar: no host Date, timezone or floating-point epoch conversion.
const leap = y => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const monthLength = (y, m) => m === 2 ? leap(y) ? 29 : 28 : [4, 6, 9, 11].includes(m) ? 30 : 31;
const yearStart = y => 365 * (y - 1) + Math.floor((y - 1) / 4) - Math.floor((y - 1) / 100) + Math.floor((y - 1) / 400) + 1;
function ordinal(y, m, d) { let n = yearStart(y) + d - 1; for (let k = 1; k < m; k++) n += monthLength(y, k); return n; }
const LAST = yearStart(10000) - 1;
function date(n) {
  let lo = 1, hi = 9999;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (yearStart(mid) <= n) lo = mid; else hi = mid - 1; }
  let m = 1, d = n - yearStart(lo) + 1;
  while (d > monthLength(lo, m)) { d -= monthLength(lo, m); m++; }
  return { y: lo, m, d };
}
const monthIndex = d => 12 * (d.y - 1) + d.m - 1;
const monthAt = n => ({ y: Math.floor(n / 12) + 1, m: n % 12 + 1 });
const fullText = n => { const d = date(n); return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; };
function literal(text, path, full = false) {
  const pattern = full ? /^[0-9]{4}-[0-9]{2}-[0-9]{2}$(?![\s\S])/u : /^(?:[0-9]{4}-|[0-9]{4}-[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2})$(?![\s\S])/u;
  if (typeof text !== 'string' || !pattern.test(text)) stop('invalid_operand', 4, path);
  const y = Number(text.slice(0, 4)), m = text.length > 5 ? Number(text.slice(5, 7)) : 1, d = text.length > 7 ? Number(text.slice(8)) : 1;
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > monthLength(y, m)) stop('invalid_operand', 4, path);
  const granularity = text.length === 5 ? 'year' : text.length === 7 ? 'month' : 'day';
  const start = ordinal(y, m, d), end = granularity === 'year' ? yearStart(y + 1) - 1 : granularity === 'month' ? ordinal(y, m, monthLength(y, m)) : start;
  return { ranges: [[start, end]], granularity };
}
function operand(v, limits, path) {
  if (!record(v)) stop('invalid_operand', 4, path);
  required(v, ['temporal'], path, 'invalid_operand', 4);
  const t = v.temporal, at = path + '/temporal';
  if (!record(t)) stop('invalid_operand', 4, at);
  if (typeof t.category !== 'string' || (!['civilDate', 'civilDateSet'].includes(t.category) && !DEFERRED.has(t.category))) stop('invalid_operand', 4, at + '/category');
  if (t.category === 'civilDateSet') required(v, ['originGranularity', 'history'], path, 'invalid_operand', 4);
  closed(v, ['temporal', 'originGranularity', 'history'], path, 'invalid_operand', 4);
  const history = Object.hasOwn(v, 'history') ? v.history : NONE;
  if (![NONE, MARKED].includes(history)) stop('invalid_operand', 4, path + '/history');
  if (Object.hasOwn(v, 'originGranularity') && ![...GRAINS, 'undeclared'].includes(v.originGranularity)) stop('invalid_operand', 4, path + '/originGranularity');
  if (DEFERRED.has(t.category)) return { deferred: true };
  if (t.category === 'civilDate') {
    required(t, ['value'], at, 'invalid_operand', 4); closed(t, ['category', 'value'], at, 'invalid_operand', 4);
    if (limits.maxInputRanges < 1) stop('resource_limit', 4, at);
    const parsed = literal(t.value, at + '/value');
    return { ranges: parsed.ranges, origin: v.originGranularity ?? parsed.granularity, history };
  }
  required(t, ['ranges'], at, 'invalid_operand', 4); closed(t, ['category', 'ranges'], at, 'invalid_operand', 4);
  if (!Array.isArray(t.ranges) || !t.ranges.length) stop('invalid_operand', 4, at + '/ranges');
  if (t.ranges.length > limits.maxInputRanges) stop('resource_limit', 4, at + '/ranges');
  const ranges = [];
  for (let i = 0; i < t.ranges.length; i++) {
    const r = t.ranges[i], p = at + '/ranges/' + i;
    if (!record(r)) stop('invalid_operand', 4, p);
    required(r, ['start', 'end'], p, 'invalid_operand', 4); closed(r, ['start', 'end'], p, 'invalid_operand', 4);
    const start = literal(r.start, p + '/start', true).ranges[0][0], end = literal(r.end, p + '/end', true).ranges[0][0];
    if (start > end) stop('invalid_operand', 4, p + '/end');
    if (ranges.length && start <= ranges.at(-1)[1] + 1) stop('invalid_operand', 4, p + '/start');
    ranges.push([start, end]);
  }
  return { ranges, origin: v.originGranularity, history };
}
function selection(input, op, limits) {
  const extras = op === 'shift' ? ['unit', 'count'] : op === 'step' ? ['granularity', 'count'] : op === 'materialize' ? ['granularity'] : [];
  for (const key of ['context', 'policy']) {
    const path = '/input/' + key;
    if (!Object.hasOwn(input, key)) { if (key === 'policy' && extras.length) stop('invalid_policy', 3, path); continue; }
    if (!record(input[key])) stop('invalid_policy', 3, path);
    if (key === 'policy') required(input[key], extras, path, 'invalid_policy', 3);
    closed(input[key], ['profile', ...(key === 'policy' ? extras : [])], path, 'invalid_policy', 3);
  }
  for (const key of ['context', 'policy']) if (Object.hasOwn(input[key] ?? {}, 'profile') && !identifier(input[key].profile)) stop('invalid_policy', 3, '/input/' + key + '/profile');
  const p = input.policy ?? {};
  if (op === 'shift' && !['day', 'month', 'year', 'eom', 'eoy'].includes(p.unit)) stop('invalid_policy', 3, '/input/policy/unit');
  if (['step', 'materialize'].includes(op) && !GRAINS.includes(p.granularity)) stop('invalid_policy', 3, '/input/policy/granularity');
  if (['shift', 'step'].includes(op)) {
    if (typeof p.count !== 'string') stop('invalid_policy', 3, '/input/policy/count');
    let characters = 0;
    for (const ch of p.count) if (++characters > limits.maxCountCharacters) stop('resource_limit', 3, '/input/policy/count');
    if (!/^(?:0|-?[1-9][0-9]*)$(?![\s\S])/u.test(p.count)) stop('invalid_policy', 3, '/input/policy/count');
  }
  const owner = Object.hasOwn(p, 'profile') ? 'policy' : Object.hasOwn(input.context ?? {}, 'profile') ? 'context' : null;
  if (!owner || input[owner].profile !== AEONIC_TEMPORAL_CIVIL_DATE_PROFILE) stop('unsupported_profile', 3, owner ? '/input/' + owner + '/profile' : null);
  return { profile: AEONIC_TEMPORAL_CIVIL_DATE_PROFILE, ...Object.fromEntries(extras.map(k => [k, p[k]])) };
}
function countValue(text, unit) {
  const magnitude = text.replace(/^-/, ''), bound = String(unit === 'day' ? LAST : ['month', 'eom'].includes(unit) ? 119988 : 9999);
  if (magnitude.length > bound.length || (magnitude.length === bound.length && magnitude > bound)) stop('unrepresentable_result', 6, null);
  return Number(text); // At most seven digits, after lexical domain guard.
}
function period(ranges, grain) {
  if (ranges.length !== 1) return false;
  const [a, b] = ranges[0], d = date(a);
  return grain === 'day' ? a === b : grain === 'month' ? d.d === 1 && b === ordinal(d.y, d.m, monthLength(d.y, d.m)) : a === yearStart(d.y) && b === yearStart(d.y + 1) - 1;
}
function domain(ranges, unit, count) {
  const first = ranges[0][0], last = ranges.at(-1)[1];
  const within = (a, b, lo, hi) => { if (a < lo || b > hi) stop('unrepresentable_result', 6, null); };
  if (unit === 'day') within(first + count, last + count, 1, LAST);
  else if (unit === 'eoy') within(date(first).y + count, date(last).y + count, 1, 9999);
  else { const n = unit === 'year' ? count * 12 : count; within(monthIndex(date(first)) + n, monthIndex(date(last)) + n, 0, 119987); }
}
function work(ranges, op, unit, count, limits, right) {
  let total = op === 'step' || op === 'materialize' ? 1 : right ? ranges.length + right.length : 0;
  if (!right && op === 'shift') for (const [a, b] of ranges) {
    total += count === 0 || unit === 'day' ? 1 : unit === 'eoy' ? date(b).y - date(a).y + 1 : monthIndex(date(b)) - monthIndex(date(a)) + 1;
    if (total > limits.maxCalendarWork) stop('resource_limit', 6, null);
  }
  if (total > limits.maxCalendarWork) stop('resource_limit', 6, null);
}
function append(ranges, a, b, limits) {
  if (ranges.length && a <= ranges.at(-1)[1] + 1) ranges.at(-1)[1] = Math.max(b, ranges.at(-1)[1]);
  else { if (ranges.length >= limits.maxOutputRanges) stop('resource_limit', 6, null); ranges.push([a, b]); }
}
function image(ranges, unit, count, limits) {
  const output = []; let clamped = false;
  for (const [start, end] of ranges) {
    if (unit === 'day' || count === 0) { append(output, start + (unit === 'day' ? count : 0), end + (unit === 'day' ? count : 0), limits); continue; }
    let a = start;
    while (a <= end) {
      const source = date(a);
      if (unit === 'eoy') {
        const b = Math.min(end, yearStart(source.y + 1) - 1), target = source.y + count;
        const offset = (leap(target) ? 366 : 365) - (leap(source.y) ? 366 : 365);
        const first = a - yearStart(source.y) + 1 + offset, last = b - yearStart(source.y) + 1 + offset;
        clamped ||= first < 1;
        append(output, yearStart(target) + Math.max(1, first) - 1, yearStart(target) + Math.max(1, last) - 1, limits); a = b + 1;
      } else {
        const sourceLength = monthLength(source.y, source.m), b = Math.min(end, ordinal(source.y, source.m, sourceLength));
        const target = monthAt(monthIndex(source) + (unit === 'year' ? 12 * count : count)), length = monthLength(target.y, target.m);
        const first = source.d, last = date(b).d, offset = length - sourceLength;
        const map = d => unit === 'eom' ? Math.max(1, d + offset) : Math.min(d, length);
        clamped ||= unit === 'eom' ? first + offset < 1 : last > length;
        append(output, ordinal(target.y, target.m, map(first)), ordinal(target.y, target.m, map(last)), limits); a = b + 1;
      }
    }
  }
  return { ranges: output, clamped };
}
function subset(a, b) {
  let j = 0;
  for (const [start, end] of a) {
    while (j < b.length && b[j][1] < start) j++;
    if (j === b.length || b[j][0] > start || b[j][1] < end) return false;
  }
  return true;
}
function labels(a, b, op) {
  const ab = subset(a, b), ba = subset(b, a), same = ab && ba;
  if (op === 'equal') return same ? 'equal' : 'notEqual';
  if (op === 'compare') return same ? 'equal' : a.at(-1)[1] < b[0][0] ? 'before' : b.at(-1)[1] < a[0][0] ? 'after' : 'indeterminate';
  if (same || ab || ba) return same ? 'equal' : ab ? 'containedBy' : 'contains';
  let i = 0, j = 0;
  while (i < a.length && j < b.length) { if (a[i][1] < b[j][0]) i++; else if (b[j][1] < a[i][0]) j++; else return 'overlaps'; }
  return 'disjoint';
}
function resultSize(value, allowance) {
  let total = 0; const stack = [value];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === 'string') total += v.length + 2; // Successful strings are bounded ASCII without escapes.
    else if (Array.isArray(v)) { total += 2 + Math.max(0, v.length - 1); for (const x of v) stack.push(x); }
    else { const keys = Object.keys(v); total += 2 + Math.max(0, keys.length - 1); for (const k of keys) { total += k.length + 3; stack.push(v[k]); } }
    if (total > allowance) stop('resource_limit', 7, null);
  }
}
function evaluate(request, limits, available) {
  if (!record(request)) stop('invalid_operand', 2, null);
  required(request, ['operation', 'input'], '', 'invalid_operand', 2);
  if (!identifier(request.operation)) stop('invalid_operand', 2, '/operation');
  if (!record(request.input)) stop('invalid_operand', 2, '/input');
  closed(request, ['operation', 'input'], '', 'invalid_operand', 2);
  const op = request.operation, input = request.input;
  closed(input, ['left', 'right', 'value', 'context', 'policy'], '/input', 'invalid_operand', 2);
  if (!available.has(op)) stop('unsupported_operation', 2, '/operation');
  const binary = OPERATIONS.relations.includes(op), keys = binary ? ['left', 'right'] : ['value'];
  required(input, keys, '/input', 'invalid_operand', 2); closed(input, [...keys, 'context', 'policy'], '/input', 'invalid_operand', 2);
  const policy = selection(input, op, limits), values = keys.map(k => operand(input[k], limits, '/input/' + k));
  for (let i = 0; i < values.length; i++) if (values[i].deferred) stop('unsupported_domain', 5, '/input/' + keys[i] + '/temporal/category');
  const [a, b] = values; let value, clamped = false;
  if (binary) {
    work(a.ranges, op, null, 0, limits, b.ranges);
    value = { category: 'symbol', value: labels(a.ranges, b.ranges, op) };
  } else {
    if (op === 'step' && !period(a.ranges, policy.granularity)) stop('incompatible_operand', 6, '/input/value/temporal');
    const unit = op === 'shift' ? policy.unit : policy.granularity;
    const count = op === 'materialize' ? 0 : countValue(policy.count, unit);
    if (op !== 'materialize') domain(a.ranges, unit, count);
    work(a.ranges, op, unit, count, limits);
    let ranges;
    if (op === 'materialize') {
      if (!period(a.ranges, policy.granularity)) stop('unrepresentable_result', 7, null);
      const text = fullText(a.ranges[0][0]), rendered = policy.granularity === 'day' ? text : policy.granularity === 'month' ? text.slice(0, 7) : text.slice(0, 5);
      if (rendered.length > limits.maxOutputCharacters) stop('resource_limit', 7, null);
      value = { temporal: { category: 'civilDate', value: rendered }, originGranularity: a.origin, history: a.history };
    } else {
      if (op === 'step') {
        const start = a.ranges[0][0], d = date(start); ranges = [];
        if (unit === 'day') append(ranges, start + count, start + count, limits);
        else if (unit === 'year') append(ranges, yearStart(d.y + count), yearStart(d.y + count + 1) - 1, limits);
        else { const t = monthAt(monthIndex(d) + count); append(ranges, ordinal(t.y, t.m, 1), ordinal(t.y, t.m, monthLength(t.y, t.m)), limits); }
      } else { const result = image(a.ranges, unit, count, limits); ranges = result.ranges; clamped = result.clamped; }
      value = { temporal: { category: 'civilDateSet', ranges: ranges.map(([start, end]) => ({ start: fullText(start), end: fullText(end) })) }, originGranularity: a.origin, history: clamped ? MARKED : a.history };
    }
  }
  const metadata = { evaluation: 'exact-for-policy', clamping: clamped ? 'applied' : 'not-applied', effectivePolicy: policy };
  if (binary) metadata.operandHistory = { left: a.history, right: b.history };
  const result = { outcome: 'value', value, metadata }; resultSize(result, limits.maxResultBytes); return result;
}

// Structured ingress is a lazy, byte-bounded JSON rendering. Shared nodes are
// expanded only while their actual serialized bytes remain within allowance.
function structuredText(value, limits) {
  const stack = [{ value, depth: 1 }], active = new Set(), pieces = []; let bytes = 0;
  function append(text) { bytes += utf8Bytes(text, limits.maxRequestBytes - bytes); if (bytes > limits.maxRequestBytes) stop('resource_limit', 1, null); pieces.push(text); }
  while (stack.length) {
    const task = stack.pop();
    if (task.frame) {
      const { item, array, keys, index, depth } = task, length = array ? item.length : keys.length;
      if (index === length) { append(array ? ']' : '}'); active.delete(item); continue; }
      if (index) append(','); const key = array ? index : keys[index];
      if (!array) { if (key.length > limits.maxRequestBytes) stop('resource_limit', 1, null); append(JSON.stringify(key)); append(':'); }
      stack.push({ ...task, index: index + 1 }, { value: item[key], depth: depth + 1 }); continue;
    }
    const item = task.value;
    if (item instanceof RationalJsonNumber) { if (item.text.length > limits.maxRequestBytes) stop('resource_limit', 1, null); append(item.text); }
    else if (item !== null && typeof item === 'object') {
      if (task.depth > limits.maxRequestDepth) stop('resource_limit', 1, null);
      if (active.has(item)) stop('invalid_operand', 2, null);
      const array = Array.isArray(item);
      if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw new TypeError('Structured ingress requires JSON values');
      append(array ? '[' : '{'); active.add(item);
      stack.push({ frame: true, item, array, keys: array ? null : Object.keys(item), index: 0, depth: task.depth });
    } else {
      if (typeof item === 'string' && item.length > limits.maxRequestBytes) stop('resource_limit', 1, null);
      if (typeof item === 'number' && !Number.isFinite(item)) throw new TypeError('Structured ingress requires JSON values');
      const text = JSON.stringify(item); if (text === undefined) throw new TypeError('Structured ingress requires JSON values'); append(text);
    }
  }
  return pieces.join('');
}
export function evaluateAeonicTemporalText(text, options = {}) {
  const { limits, available } = configured(options);
  if (typeof text !== 'string') throw new TypeError('requestText must be text');
  return guarded(() => {
    if (!scalar(text)) stop('invalid_operand', 1, null);
    if (text.length > limits.maxRequestBytes || utf8Bytes(text, limits.maxRequestBytes) > limits.maxRequestBytes || exceedsJsonDepth(text, limits.maxRequestDepth)) stop('resource_limit', 1, null);
    let request; try { request = parseStrictJson(text); } catch (e) { if (e instanceof SyntaxError) stop('invalid_operand', 2, null); throw e; }
    return evaluate(request, limits, available);
  });
}
export function evaluateAeonicTemporalStructuredJson(request, options = {}) {
  const { limits } = configured(options);
  return guarded(() => evaluateAeonicTemporalText(structuredText(request, limits), options));
}
export const evaluateAeonicTemporal = evaluateAeonicTemporalStructuredJson;
