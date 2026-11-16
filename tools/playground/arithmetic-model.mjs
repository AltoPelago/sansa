import { DATETIME_EXAMPLES } from './datetime-examples.mjs';
import { TEMPORAL_EXAMPLES } from './temporal-examples.mjs';
import { parseStrictJson, exceedsJsonDepth } from '../../src/aeonic-json.js';
export const ARITHMETIC_LIMITS = Object.freeze({ requestBytes: 262144, outputPolicyBytes: 16384, policyDepth: 8, resultBytes: 1048576, timeoutMs: 4000 });
export const ARITHMETIC_LANES = Object.freeze({
  datetime: { title: 'Civil date-times', snapshot: '0.1', profile: 'aeonic.operations.temporal.civil-datetime.v1' },
  temporal: { title: 'Civil dates', snapshot: '0.1', profile: 'aeonic.operations.temporal.civil-date.v1' },
  finite: { title: 'Finite arithmetic', snapshot: '0.1', profile: 'aeonic.operations.arithmetic.exact.v1' },
  rational: { title: 'Rational & rounding', snapshot: '0.2', profile: 'aeonic.operations.arithmetic.rational.v1' },
});
export function utf8Bytes(text, allowance) {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > allowance) break;
  }
  return bytes;
}
export function validateArithmeticInput(input, limits = ARITHMETIC_LIMITS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !['lane', 'requestText', 'outputPolicyText'].includes(key))
      || !Object.hasOwn(input, 'lane') || !Object.hasOwn(input, 'requestText')
      || typeof input.lane !== 'string' || !Object.hasOwn(ARITHMETIC_LANES, input.lane) || typeof input.requestText !== 'string') {
    throw new TypeError('Expected a finite/rational/civil-date/civil-date-time capability and logical JSON request text.');
  }
  if (['temporal', 'datetime'].includes(input.lane) && Object.hasOwn(input, 'outputPolicyText')) throw new TypeError('Temporal capabilities require explicit separate operations; numerical convenience policy is unavailable.');
  const policy = Object.hasOwn(input, 'outputPolicyText') ? input.outputPolicyText : '';
  if (typeof policy !== 'string') throw new TypeError('Output policy must be JSON text.');
  if (policy.length > limits.outputPolicyBytes || utf8Bytes(policy, limits.outputPolicyBytes) > limits.outputPolicyBytes) {
    throw new RangeError('Playground output policy exceeds 16 KiB.');
  }
  if (input.requestText.length + policy.length > limits.requestBytes
      || utf8Bytes(input.requestText, limits.requestBytes) + utf8Bytes(policy, limits.outputPolicyBytes) > limits.requestBytes) {
    throw new RangeError('Playground request and output policy exceed 256 KiB.');
  }
}
const authored = value => ({ number: { category: 'finiteNumber', value } });
const exact = (coefficient, exponent = '0', denominator) => ({ number: {
  category: denominator ? 'exactRational' : 'exactNumber', coefficient, exponent,
  ...(denominator ? { denominator } : {}),
}, history: 'none-declared' });
const context = lane => ({ profile: ARITHMETIC_LANES[lane].profile });
const binary = (lane, operation, left, right) => ({ operation, input: { left, right, context: context(lane) } });
const grid = { increment: { category: 'exactNumber', coefficient: '1', exponent: '-2' }, rounding: 'half-even' };
export const ARITHMETIC_EXAMPLES = [
  { id: 'finite-sum', lane: 'finite', title: 'An exact decimal sum', detail: 'Calculate 0.1 + 0.2, then choose a Number representation.', request: binary('finite', 'add', authored('0.1'), authored('0.2')) },
  { id: 'finite-combined', lane: 'finite', title: 'A Number in one call', detail: 'Calculate and materialize decimal 0.3. Both steps keep their metadata.', request: binary('finite', 'add', authored('0.1'), authored('0.2')), output: { family: 'decimal' } },
  { id: 'third', lane: 'rational', title: 'One third, exactly', detail: 'Keep 1/3 exact. Multiply the returned bundle by 3 to recover 1.', request: binary('rational', 'divide', authored('1'), authored('3')) },
  { id: 'cancel', lane: 'rational', title: 'A rational becomes whole', detail: '(1/3) × 3 normalizes to an exact decimal result before materialization.', request: binary('rational', 'multiply', exact('1', '0', '3'), authored('3')) },
  { id: 'half', lane: 'rational', title: 'Add a third and a sixth', detail: 'All four binary operations accept rational operands. The sum is exact 0.5.', request: binary('rational', 'add', exact('1', '0', '3'), exact('5', '-1', '3')) },
  { id: 'combined-third', lane: 'rational', title: 'An explicitly rounded third', detail: 'Calculate, quantize to 0.01 using half-even, then materialize 0.33 in one call.', request: binary('rational', 'divide', authored('1'), authored('3')), output: { family: 'decimal', quantize: grid } },
  { id: 'negative-tie', lane: 'rational', title: 'Half-even at a negative tie', detail: 'At increment 0.1, -1.25 rounds to -1.2. Try any of the seven explicit modes.', request: { operation: 'quantize', input: { value: authored('-1.25'), context: context('rational'), policy: { ...grid, increment: { category: 'exactNumber', coefficient: '1', exponent: '-1' } } } } },
  { id: 'nickel', lane: 'rational', title: 'A 0.05 rounding grid', detail: 'The increment defines integer multiples through zero; it does not prescribe output scale.', request: { operation: 'quantize', input: { value: authored('0.175'), context: context('rational'), policy: { ...grid, increment: { category: 'exactNumber', coefficient: '5', exponent: '-2' } } } } },
  { id: 'zero-divisor', lane: 'rational', title: 'Division by zero', detail: 'The selected exact profile returns a diagnostic with no value.', request: binary('rational', 'divide', authored('1'), authored('0')) },
  { id: 'unrepresentable', lane: 'rational', title: 'A rational is not a Number literal', detail: 'Exact 1/3 cannot be materialized as a finite Number. Explicit quantization is a separate decision.', request: { operation: 'materialize', input: { value: exact('1', '0', '3'), context: context('rational'), policy: { family: 'decimal' } } } },
  { id: 'compact', lane: 'rational', title: 'A compact million-place exponent', detail: 'An already-on-grid value stays compact instead of expanding a million digits.', request: { operation: 'quantize', input: { value: authored('1e1000000'), context: context('rational'), policy: { ...grid, increment: { category: 'exactNumber', coefficient: '1', exponent: '0' } } } } },
];
export const VALUE_EXAMPLES = [...ARITHMETIC_EXAMPLES, ...TEMPORAL_EXAMPLES, ...DATETIME_EXAMPLES];
export function continueArithmetic(value, lane, operation) {
  if (lane === 'datetime') {
    if (!value?.temporal || !['civilDateTime', 'civilDateTimeSet'].includes(value.temporal.category) || !['shift', 'shiftClock', 'step', 'materialize'].includes(operation)) throw new TypeError('A date-time continuation needs a complete date-time bundle.');
    const input = { value: structuredClone(value), context: context(lane) };
    if (operation === 'shiftClock') input.amount = authored('0.2');
    else input.policy = operation === 'shift' ? { unit: 'month', count: '1' } : { dateGranularity: 'month', clockForm: 'minute', ...(operation === 'step' ? { count: '1' } : {}) };
    return { operation, input };
  }
  if (lane === 'temporal') {
    if (!value?.temporal || !['shift', 'step', 'materialize'].includes(operation)) throw new TypeError('A temporal continuation needs a complete date bundle.');
    return { operation, input: { value: structuredClone(value), context: context(lane), policy:
      operation === 'shift' ? { unit: 'month', count: '1' } : { granularity: 'month', ...(operation === 'step' ? { count: '1' } : {}) } } };
  }
  if (!Object.hasOwn(ARITHMETIC_LANES, lane) || !['multiply', 'quantize', 'materialize'].includes(operation)
      || (operation === 'quantize' && lane !== 'rational')) throw new TypeError('Unsupported continuation.');
  const bundle = structuredClone(value);
  if (operation === 'multiply') return binary(lane, 'multiply', bundle, authored('3'));
  return { operation, input: { value: bundle, context: context(lane), policy: operation === 'quantize' ? structuredClone(grid) : { family: 'decimal' } } };
}
export function arithmeticDisplay(number) {
  if (number.category === 'finiteNumber') return number.value;
  return number.coefficient + ' × 10^' + number.exponent + (number.category === 'exactRational' ? ' / ' + number.denominator : '');
}

