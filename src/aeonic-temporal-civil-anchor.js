// Adapted from AltoPelago/aeonic at 4efb42be227c1b1cd458a53155cebd51ffcc0154.
// Copyright (c) 2026 Patrik. MIT; see LICENSE and docs/aeonic-temporal-civil-anchor.md.
// Bounded UTF-8 counting keeps native/text APIs usable in browser workers.
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

export const AEONIC_TEMPORAL_CIVIL_ANCHOR_PROFILE = 'aeonic.operations.temporal.civil-anchor.v1';
export const AEONIC_TEMPORAL_CIVIL_ANCHOR_DEFAULT_RESOURCE_LIMITS = Object.freeze({ maxRequestBytes: 65536, maxRequestDepth: 32,
  maxTemporalCharacters: 1024, maxInputRanges: 128, maxInputPieces: 512, maxRelativeDayDigits: 256,
  maxFractionDigits: 256, maxWork: 16384, maxIntermediatePieces: 4096, maxOutputPieces: 512, maxResultBytes: 131072 });
const TAGS = new Set(['civilClock', 'civilClockSet', 'civilDateTime', 'civilDateTimeSet', 'civilDate', 'civilDateSet', 'finiteNumber', 'exactNumber', 'exactRational',
  'string', 'boolean', 'symbol', 'positiveInfinity', 'negativeInfinity', 'nan', 'explicitNull', 'explicitAbsence', 'toggle',
  'hex', 'radix', 'encoding', 'separator', 'sansaAddress', 'referenceForm', 'temporal', 'container']);
