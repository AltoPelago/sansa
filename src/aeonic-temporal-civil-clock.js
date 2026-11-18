// Adapted from AltoPelago/aeonic at 8cb31dd3beb44d758ed27c02600b5b4c858fc2a1.
// Copyright (c) 2026 Patrik. MIT; see LICENSE and docs/aeonic-temporal-civil-clock.md.
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

export const AEONIC_TEMPORAL_CIVIL_CLOCK_PROFILE = 'aeonic.operations.temporal.civil-clock.v1';
export const AEONIC_TEMPORAL_CIVIL_CLOCK_DEFAULT_RESOURCE_LIMITS = Object.freeze({ maxRequestBytes: 65536, maxRequestDepth: 32,
  maxTemporalCharacters: 1024, maxInputPieces: 512, maxIntermediatePieces: 4096, maxOutputPieces: 512,
  maxWork: 16384, maxFractionDigits: 256, maxRelativeDayDigits: 256, maxCountCharacters: 32, maxNumericCharacters: 4096,
  maxCoefficientDigits: 1024, maxExponentMagnitude: 1000000, maxWorkspaceDigits: 4096,
  maxOutputCharacters: 1024, maxResultBytes: 131072 });
const OPERATIONS = { relations: ['equal', 'compare', 'relate'], arithmetic: ['shiftClock', 'step', 'materialize'] };
const TAGS = new Set(['civilClock', 'civilClockSet', 'civilDateTime', 'civilDateTimeSet', 'civilDate', 'civilDateSet', 'finiteNumber', 'exactNumber', 'exactRational',
  'string', 'boolean', 'symbol', 'positiveInfinity', 'negativeInfinity', 'nan', 'explicitNull', 'explicitAbsence', 'toggle',
  'hex', 'radix', 'encoding', 'separator', 'sansaAddress', 'referenceForm', 'temporal', 'container']);
const CLOCKS = ['hour', 'minute', 'second'];
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
    if (!Object.hasOwn(AEONIC_TEMPORAL_CIVIL_CLOCK_DEFAULT_RESOURCE_LIMITS, k) || !Number.isSafeInteger(v) || v < 0) throw new TypeError('Invalid resource limit: ' + k);
  }
  const capabilities = Object.hasOwn(options, 'capabilities') ? options.capabilities : ['relations', 'arithmetic'];
  if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some(k => typeof k !== 'string' || !Object.hasOwn(OPERATIONS, k)) || new Set(capabilities).size !== capabilities.length) throw new TypeError('Invalid trusted capabilities');
  return { limits: { ...AEONIC_TEMPORAL_CIVIL_CLOCK_DEFAULT_RESOURCE_LIMITS, ...supplied }, available: new Set(capabilities.flatMap(k => OPERATIONS[k])) };
}