export function temporalDisplay(value) {
  if (value.category === 'symbol') return '|' + value.value + '|';
  if (value.temporal.category === 'civilDate') return value.temporal.value;
  const ranges = value.temporal.ranges;
  return ranges.slice(0, 4).map(r => r.start === r.end ? r.start : r.start + ' … ' + r.end).join(' ∪ ')
    + (ranges.length > 4 ? ' … (' + ranges.length + ' ranges)' : '');
}
export function describeArithmeticInput(lane, requestText) {
  try {
    validateArithmeticInput({ lane, requestText });
    if (exceedsJsonDepth(requestText, 32)) return 'Review the request. The selected API validates it when run.';
    const request = parseStrictJson(requestText), input = request?.input, policy = input?.policy;
    const label = bundle => {
      const v = ['temporal', 'datetime'].includes(lane) ? bundle?.temporal ?? bundle?.number : bundle?.number;
      if (['civilDate', 'civilDateTime'].includes(v?.category) || v?.category === 'finiteNumber') return typeof v.value === 'string' ? v.value.slice(0, 60) : 'the operand';
      if (v?.category === 'civilDateTimeSet') return 'the exact point/interval bundle';
      if (v?.category === 'civilDateSet') return 'the exact date-range bundle';
      return 'the derived value';
    };
    if (!input || typeof request.operation !== 'string') return 'Review the request. The selected API validates it when run.';
    const op = request.operation, text = v => typeof v === 'string' ? v.slice(0, 60) : 'unspecified';
    if (lane === 'datetime') {
      if (op === 'shiftClock') return 'Shift ' + label(input.value) + ' by ' + label(input.amount) + ' civil-coordinate seconds. Preserve exact fractions and history.';
      if (op === 'shift') return 'Shift ' + label(input.value) + ' by ' + text(policy?.count) + ' ' + text(policy?.unit) + ', preserving every clock subset.';
      if (op === 'step') return 'Step ' + label(input.value) + ' by ' + text(policy?.count) + ' complete ' + text(policy?.dateGranularity) + '/' + text(policy?.clockForm) + ' forms.';
      if (op === 'materialize') return 'Materialize ' + label(input.value) + ' as an exact ' + text(policy?.dateGranularity) + '/' + text(policy?.clockForm) + ' form.';
    }
    if (lane === 'temporal') {
      if (op === 'shift') return 'Shift ' + label(input.value) + ' by ' + text(policy?.count) + ' ' + text(policy?.unit) + '. Preserve exact coverage for chaining.';
      if (op === 'step') return 'Step ' + label(input.value) + ' by ' + text(policy?.count) + ' complete ' + text(policy?.granularity) + ' periods.';
      if (op === 'materialize') return 'Materialize ' + label(input.value) + ' as an exact ' + text(policy?.granularity) + ' date.';
    }
    if (['equal', 'compare', 'relate', 'add', 'subtract', 'multiply', 'divide'].includes(op)) return text(op) + ': ' + label(input.left) + ' and ' + label(input.right) + '. The selected API determines the result.';
    return text(op) + ': ' + label(input.value) + '. Review the explicit policy before running.';
  } catch { return 'Review the request. The selected API validates it when run.'; }
}