const CLOCKS = ['hour', 'minute', 'second'], GRAINS = ['day', 'month', 'year'];
const NONE = 'none-declared', APPROX = 'approximation-declared';
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
    if (!Object.hasOwn(AEONIC_TEMPORAL_CIVIL_ANCHOR_DEFAULT_RESOURCE_LIMITS, k) || !Number.isSafeInteger(v) || v < 0) throw new TypeError('Invalid resource limit: ' + k);
  }
  const capabilities = Object.hasOwn(options, 'capabilities') ? options.capabilities : ['anchoring'];
  if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some(k => typeof k !== 'string' || k !== 'anchoring') || new Set(capabilities).size !== capabilities.length) throw new TypeError('Invalid trusted capabilities');
  return { limits: { ...AEONIC_TEMPORAL_CIVIL_ANCHOR_DEFAULT_RESOURCE_LIMITS, ...supplied }, available: new Set(capabilities.map(() => 'anchor')) };
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
const fullText = n => { const d = date(n); return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; };
function literal(text, path, limits, full = false) {
  if (typeof text !== 'string') stop('invalid_operand', 4, path);
  characters([text], limits.maxTemporalCharacters, path);
  const pattern = full ? /^[0-9]{4}-[0-9]{2}-[0-9]{2}$(?![\s\S])/u : /^(?:[0-9]{4}-|[0-9]{4}-[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2})$(?![\s\S])/u;
  if (typeof text !== 'string' || !pattern.test(text)) stop('invalid_operand', 4, path);
  const y = Number(text.slice(0, 4)), m = text.length > 5 ? Number(text.slice(5, 7)) : 1, d = text.length > 7 ? Number(text.slice(8)) : 1;
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > monthLength(y, m)) stop('invalid_operand', 4, path);
  const granularity = text.length === 5 ? 'year' : text.length === 7 ? 'month' : 'day';
  const start = ordinal(y, m, d), end = granularity === 'year' ? yearStart(y + 1) - 1 : granularity === 'month' ? ordinal(y, m, monthLength(y, m)) : start;
  return { ranges: [[start, end]], granularity };
}
function characters(values, limit, path) {
  let n = 0; for (const value of values) for (const ch of value) if (++n > limit) stop('resource_limit', 4, path);
}
// Relative days and fractions stay textual. Only an admitted seven-digit
// calendar offset is converted; no BigInt, epoch seconds or fraction grid.
const C = (day, s, f = '') => ({ day, s, f });
function signedCompare(a, b) {
  const an = a.startsWith('-'), bn = b.startsWith('-');
  if (an !== bn) return an ? -1 : 1;
  const x = an ? a.slice(1) : a, y = bn ? b.slice(1) : b;
  const order = x.length !== y.length ? x.length < y.length ? -1 : 1 : x === y ? 0 : x < y ? -1 : 1;
  return an ? -order : order;
}
const cmp = (a, b) => signedCompare(a.day, b.day) || (a.s !== b.s ? a.s < b.s ? -1 : 1 : a.f === b.f ? 0 : a.f < b.f ? -1 : 1);
const same = (a, b) => cmp(a, b) === 0;
const piece = (lo, hi = lo, il = true, ih = true) => ({ lo, hi, il, ih });
function dateOperand(v, limits, path) {
  if (!record(v)) stop('invalid_operand', 4, path);
  required(v, ['temporal'], path, 'invalid_operand', 4);
  const t = v.temporal, at = path + '/temporal';
  if (!record(t)) stop('invalid_operand', 4, at);
  if (typeof t.category !== 'string' || !TAGS.has(t.category)) stop('invalid_operand', 4, at + '/category');
  if (t.category === 'civilDateSet') required(v, ['originGranularity', 'history'], path, 'invalid_operand', 4);
  closed(v, ['temporal', 'originGranularity', 'history'], path, 'invalid_operand', 4);
  const history = Object.hasOwn(v, 'history') ? v.history : NONE;
  if (![NONE, 'clamping-declared'].includes(history)) stop('invalid_operand', 4, path + '/history');
  if (Object.hasOwn(v, 'originGranularity') && ![...GRAINS, 'undeclared'].includes(v.originGranularity)) stop('invalid_operand', 4, path + '/originGranularity');
  if (!['civilDate', 'civilDateSet'].includes(t.category)) return { deferred: true };
  if (t.category === 'civilDate') {
    required(t, ['value'], at, 'invalid_operand', 4); closed(t, ['category', 'value'], at, 'invalid_operand', 4);
    if (limits.maxInputRanges < 1) stop('resource_limit', 4, at);
    const parsed = literal(t.value, at + '/value', limits);
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
    const start = literal(r.start, p + '/start', limits, true).ranges[0][0], end = literal(r.end, p + '/end', limits, true).ranges[0][0];
    if (start > end) stop('invalid_operand', 4, p + '/end');
    if (ranges.length && start <= ranges.at(-1)[1] + 1) stop('invalid_operand', 4, p + '/start');
    ranges.push([start, end]);
  }
  return { ranges, origin: v.originGranularity, history };
}
function fields(text, path, limits, authored = false) {
  if (typeof text !== 'string') stop('invalid_operand', 4, path);
  characters([text], limits.maxTemporalCharacters, path);
  const pattern = authored ? /^([0-9]{2}):(?:([0-9]{2})(?::([0-9]{2})(?:\.([0-9]+))?)?)?$(?![\s\S])/u
    : /^([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?$(?![\s\S])/u;
  const m = pattern.exec(text); if (!m) stop('invalid_operand', 4, path);
  const [_, hh, mm, ss, raw = ''] = m;
  if (raw.length > limits.maxFractionDigits) stop('resource_limit', 4, path);
  const f = raw.replace(/0+$/u, '');
  if (!authored && f !== raw) stop('invalid_operand', 4, path);
  if (Number(hh) > 23 || Number(mm ?? 0) > 59 || Number(ss ?? 0) > 59) stop('invalid_operand', 4, path);
  return { seconds: Number(hh) * 3600 + Number(mm ?? 0) * 60 + Number(ss ?? 0), f,
    clock: ss !== undefined ? 'second' : mm !== undefined ? 'minute' : 'hour' };
}
function coordinate(v, path, limits) {
  if (!record(v)) stop('invalid_operand', 4, path);
  required(v, ['day', 'time'], path, 'invalid_operand', 4); closed(v, ['day', 'time'], path, 'invalid_operand', 4);
  if (typeof v.day !== 'string') stop('invalid_operand', 4, path + '/day');
  characters([v.day.startsWith('-') ? v.day.slice(1) : v.day], limits.maxRelativeDayDigits, path + '/day');
  if (!/^(?:0|-?[1-9][0-9]*)$(?![\s\S])/u.test(v.day)) stop('invalid_operand', 4, path + '/day');
  const t = fields(v.time, path + '/time', limits);
  return C(v.day, t.seconds, t.f);
}
function clockOperand(v, limits, path) {
  if (!record(v)) stop('invalid_operand', 4, path);
  required(v, ['temporal'], path, 'invalid_operand', 4);
  const t = v.temporal, at = path + '/temporal';
  if (!record(t)) stop('invalid_operand', 4, at);
  if (typeof t.category !== 'string' || !TAGS.has(t.category)) stop('invalid_operand', 4, at + '/category');
  if (t.category === 'civilClockSet') required(v, ['originClockForm', 'history'], path, 'invalid_operand', 4);
  closed(v, ['temporal', 'originClockForm', 'history'], path, 'invalid_operand', 4);
  const h = Object.hasOwn(v, 'history') ? v.history : NONE;
  if (![NONE, APPROX].includes(h)) stop('invalid_operand', 4, path + '/history');
  if (Object.hasOwn(v, 'originClockForm') && ![...CLOCKS, 'undeclared'].includes(v.originClockForm)) stop('invalid_operand', 4, path + '/originClockForm');
  if (!['civilClock', 'civilClockSet'].includes(t.category)) return { deferred: true };
  let pieces, form;
  if (t.category === 'civilClock') {
    required(t, ['value'], at, 'invalid_operand', 4); closed(t, ['category', 'value'], at, 'invalid_operand', 4);
    form = fields(t.value, at + '/value', limits, true);
    if (limits.maxRelativeDayDigits < 1 || limits.maxInputPieces < 1) stop('resource_limit', 4, at);
    const lo = C('0', form.seconds, form.f), width = form.clock === 'second' ? 0 : form.clock === 'minute' ? 60 : 3600;
    pieces = [piece(lo, width ? C(String(Math.floor((lo.s + width) / 86400)), (lo.s + width) % 86400) : lo, true, !width)];
  } else {
    required(t, ['pieces'], at, 'invalid_operand', 4); closed(t, ['category', 'pieces'], at, 'invalid_operand', 4);
    if (!Array.isArray(t.pieces) || !t.pieces.length) stop('invalid_operand', 4, at + '/pieces');
    if (t.pieces.length > limits.maxInputPieces) stop('resource_limit', 4, at + '/pieces');
    pieces = [];
    for (let i = 0; i < t.pieces.length; i++) {
      const p = t.pieces[i], where = at + '/pieces/' + i;
      if (!record(p)) stop('invalid_operand', 4, where);
      required(p, ['kind'], where, 'invalid_operand', 4);
      if (!['point', 'interval'].includes(p.kind)) stop('invalid_operand', 4, where + '/kind');
      const keys = p.kind === 'point' ? ['at'] : ['start', 'end', 'includeStart', 'includeEnd'];
      required(p, keys, where, 'invalid_operand', 4); closed(p, ['kind', ...keys], where, 'invalid_operand', 4);
      const lp = where + (p.kind === 'point' ? '/at' : '/start');
      const lo = coordinate(p.kind === 'point' ? p.at : p.start, lp, limits); let q;
      if (p.kind === 'point') q = piece(lo);
      else {
        const hi = coordinate(p.end, where + '/end', limits);
        for (const key of ['includeStart', 'includeEnd']) if (typeof p[key] !== 'boolean') stop('invalid_operand', 4, where + '/' + key);
        if (cmp(lo, hi) >= 0) stop('invalid_operand', 4, where + '/end');
        q = piece(lo, hi, p.includeStart, p.includeEnd);
      }
      const previous = pieces.at(-1);
      if (previous && (cmp(previous.hi, q.lo) > 0 || same(previous.hi, q.lo) && (previous.ih || q.il))) stop('invalid_operand', 4, lp);
      pieces.push(q);
    }
  }
  return { pieces, history: h, origin: v.originClockForm ?? form?.clock ?? 'undeclared' };
}
function selection(input) {
  for (const key of ['context', 'policy']) {
    if (!Object.hasOwn(input, key)) continue;
    if (!record(input[key])) stop('invalid_policy', 3, '/input/' + key);
    closed(input[key], ['profile'], '/input/' + key, 'invalid_policy', 3);
  }
  for (const key of ['context', 'policy']) if (Object.hasOwn(input[key] ?? {}, 'profile') && !identifier(input[key].profile)) stop('invalid_policy', 3, '/input/' + key + '/profile');
  const p = input.policy ?? {};
  const owner = Object.hasOwn(p, 'profile') ? 'policy' : Object.hasOwn(input.context ?? {}, 'profile') ? 'context' : null;
  if (!owner) stop('invalid_policy', 3, '/input/policy/profile');
  if (input[owner].profile !== AEONIC_TEMPORAL_CIVIL_ANCHOR_PROFILE) stop('unsupported_profile', 3, '/input/' + owner + '/profile');
  return { profile: AEONIC_TEMPORAL_CIVIL_ANCHOR_PROFILE };
}
class PlannedText { constructor(length, render) { this.length = length; this.render = render; } }
function target(c, anchor, excludedEnd = false) {
  if (signedCompare(c.day, String(1 - anchor)) < 0 || signedCompare(c.day, String(LAST + 1 - anchor)) > 0) stop('unrepresentable_result', 7, null);
  const n = anchor + Number(c.day);
  if (n === LAST + 1 && !(excludedEnd && c.s === 0 && c.f === '')) stop('unrepresentable_result', 7, null);
  return n;
}
function coordinatePlan(c, anchor, excludedEnd = false) {
  const n = target(c, anchor, excludedEnd);
  if (n === LAST + 1) return { boundary: 'endOfDomain' };
  return new PlannedText(19 + (c.f ? c.f.length + 1 : 0), () => fullText(n) + 'T' +
    `${String(Math.floor(c.s / 3600)).padStart(2, '0')}:${String(Math.floor(c.s / 60) % 60).padStart(2, '0')}:${String(c.s % 60).padStart(2, '0')}${c.f ? '.' + c.f : ''}`);
}
function evaluate(request, limits, available) {
  if (!record(request)) stop('invalid_operand', 2, null);
  required(request, ['operation', 'input'], '', 'invalid_operand', 2);
  closed(request, ['operation', 'input'], '', 'invalid_operand', 2);
  if (!record(request.input)) stop('invalid_operand', 2, '/input');
  const input = request.input;
  closed(input, ['anchor', 'clock', 'context', 'policy'], '/input', 'invalid_operand', 2);
  if (!identifier(request.operation)) stop('invalid_operand', 2, '/operation');
  if (!available.has(request.operation)) stop('unsupported_operation', 2, '/operation');
  required(input, ['anchor', 'clock'], '/input', 'invalid_operand', 2);
  const policy = selection(input), a = dateOperand(input.anchor, limits, '/input/anchor'), c = clockOperand(input.clock, limits, '/input/clock');
  if (a.deferred) stop('unsupported_domain', 5, '/input/anchor/temporal/category');
  if (c.deferred) stop('unsupported_domain', 5, '/input/clock/temporal/category');
  if (a.ranges.length + c.pieces.length > limits.maxWork || c.pieces.length > limits.maxIntermediatePieces) stop('resource_limit', 6, null);
  if (a.ranges.length !== 1 || a.ranges[0][0] !== a.ranges[0][1]) stop('incompatible_operand', 6, '/input/anchor/temporal');
  const anchor = a.ranges[0][0];
  // Check every covered endpoint/domain before output admission and text planning.
  for (const p of c.pieces) { target(p.lo, anchor); target(p.hi, anchor, !same(p.lo, p.hi) && !p.ih); }
  if (c.pieces.length > limits.maxOutputPieces) stop('resource_limit', 7, null);
  const pieces = c.pieces.map(p => same(p.lo, p.hi) ? { kind: 'point', at: coordinatePlan(p.lo, anchor) }
    : { kind: 'interval', start: coordinatePlan(p.lo, anchor), end: coordinatePlan(p.hi, anchor, !p.ih), includeStart: p.il, includeEnd: p.ih });
  return finish({ outcome: 'value', value: { temporal: { category: 'civilDateTimeSet', pieces },
    originDateGranularity: a.origin, originClockForm: c.origin,
    history: { clamping: a.history, approximation: c.history } },
    metadata: { evaluation: 'exact-for-policy', clamping: 'not-applied', effectivePolicy: policy } }, limits);
}
function finish(planned, limits) {
  let size = 0; const stack = [planned];
  while (stack.length) {
    const v = stack.pop();
    if (v instanceof PlannedText) size += v.length + 2;
    else if (typeof v === 'string') size += v.length + 2;
    else if (typeof v === 'boolean') size += v ? 4 : 5;
    else if (Array.isArray(v)) { size += 2 + Math.max(0, v.length - 1); for (const x of v) stack.push(x); }
    else { const keys = Object.keys(v); size += 2 + Math.max(0, keys.length - 1); for (const k of keys) { size += k.length + 3; stack.push(v[k]); } }
    if (size > limits.maxResultBytes) stop('resource_limit', 7, null);
  }
  const render = v => v instanceof PlannedText ? v.render() : Array.isArray(v) ? v.map(render) : record(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, render(x)])) : v;
  return render(planned);
}
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
export function evaluateAeonicCivilAnchorText(text, options = {}) {
  const { limits, available } = configured(options);
  if (typeof text !== 'string') throw new TypeError('requestText must be text');
  return guarded(() => {
    if (!scalar(text)) stop('invalid_operand', 1, null);
    if (text.length > limits.maxRequestBytes || utf8Bytes(text, limits.maxRequestBytes) > limits.maxRequestBytes || exceedsJsonDepth(text, limits.maxRequestDepth)) stop('resource_limit', 1, null);
    let request; try { request = parseStrictJson(text); } catch (e) { if (e instanceof SyntaxError) stop('invalid_operand', 2, null); throw e; }
    return evaluate(request, limits, available);
  });
}
export function evaluateAeonicCivilAnchorStructuredJson(request, options = {}) {
  const { limits } = configured(options);
  return guarded(() => evaluateAeonicCivilAnchorText(structuredText(request, limits), options));
}
export const evaluateAeonicCivilAnchor = evaluateAeonicCivilAnchorStructuredJson;
