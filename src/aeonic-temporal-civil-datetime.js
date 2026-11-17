// Adapted from AltoPelago/aeonic at a4b3391dc678d2cc441fe661cfa669bc969086b9.
// Copyright (c) 2026 Patrik. MIT; see LICENSE and docs/aeonic-temporal-civil-datetime.md.
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

export const AEONIC_TEMPORAL_CIVIL_DATETIME_PROFILE = 'aeonic.operations.temporal.civil-datetime.v1';
export const AEONIC_TEMPORAL_CIVIL_DATETIME_DEFAULT_RESOURCE_LIMITS = Object.freeze({ maxRequestBytes: 65536, maxRequestDepth: 32,
  maxTemporalCharacters: 1024, maxInputPieces: 512, maxIntermediatePieces: 4096, maxOutputPieces: 512,
  maxWork: 16384, maxFractionDigits: 256, maxCountCharacters: 32, maxNumericCharacters: 4096,
  maxCoefficientDigits: 1024, maxExponentMagnitude: 1000000, maxWorkspaceDigits: 4096,
  maxOutputCharacters: 1024, maxResultBytes: 131072 });
const OPERATIONS = { relations: ['equal', 'compare', 'relate'], arithmetic: ['shift', 'shiftClock', 'step', 'materialize'] };
const TAGS = new Set(['civilDateTime', 'civilDateTimeSet', 'civilDate', 'civilDateSet', 'finiteNumber', 'exactNumber', 'exactRational',
  'string', 'boolean', 'symbol', 'positiveInfinity', 'negativeInfinity', 'nan', 'explicitNull', 'explicitAbsence', 'toggle',
  'hex', 'radix', 'encoding', 'separator', 'sansaAddress', 'referenceForm', 'temporal', 'container']);
const GRAINS = ['day', 'month', 'year'], CLOCKS = ['hour', 'minute', 'second'];
const NONE = 'none-declared', CLAMPED = 'clamping-declared', APPROX = 'approximation-declared';
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
    if (!Object.hasOwn(AEONIC_TEMPORAL_CIVIL_DATETIME_DEFAULT_RESOURCE_LIMITS, k) || !Number.isSafeInteger(v) || v < 0) throw new TypeError('Invalid resource limit: ' + k);
  }
  const capabilities = Object.hasOwn(options, 'capabilities') ? options.capabilities : ['relations', 'arithmetic'];
  if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some(k => typeof k !== 'string' || !Object.hasOwn(OPERATIONS, k)) || new Set(capabilities).size !== capabilities.length) throw new TypeError('Invalid trusted capabilities');
  return { limits: { ...AEONIC_TEMPORAL_CIVIL_DATETIME_DEFAULT_RESOURCE_LIMITS, ...supplied }, available: new Set(capabilities.flatMap(k => OPERATIONS[k])) };
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