// Whole relative seconds use BigInt; canonical fractions remain text until
// an admitted translation aligns them. No calendar or host Date participates.
const C = (s, f = '') => ({ s, f });
const cmp = (a, b) => a.s !== b.s ? a.s < b.s ? -1 : 1 : a.f === b.f ? 0 : a.f < b.f ? -1 : 1;
const same = (a, b) => cmp(a, b) === 0;
const piece = (lo, hi = lo, il = true, ih = true) => ({ lo, hi, il, ih });
const empty = p => cmp(p.lo, p.hi) > 0 || same(p.lo, p.hi) && !(p.il && p.ih);
const floor = (n, d) => n / d - (n < 0n && n % d !== 0n ? 1n : 0n);
const WIDTH = { hour: 3600n, minute: 60n, second: 1n };
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
  return { seconds: BigInt(Number(hh) * 3600 + Number(mm ?? 0) * 60 + Number(ss ?? 0)), f,
    clock: ss !== undefined ? 'second' : mm !== undefined ? 'minute' : 'hour' };
}
function coordinate(v, path, limits) {
  if (!record(v)) stop('invalid_operand', 4, path);
  required(v, ['day', 'time'], path, 'invalid_operand', 4); closed(v, ['day', 'time'], path, 'invalid_operand', 4);
  if (typeof v.day !== 'string') stop('invalid_operand', 4, path + '/day');
  characters([v.day.startsWith('-') ? v.day.slice(1) : v.day], limits.maxRelativeDayDigits, path + '/day');
  if (!/^(?:0|-?[1-9][0-9]*)$(?![\s\S])/u.test(v.day)) stop('invalid_operand', 4, path + '/day');
  const t = fields(v.time, path + '/time', limits);
  return C(BigInt(v.day) * 86400n + t.seconds, t.f);
}
function operand(v, limits, path) {
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
    const lo = C(form.seconds, form.f), width = form.clock === 'second' ? 0n : WIDTH[form.clock];
    pieces = [piece(lo, width ? C(lo.s + width) : lo, true, !width)];
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
  const extras = op === 'step' ? ['clockForm', 'count'] : op === 'materialize' ? ['clockForm'] : [];
  for (const key of ['context', 'policy']) {
    const at = '/input/' + key;
    if (!Object.hasOwn(input, key)) { if (key === 'policy' && extras.length) stop('invalid_policy', 3, at); continue; }
    if (!record(input[key])) stop('invalid_policy', 3, at);
    if (key === 'policy') required(input[key], extras, at, 'invalid_policy', 3);
    closed(input[key], ['profile', ...(key === 'policy' ? extras : [])], at, 'invalid_policy', 3);
  }
  for (const key of ['context', 'policy']) if (Object.hasOwn(input[key] ?? {}, 'profile') && !identifier(input[key].profile)) stop('invalid_policy', 3, '/input/' + key + '/profile');
  const p = input.policy ?? {};
  if (['step', 'materialize'].includes(op)) for (const [k, allowed] of [['clockForm', CLOCKS]]) if (!allowed.includes(p[k])) stop('invalid_policy', 3, '/input/policy/' + k);
  if (op === 'step') {
    if (typeof p.count !== 'string') stop('invalid_policy', 3, '/input/policy/count');
    let n = 0; for (const ch of p.count) if (++n > limits.maxCountCharacters) stop('resource_limit', 3, '/input/policy/count');
    if (!/^(?:0|-?[1-9][0-9]*)$(?![\s\S])/u.test(p.count)) stop('invalid_policy', 3, '/input/policy/count');
  }
  const owner = Object.hasOwn(p, 'profile') ? 'policy' : Object.hasOwn(input.context ?? {}, 'profile') ? 'context' : null;
  if (!owner) stop('invalid_policy', 3, '/input/policy/profile');
  if (input[owner].profile !== AEONIC_TEMPORAL_CIVIL_CLOCK_PROFILE) stop('unsupported_profile', 3, '/input/' + owner + '/profile');
  return { profile: AEONIC_TEMPORAL_CIVIL_CLOCK_PROFILE, ...Object.fromEntries(extras.map(k => [k, p[k]])) };
}
function guard(n, cap) { if (n > cap) stop('resource_limit', 6, null); }
function intersection(a, b) {
  const low = cmp(a.lo, b.lo), high = cmp(a.hi, b.hi);
  return piece(low >= 0 ? a.lo : b.lo, high <= 0 ? a.hi : b.hi, low === 0 ? a.il && b.il : low > 0 ? a.il : b.il, high === 0 ? a.ih && b.ih : high < 0 ? a.ih : b.ih);
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
function dimensions(pieces) {
  let D = 1, p = 0;
  for (const part of pieces) for (const c of [part.lo, part.hi]) {
    const day = floor(c.s, 86400n).toString(); D = Math.max(D, day.startsWith('-') ? day.length - 1 : day.length);
    p = Math.max(p, c.f.length);
  }
  return { D, p };
}
function shift(pieces, amount, limits) {
  const { D, p } = dimensions(pieces);
  if (amount.c === '0') { guard(pieces.length, limits.maxWork); guard(pieces.length, limits.maxIntermediatePieces); return pieces; }
  const q = BigInt(p) > -amount.e ? BigInt(p) : -amount.e;
  const A = BigInt(amount.c.replace(/^-/, '').length) + amount.e + q;
  const base = BigInt(D) + 5n + q, W = (base > A ? base : A) + 1n;
  if (W > BigInt(limits.maxWorkspaceDigits)) stop('resource_limit', 6, null);
  if (q > BigInt(limits.maxFractionDigits)) stop('resource_limit', 6, null);
  guard(pieces.length, limits.maxWork); guard(pieces.length, limits.maxIntermediatePieces);
  const scale = 10n ** q, delta = BigInt(amount.c) * 10n ** (amount.e + q), digits = Number(q);
  const move = c => {
    const n = c.s * scale + BigInt(c.f || '0') * 10n ** (q - BigInt(c.f.length)) + delta;
    const s = floor(n, scale), f = (n - s * scale).toString().padStart(digits, '0').replace(/0+$/u, '');
    return C(s, f === '0' ? '' : f);
  };
  return pieces.map(p => piece(move(p.lo), move(p.hi), p.il, p.ih));
}
function reference(pieces, clock) {
  const x = pieces[0].lo;
  if (clock === 'second') return piece(x);
  const width = WIDTH[clock], lo = C(floor(x.s, width) * width);
  return piece(lo, C(lo.s + width), true, false);
}
function step(source, pieces, policy, limits) {
  if (policy.count === '0') return [source];
  const { D, p } = dimensions(pieces), n = policy.count.replace(/^-/, '').length, u = WIDTH[policy.clockForm];
  const W = Math.max(D + 5 + p, n + u.toString().length + p) + 1;
  guard(W, limits.maxWorkspaceDigits);
  const delta = BigInt(policy.count) * u;
  return [piece(C(source.lo.s + delta, source.lo.f), C(source.hi.s + delta, source.hi.f), source.il, source.ih)];
}
class PlannedText { constructor(length, render) { this.length = length; this.render = render; } }
function coordinatePlan(c, limits) {
  const day = floor(c.s, 86400n).toString();
  if ((day.startsWith('-') ? day.length - 1 : day.length) > limits.maxRelativeDayDigits) stop('resource_limit', 7, null);
  const time = Number(c.s - floor(c.s, 86400n) * 86400n);
  return { day, time: new PlannedText(8 + (c.f ? c.f.length + 1 : 0), () =>
    `${String(Math.floor(time / 3600)).padStart(2, '0')}:${String(Math.floor(time / 60) % 60).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}${c.f ? '.' + c.f : ''}`) };
}
function descriptor(pieces, limits) {
  return { category: 'civilClockSet', pieces: pieces.map(p => same(p.lo, p.hi)
    ? { kind: 'point', at: coordinatePlan(p.lo, limits) }
    : { kind: 'interval', start: coordinatePlan(p.lo, limits), end: coordinatePlan(p.hi, limits), includeStart: p.il, includeEnd: p.ih }) };
}
function materialPlan(source, clock, limits) {
  const coord = coordinatePlan(source.lo, limits), t = coord.time;
  return new PlannedText(clock === 'hour' ? 3 : clock === 'minute' ? 5 : t.length,
    () => clock === 'hour' ? t.render().slice(0, 2) + ':' : clock === 'minute' ? t.render().slice(0, 5) : t.render());
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
  const [a, b] = values; let td;
  if (binary) { guard(a.pieces.length + b.pieces.length, limits.maxWork); td = { category: 'symbol', value: label(a.pieces, b.pieces, op) }; }
  else {
    let pieces;
    if (op === 'shiftClock') pieces = shift(a.pieces, b, limits);
    else {
      guard(a.pieces.length + 1, limits.maxWork); guard(1, limits.maxIntermediatePieces);
      const source = reference(a.pieces, policy.clockForm), matches = identical(a.pieces, [source]);
      if (!matches || op === 'materialize' && floor(source.lo.s, 86400n) !== 0n) stop(op === 'step' ? 'incompatible_operand' : 'unrepresentable_result', op === 'step' ? 6 : 7, op === 'step' ? '/input/value/temporal' : null);
      if (op === 'step') {
        guard(a.pieces.length + 2, limits.maxWork); guard(2, limits.maxIntermediatePieces);
        pieces = step(source, a.pieces, policy, limits);
      } else pieces = [source];
    }
    // Final coordinate capacity (including excluded ends) precedes piece/text/bytes.
    td = descriptor(pieces, limits);
    if (pieces.length > limits.maxOutputPieces) stop('resource_limit', 7, null);
    if (op === 'materialize') {
      const text = materialPlan(pieces[0], policy.clockForm, limits);
      if (text.length > limits.maxOutputCharacters) stop('resource_limit', 7, null);
      td = { category: 'civilClock', value: text };
    }
  }
  const metadata = { evaluation: 'exact-for-policy', effectivePolicy: policy }; let value;
  if (binary) { value = td; metadata.operandHistory = { left: a.history, right: b.history }; metadata.operandOrigin = { left: a.origin, right: b.origin }; }
  else value = { temporal: td, originClockForm: a.origin, history: op === 'shiftClock' && b.history === APPROX ? APPROX : a.history };
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
export function evaluateAeonicCivilClockText(text, options = {}) {
  const { limits, available } = configured(options);
  if (typeof text !== 'string') throw new TypeError('requestText must be text');
  return guarded(() => {
    if (!scalar(text)) stop('invalid_operand', 1, null);
    if (text.length > limits.maxRequestBytes || utf8Bytes(text, limits.maxRequestBytes) > limits.maxRequestBytes || exceedsJsonDepth(text, limits.maxRequestDepth)) stop('resource_limit', 1, null);
    let request; try { request = parseStrictJson(text); } catch (e) { if (e instanceof SyntaxError) stop('invalid_operand', 2, null); throw e; }
    return evaluate(request, limits, available);
  });
}
export function evaluateAeonicCivilClockStructuredJson(request, options = {}) {
  const { limits } = configured(options);
  return guarded(() => evaluateAeonicCivilClockText(structuredText(request, limits), options));
}
export const evaluateAeonicCivilClock = evaluateAeonicCivilClockStructuredJson;