export function dateTimeDisplay(value) {
  if (value.category === 'symbol') return '|' + value.value + '|';
  if (value.temporal.category === 'civilDateTime') return value.temporal.value;
  const pieces = value.temporal.pieces;
  return pieces.slice(0, 3).map(p => p.kind === 'point' ? p.at
    : (p.includeStart ? '[' : '(') + p.start + ' … ' + (typeof p.end === 'string' ? p.end : 'end of domain') + (p.includeEnd ? ']' : ')')).join(' ∪ ')
    + (pieces.length > 3 ? ' … (' + pieces.length + ' pieces)' : '');
}
export function dateTimeFacts(result) {
  const rows = [['Current clamping', result.metadata.clamping]];
  const add = (prefix, history, origin) => rows.push([prefix + 'date origin', origin.dateGranularity], [prefix + 'clock origin', origin.clockForm],
    [prefix + 'clamping history', history.clamping], [prefix + 'approximation history', history.approximation]);
  if (result.value.category === 'symbol') for (const side of ['left', 'right']) {
    add(side === 'left' ? 'Left ' : 'Right ', result.metadata.operandHistory[side], result.metadata.operandOrigin[side]);
  } else add('', result.value.history, { dateGranularity: result.value.originDateGranularity, clockForm: result.value.originClockForm });
  return rows;
}