// Whole civil seconds are bounded integers below 2^53; fractions remain text.
const B = LAST * 86400, C = (s, f = '') => ({ s, f });
const cmp = (a, b) => a.s !== b.s ? Math.sign(a.s - b.s) : a.f === b.f ? 0 : a.f < b.f ? -1 : 1;
const same = (a, b) => cmp(a, b) === 0;
const piece = (lo, hi = lo, il = true, ih = true) => ({ lo, hi, il, ih });
const empty = p => cmp(p.lo, p.hi) > 0 || same(p.lo, p.hi) && !(p.il && p.ih);
function fields(text, path, limits, authored = false) {
  if (typeof text !== 'string') stop('invalid_operand', 4, path);
  characters([text], limits.maxTemporalCharacters, path);
  const pattern = authored ? /^([0-9]{4}-(?:[0-9]{2}(?:-[0-9]{2})?)?)T([0-9]{2})(?::([0-9]{2})(?::([0-9]{2})(?:\.([0-9]+))?)?)?$(?![\s\S])/u
    : /^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?$(?![\s\S])/u;
  const m = pattern.exec(text); if (!m) stop('invalid_operand', 4, path);
  const [_, ds, hh, mm, ss, raw = ''] = m;
  if (raw.length > limits.maxFractionDigits) stop('resource_limit', 4, path);
  const f = raw.replace(/0+$/u, '');
  if (!authored && f !== raw) stop('invalid_operand', 4, path);
  const y = Number(ds.slice(0, 4)), mo = ds.length > 5 ? Number(ds.slice(5, 7)) : 1, d = ds.length > 7 ? Number(ds.slice(8)) : 1;
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > monthLength(y, mo) || Number(hh) > 23 || Number(mm ?? 0) > 59 || Number(ss ?? 0) > 59) stop('invalid_operand', 4, path);
  const grain = ds.length === 5 ? 'year' : ds.length === 7 ? 'month' : 'day', clock = ss !== undefined ? 'second' : mm !== undefined ? 'minute' : 'hour';
  const start = ordinal(y, mo, d), count = grain === 'year' ? (leap(y) ? 366 : 365) : grain === 'month' ? monthLength(y, mo) : 1;
  return { start, count, grain, clock, seconds: Number(hh) * 3600 + Number(mm ?? 0) * 60 + Number(ss ?? 0), f };
}
function coordinate(text, path, limits) {
  const v = fields(text, path, limits); return C((v.start - 1) * 86400 + v.seconds, v.f);
}
function expand(form) {
  const out = [], width = form.clock === 'hour' ? 3600 : form.clock === 'minute' ? 60 : 0;
  for (let i = 0; i < form.count; i++) {
    const lo = C((form.start - 1 + i) * 86400 + form.seconds, form.f);
    out.push(piece(lo, width ? C(lo.s + width) : lo, true, !width));
  }
  return out;
}
function history(v, path) {
  if (!record(v)) stop('invalid_operand', 4, path);
  required(v, ['clamping', 'approximation'], path, 'invalid_operand', 4); closed(v, ['clamping', 'approximation'], path, 'invalid_operand', 4);
  if (![NONE, CLAMPED].includes(v.clamping)) stop('invalid_operand', 4, path + '/clamping');
  if (![NONE, APPROX].includes(v.approximation)) stop('invalid_operand', 4, path + '/approximation');
  return { clamping: v.clamping, approximation: v.approximation };
}
function operand(v, limits, path) {
  if (!record(v)) stop('invalid_operand', 4, path);
  required(v, ['temporal'], path, 'invalid_operand', 4);
  const t = v.temporal, at = path + '/temporal';
  if (!record(t)) stop('invalid_operand', 4, at);
  if (typeof t.category !== 'string' || !TAGS.has(t.category)) stop('invalid_operand', 4, at + '/category');
  if (t.category === 'civilDateTimeSet') required(v, ['originDateGranularity', 'originClockForm', 'history'], path, 'invalid_operand', 4);
  closed(v, ['temporal', 'originDateGranularity', 'originClockForm', 'history'], path, 'invalid_operand', 4);
  const h = Object.hasOwn(v, 'history') ? history(v.history, path + '/history') : { clamping: NONE, approximation: NONE };
  for (const [key, allowed] of [['originDateGranularity', [...GRAINS, 'undeclared']], ['originClockForm', [...CLOCKS, 'undeclared']]]) {
    if (Object.hasOwn(v, key) && !allowed.includes(v[key])) stop('invalid_operand', 4, path + '/' + key);
  }
  if (!['civilDateTime', 'civilDateTimeSet'].includes(t.category)) return { deferred: true };
  let pieces, form;
  if (t.category === 'civilDateTime') {
    required(t, ['value'], at, 'invalid_operand', 4); closed(t, ['category', 'value'], at, 'invalid_operand', 4);
    form = fields(t.value, at + '/value', limits, true);
    if (form.count > limits.maxInputPieces) stop('resource_limit', 4, at);
    pieces = expand(form);
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
      const lowerPath = where + (p.kind === 'point' ? '/at' : '/start');
      const lo = coordinate(p.kind === 'point' ? p.at : p.start, lowerPath, limits); let q;
      if (p.kind === 'point') q = piece(lo);
      else {
        let hi, boundary = false;
        if (record(p.end)) {
          required(p.end, ['boundary'], where + '/end', 'invalid_operand', 4); closed(p.end, ['boundary'], where + '/end', 'invalid_operand', 4);
          if (p.end.boundary !== 'endOfDomain') stop('invalid_operand', 4, where + '/end/boundary');
          hi = C(B); boundary = true;
        } else hi = coordinate(p.end, where + '/end', limits);
        for (const key of ['includeStart', 'includeEnd']) if (typeof p[key] !== 'boolean') stop('invalid_operand', 4, where + '/' + key);
        if (boundary && p.includeEnd) stop('invalid_operand', 4, where + '/includeEnd');
        if (cmp(lo, hi) >= 0) stop('invalid_operand', 4, where + '/end');
        q = piece(lo, hi, p.includeStart, p.includeEnd);
      }
      const previous = pieces.at(-1);
      if (previous && (cmp(previous.hi, q.lo) > 0 || same(previous.hi, q.lo) && (previous.ih || q.il))) stop('invalid_operand', 4, lowerPath);
      pieces.push(q);
    }
  }
  return { pieces, history: h, origin: { dateGranularity: v.originDateGranularity ?? form?.grain ?? 'undeclared', clockForm: v.originClockForm ?? form?.clock ?? 'undeclared' } };
}
function characters(values, limit, path) {
  let n = 0; for (const value of values) for (const ch of value) if (++n > limit) stop('resource_limit', 4, path);
}
function exponent(text, limits, path) {
  const abs = text.replace(/^[+-]/u, '').replace(/^0+/u, '') || '0', cap = String(limits.maxExponentMagnitude);
  if (abs.length > cap.length || abs.length === cap.length && abs > cap) stop('resource_limit', 4, path);
  return (text.startsWith('-') ? -1n : 1n) * BigInt(abs);
}
function amount(v, limits, path) {
  if (!record(v)) stop('invalid_operand', 4, path);
  required(v, ['number'], path, 'invalid_operand', 4);
  const t = v.number, at = path + '/number';
  if (!record(t)) stop('invalid_operand', 4, at);
  if (typeof t.category !== 'string' || !TAGS.has(t.category)) stop('invalid_operand', 4, at + '/category');
  if (t.category === 'exactNumber') required(v, ['history'], path, 'invalid_operand', 4);
  closed(v, ['number', 'history'], path, 'invalid_operand', 4);
  const h = v.history ?? NONE; if (![NONE, APPROX].includes(h) || Object.hasOwn(v, 'history') && v.history === null) stop('invalid_operand', 4, path + '/history');
  if (!['finiteNumber', 'exactNumber'].includes(t.category)) return { deferred: true };
  let c, e;
  if (t.category === 'finiteNumber') {
    required(t, ['value'], at, 'invalid_operand', 4); closed(t, ['category', 'value'], at, 'invalid_operand', 4);
    if (typeof t.value !== 'string') stop('invalid_operand', 4, at + '/value');
    characters([t.value], limits.maxNumericCharacters, at + '/value');
    if (!/^[+-]?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$(?![\s\S])/u.test(t.value)) stop('invalid_operand', 4, at + '/value');
    const [m, x = '0'] = t.value.toLowerCase().split('e'); e = exponent(x, limits, at + '/value');
    const [whole, f = ''] = m.replace(/^[+-]/u, '').split('.'); c = (whole + f).replace(/^0+/u, '') || '0';
    if (c === '0') e = 0n;
    else { const trim = c.replace(/0+$/u, ''); e += BigInt(c.length - trim.length - f.length); c = (m.startsWith('-') ? '-' : '') + trim; }
    if (c.replace(/^-/, '').length > limits.maxCoefficientDigits || (e < 0n ? -e : e) > BigInt(limits.maxExponentMagnitude)) stop('resource_limit', 4, at + '/value');
  } else {
    required(t, ['coefficient', 'exponent'], at, 'invalid_operand', 4); closed(t, ['category', 'coefficient', 'exponent'], at, 'invalid_operand', 4);
    for (const key of ['coefficient', 'exponent']) if (typeof t[key] !== 'string') stop('invalid_operand', 4, at + '/' + key);
    characters([t.coefficient, t.exponent], limits.maxNumericCharacters, at);
    if (!/^(?:0|-?[1-9](?:[0-9]*[1-9])?)$(?![\s\S])/u.test(t.coefficient)) stop('invalid_operand', 4, at + '/coefficient');
    if (!/^(?:0|-?[1-9][0-9]*)$(?![\s\S])/u.test(t.exponent) || t.coefficient === '0' && t.exponent !== '0') stop('invalid_operand', 4, at + '/exponent');
    c = t.coefficient; e = exponent(t.exponent, limits, at + '/exponent');
    if (c.replace(/^-/, '').length > limits.maxCoefficientDigits) stop('resource_limit', 4, at + '/coefficient');
  }
  return { c, e, history: h };
}
function selection(input, op, limits) {
  const extras = op === 'shift' ? ['unit', 'count'] : op === 'step' ? ['dateGranularity', 'clockForm', 'count'] : op === 'materialize' ? ['dateGranularity', 'clockForm'] : [];
  for (const key of ['context', 'policy']) {
    const at = '/input/' + key;
    if (!Object.hasOwn(input, key)) { if (key === 'policy' && extras.length) stop('invalid_policy', 3, at); continue; }
    if (!record(input[key])) stop('invalid_policy', 3, at);
    if (key === 'policy') required(input[key], extras, at, 'invalid_policy', 3);
    closed(input[key], ['profile', ...(key === 'policy' ? extras : [])], at, 'invalid_policy', 3);
  }
  for (const key of ['context', 'policy']) if (Object.hasOwn(input[key] ?? {}, 'profile') && !identifier(input[key].profile)) stop('invalid_policy', 3, '/input/' + key + '/profile');
  const p = input.policy ?? {};
  if (op === 'shift' && !['day', 'month', 'year', 'eom', 'eoy'].includes(p.unit)) stop('invalid_policy', 3, '/input/policy/unit');
  if (['step', 'materialize'].includes(op)) for (const [k, allowed] of [['dateGranularity', GRAINS], ['clockForm', CLOCKS]]) if (!allowed.includes(p[k])) stop('invalid_policy', 3, '/input/policy/' + k);
  if (['shift', 'step'].includes(op)) {
    if (typeof p.count !== 'string') stop('invalid_policy', 3, '/input/policy/count');
    let n = 0; for (const ch of p.count) if (++n > limits.maxCountCharacters) stop('resource_limit', 3, '/input/policy/count');
    if (!/^(?:0|-?[1-9][0-9]*)$(?![\s\S])/u.test(p.count)) stop('invalid_policy', 3, '/input/policy/count');
  }
  const owner = Object.hasOwn(p, 'profile') ? 'policy' : Object.hasOwn(input.context ?? {}, 'profile') ? 'context' : null;
  if (!owner) stop('invalid_policy', 3, '/input/policy/profile');
  if (input[owner].profile !== AEONIC_TEMPORAL_CIVIL_DATETIME_PROFILE) stop('unsupported_profile', 3, '/input/' + owner + '/profile');
  return { profile: AEONIC_TEMPORAL_CIVIL_DATETIME_PROFILE, ...Object.fromEntries(extras.map(k => [k, p[k]])) };
}
function guard(n, cap) { if (n > cap) stop('resource_limit', 6, null); }
function checkDomain(pieces) {
  if (cmp(pieces[0].lo, C(0)) < 0 || cmp(pieces.at(-1).hi, C(B)) > 0 || same(pieces.at(-1).hi, C(B)) && pieces.at(-1).ih) stop('unrepresentable_result', 6, null);
}
function countValue(text, unit) {
  const abs = text.replace(/^-/, ''), cap = String(unit === 'day' ? LAST : ['month', 'eom'].includes(unit) ? 119988 : 9999);
  if (abs.length > cap.length || abs.length === cap.length && abs > cap) stop('unrepresentable_result', 6, null);
  return Number(text);
}
function daySpan(p) {
  const first = Math.floor(p.lo.s / 86400); let last = Math.floor(p.hi.s / 86400);
  if (p.hi.s % 86400 === 0 && !p.hi.f && !p.ih) last--;
  return [first, last];
}
function intersection(a, b) {
  const low = cmp(a.lo, b.lo), high = cmp(a.hi, b.hi);
  return piece(low >= 0 ? a.lo : b.lo, high <= 0 ? a.hi : b.hi, low === 0 ? a.il && b.il : low > 0 ? a.il : b.il, high === 0 ? a.ih && b.ih : high < 0 ? a.ih : b.ih);
}
function normalize(values) {
  values.sort((a, b) => cmp(a.lo, b.lo) || Number(b.il) - Number(a.il) || -cmp(a.hi, b.hi) || Number(b.ih) - Number(a.ih));
  const out = [];
  for (const p of values) {
    const last = out.at(-1);
    if (!last || cmp(last.hi, p.lo) < 0 || same(last.hi, p.lo) && !(last.ih || p.il)) out.push({ ...p });
    else {
      if (same(last.lo, p.lo)) last.il ||= p.il;
      if (cmp(p.hi, last.hi) > 0) { last.hi = p.hi; last.ih = p.ih; }
      else if (same(last.hi, p.hi)) last.ih ||= p.ih;
    }
  }
  return out;
}
function mappedDay(n, unit, count) {
  const d = date(n); let target, day, clamped;
  if (unit === 'eoy') {
    const y = d.y + count; if (y < 1 || y > 9999) stop('unrepresentable_result', 6, null);
    const k = n - yearStart(d.y) + (leap(y) ? 366 : 365) - (leap(d.y) ? 366 : 365);
    return { n: yearStart(y) + Math.max(0, k), clamped: k < 0 };
  }
  const index = monthIndex(d) + (unit === 'year' ? count * 12 : count);
  if (index < 0 || index > 119987) stop('unrepresentable_result', 6, null);
  target = monthAt(index); const size = monthLength(target.y, target.m);
  if (unit === 'eom') { day = size - (monthLength(d.y, d.m) - d.d); clamped = day < 1; day = Math.max(1, day); }
  else { clamped = d.d > size; day = Math.min(d.d, size); }
  return { n: ordinal(target.y, target.m, day), clamped };
}
function calendarImage(pieces, policy, limits) {
  const direct = policy.count === '0' || policy.unit === 'day'; let work = 0;
  for (const p of pieces) { const [a, b] = daySpan(p); work += direct ? 1 : b - a + 1; if (work > limits.maxWork) stop('resource_limit', 6, null); }
  guard(work, limits.maxIntermediatePieces);
  const count = countValue(policy.count, policy.unit);
  if (direct) {
    const delta = policy.unit === 'day' ? count * 86400 : 0;
    const out = pieces.map(p => piece(C(p.lo.s + delta, p.lo.f), C(p.hi.s + delta, p.hi.f), p.il, p.ih)); checkDomain(out); return { pieces: out, clamped: false };
  }
  const candidates = []; let clamped = false;
  for (const p of pieces) {
    const [first, last] = daySpan(p);
    for (let day = first; day <= last; day++) {
      const fragment = intersection(p, piece(C(day * 86400), C((day + 1) * 86400), true, false));
      if (empty(fragment)) throw new Error('Calendar fragment accounting mismatch');
      const mapped = mappedDay(day + 1, policy.unit, count); clamped ||= mapped.clamped;
      const delta = (mapped.n - 1 - day) * 86400;
      candidates.push(piece(C(fragment.lo.s + delta, fragment.lo.f), C(fragment.hi.s + delta, fragment.hi.f), fragment.il, fragment.ih));
    }
  }
  const out = normalize(candidates); checkDomain(out); return { pieces: out, clamped };
}
function contains(a, b) {
  let j = 0;
  for (const p of a) {
    while (j < b.length && (cmp(b[j].hi, p.lo) < 0 || same(b[j].hi, p.lo) && (!same(p.lo, p.hi) || !b[j].ih))) j++;
    if (j === b.length) return false;
    const q = b[j];
    if (cmp(q.lo, p.lo) > 0 || cmp(q.hi, p.hi) < 0 || same(q.lo, p.lo) && p.il && !q.il || same(q.hi, p.hi) && p.ih && !q.ih) return false;
  }
  return true;
}
const identical = (a, b) => a.length === b.length && a.every((p, i) => same(p.lo, b[i].lo) && same(p.hi, b[i].hi) && p.il === b[i].il && p.ih === b[i].ih);
function label(a, b, op) {
  const eq = identical(a, b);
  if (op === 'equal') return eq ? 'equal' : 'notEqual';
  const before = (x, y) => cmp(x.at(-1).hi, y[0].lo) < 0 || same(x.at(-1).hi, y[0].lo) && !(x.at(-1).ih && y[0].il);
  if (op === 'compare') return eq ? 'equal' : before(a, b) ? 'before' : before(b, a) ? 'after' : 'indeterminate';
  if (eq) return 'equal'; if (contains(a, b)) return 'containedBy'; if (contains(b, a)) return 'contains';
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (!empty(intersection(a[i], b[j]))) return 'overlaps';
    const c = cmp(a[i].hi, b[j].hi); if (c <= 0) i++; if (c >= 0) j++;
  }
  return 'disjoint';
}
function compact(c) {
  let text = (String(c.s) + c.f).replace(/^0+/u, '') || '0', e = -BigInt(c.f.length);
  if (text === '0') return { c: '0', e: 0n };
  const trim = text.replace(/0+$/u, ''); e += BigInt(text.length - trim.length); return { c: trim, e };
}
function complement(f) {
  const chars = Array.from(f, ch => String(9 - Number(ch))); let carry = 1;
  for (let i = chars.length - 1; i >= 0 && carry; i--) { const n = Number(chars[i]) + carry; chars[i] = String(n % 10); carry = n === 10 ? 1 : 0; }
  return chars.join('').replace(/0+$/u, '');
}
function compareDecimal(a, b) {
  const sa = a.c === '0' ? 0 : a.c.startsWith('-') ? -1 : 1, sb = b.c === '0' ? 0 : b.c.startsWith('-') ? -1 : 1;
  if (sa !== sb) return sa < sb ? -1 : 1; if (!sa) return 0;
  const x = a.c.replace(/^-/, ''), y = b.c.replace(/^-/, ''), dx = BigInt(x.length) + a.e, dy = BigInt(y.length) + b.e;
  if (dx !== dy) return (dx < dy ? -1 : 1) * sa;
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? '0') !== (y[i] ?? '0')) return ((x[i] ?? '0') < (y[i] ?? '0') ? -1 : 1) * sa;
  return 0;
}
function clockImage(pieces, amount, limits) {
  const lower = compact(pieces[0].lo); if (lower.c !== '0') lower.c = '-' + lower.c;
  const end = pieces.at(-1), upper = compact(C(B - end.hi.s - (end.hi.f ? 1 : 0), end.hi.f ? complement(end.hi.f) : ''));
  const top = compareDecimal(amount, upper);
  if (compareDecimal(amount, lower) < 0 || top > 0 || top === 0 && end.ih) stop('unrepresentable_result', 6, null);
  let precision = 0; for (const p of pieces) precision = Math.max(precision, p.lo.f.length, p.hi.f.length);
  const a = amount.e < 0n ? -amount.e : 0n, q = a > BigInt(precision) ? a : BigInt(precision);
  if (amount.c !== '0') {
    if (13n + q > BigInt(limits.maxWorkspaceDigits)) stop('resource_limit', 6, null);
    if (a > BigInt(limits.maxFractionDigits)) stop('resource_limit', 6, null);
  }
  guard(pieces.length, limits.maxWork); guard(pieces.length, limits.maxIntermediatePieces);
  if (amount.c === '0') return pieces;
  // If a finer amount cannot cancel, even one coordinate alone exceeds the envelope.
  if (a > BigInt(precision) && a + 22n > BigInt(limits.maxResultBytes)) stop('resource_limit', 7, null);
  const digits = Number(q), scale = 10n ** q, delta = BigInt(amount.c) * 10n ** (amount.e + q);
  const move = c => {
    const n = BigInt(c.s) * scale + BigInt(c.f || '0') * 10n ** (q - BigInt(c.f.length)) + delta;
    const s = Number(n / scale), f = (n % scale).toString().padStart(digits, '0').replace(/0+$/u, '');
    return C(s, f === '0' ? '' : f);
  };
  return pieces.map(p => piece(move(p.lo), move(p.hi), p.il, p.ih));
}
function formFor(pieces, policy) {
  const x = pieces[0].lo, d = date(Math.floor(x.s / 86400) + 1), grain = policy.dateGranularity;
  const start = grain === 'year' ? yearStart(d.y) : grain === 'month' ? ordinal(d.y, d.m, 1) : ordinal(d.y, d.m, d.d);
  const clock = policy.clockForm, time = x.s % 86400, seconds = clock === 'hour' ? Math.floor(time / 3600) * 3600 : clock === 'minute' ? Math.floor(time / 60) * 60 : time;
  return { start, count: grain === 'year' ? (leap(d.y) ? 366 : 365) : grain === 'month' ? monthLength(d.y, d.m) : 1, grain, clock, seconds, f: clock === 'second' ? x.f : '' };
}
function stepped(form, text) {
  const n = countValue(text, form.grain), d = date(form.start); let start;
  if (form.grain === 'day') { start = form.start + n; if (start < 1 || start > LAST) stop('unrepresentable_result', 6, null); }
  else if (form.grain === 'year') { if (d.y + n < 1 || d.y + n > 9999) stop('unrepresentable_result', 6, null); start = yearStart(d.y + n); }
  else { const index = monthIndex(d) + n; if (index < 0 || index > 119987) stop('unrepresentable_result', 6, null); const t = monthAt(index); start = ordinal(t.y, t.m, 1); }
  const t = date(start), count = form.grain === 'year' ? (leap(t.y) ? 366 : 365) : form.grain === 'month' ? monthLength(t.y, t.m) : 1;
  return { ...form, start, count };
}
class PlannedText { constructor(length, render) { this.length = length; this.render = render; } }
function coordinatePlan(c) {
  return new PlannedText(19 + (c.f ? c.f.length + 1 : 0), () => {
    const text = fullText(Math.floor(c.s / 86400) + 1), time = c.s % 86400;
    return `${text}T${String(Math.floor(time / 3600)).padStart(2, '0')}:${String(Math.floor(time / 60) % 60).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}${c.f ? '.' + c.f : ''}`;
  });
}
function descriptor(pieces) {
  return { category: 'civilDateTimeSet', pieces: pieces.map(p => same(p.lo, p.hi)
    ? { kind: 'point', at: coordinatePlan(p.lo) }
    : { kind: 'interval', start: coordinatePlan(p.lo), end: p.hi.s === B && !p.hi.f ? { boundary: 'endOfDomain' } : coordinatePlan(p.hi), includeStart: p.il, includeEnd: p.ih }) };
}
function materialPlan(form) {
  const length = (form.grain === 'year' ? 5 : form.grain === 'month' ? 7 : 10) + 1 + (form.clock === 'hour' ? 2 : form.clock === 'minute' ? 5 : 8 + (form.f ? 1 + form.f.length : 0));
  return new PlannedText(length, () => {
    const d = fullText(form.start), t = coordinatePlan(C((form.start - 1) * 86400 + form.seconds, form.f)).render().split('T')[1];
    return (form.grain === 'year' ? d.slice(0, 5) : form.grain === 'month' ? d.slice(0, 7) : d) + 'T' + (form.clock === 'hour' ? t.slice(0, 2) : form.clock === 'minute' ? t.slice(0, 5) : t);
  });
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
function evaluate(request, limits, available) {
  if (!record(request)) stop('invalid_operand', 2, null);
  required(request, ['operation', 'input'], '', 'invalid_operand', 2);
  if (!identifier(request.operation)) stop('invalid_operand', 2, '/operation');
  if (!record(request.input)) stop('invalid_operand', 2, '/input');
  closed(request, ['operation', 'input'], '', 'invalid_operand', 2);
  const op = request.operation, input = request.input;
  closed(input, ['left', 'right', 'value', 'amount', 'context', 'policy'], '/input', 'invalid_operand', 2);
  if (!available.has(op)) stop('unsupported_operation', 2, '/operation');
  const binary = OPERATIONS.relations.includes(op), keys = binary ? ['left', 'right'] : op === 'shiftClock' ? ['value', 'amount'] : ['value'];
  required(input, keys, '/input', 'invalid_operand', 2); closed(input, [...keys, 'context', 'policy'], '/input', 'invalid_operand', 2);
  const policy = selection(input, op, limits), values = keys.map(k => k === 'amount' ? amount(input[k], limits, '/input/amount') : operand(input[k], limits, '/input/' + k));
  for (let i = 0; i < values.length; i++) if (values[i].deferred) stop('unsupported_domain', 5, '/input/' + keys[i] + (keys[i] === 'amount' ? '/number/category' : '/temporal/category'));
  const [a, b] = values; let td, clamped = false, outputCount = 0;
  if (binary) { guard(a.pieces.length + b.pieces.length, limits.maxWork); td = { category: 'symbol', value: label(a.pieces, b.pieces, op) }; }
  else if (op === 'shift' || op === 'shiftClock') {
    let pieces;
    if (op === 'shift') { const r = calendarImage(a.pieces, policy, limits); pieces = r.pieces; clamped = r.clamped; }
    else pieces = clockImage(a.pieces, b, limits);
    outputCount = pieces.length; td = descriptor(pieces);
  } else {
    const source = formFor(a.pieces, policy), P = a.pieces.length, S = source.count;
    guard(P + S, limits.maxWork); guard(S, limits.maxIntermediatePieces);
    const matches = identical(a.pieces, expand(source));
    if (!matches) stop(op === 'step' ? 'incompatible_operand' : 'unrepresentable_result', op === 'step' ? 6 : 7, op === 'step' ? '/input/value/temporal' : null);
    if (op === 'step') {
      const target = stepped(source, policy.count); guard(P + S + target.count, limits.maxWork); guard(S + target.count, limits.maxIntermediatePieces);
      outputCount = target.count; td = descriptor(expand(target));
    } else {
      outputCount = S;
      if (outputCount > limits.maxOutputPieces) stop('resource_limit', 7, null);
      const value = materialPlan(source); if (value.length > limits.maxOutputCharacters) stop('resource_limit', 7, null);
      td = { category: 'civilDateTime', value };
    }
  }
  if (outputCount > limits.maxOutputPieces) stop('resource_limit', 7, null);
  const metadata = { evaluation: 'exact-for-policy', clamping: clamped ? 'applied' : 'not-applied', effectivePolicy: policy }; let value;
  if (binary) { value = td; metadata.operandHistory = { left: a.history, right: b.history }; metadata.operandOrigin = { left: a.origin, right: b.origin }; }
  else value = { temporal: td, originDateGranularity: a.origin.dateGranularity, originClockForm: a.origin.clockForm,
    history: { clamping: clamped ? CLAMPED : a.history.clamping, approximation: op === 'shiftClock' && b.history === APPROX ? APPROX : a.history.approximation } };
  return finish({ outcome: 'value', value, metadata }, limits);
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
export function evaluateAeonicCivilDateTimeText(text, options = {}) {
  const { limits, available } = configured(options);
  if (typeof text !== 'string') throw new TypeError('requestText must be text');
  return guarded(() => {
    if (!scalar(text)) stop('invalid_operand', 1, null);
    if (text.length > limits.maxRequestBytes || utf8Bytes(text, limits.maxRequestBytes) > limits.maxRequestBytes || exceedsJsonDepth(text, limits.maxRequestDepth)) stop('resource_limit', 1, null);
    let request; try { request = parseStrictJson(text); } catch (e) { if (e instanceof SyntaxError) stop('invalid_operand', 2, null); throw e; }
    return evaluate(request, limits, available);
  });
}
export function evaluateAeonicCivilDateTimeStructuredJson(request, options = {}) {
  const { limits } = configured(options);
  return guarded(() => evaluateAeonicCivilDateTimeText(structuredText(request, limits), options));
}
export const evaluateAeonicCivilDateTime = evaluateAeonicCivilDateTimeStructuredJson;
