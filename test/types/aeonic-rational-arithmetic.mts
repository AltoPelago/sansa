import {
  evaluateAeonicRationalArithmetic as evaluate, evaluateAeonicRationalArithmeticText,
  evaluateAeonicRationalArithmeticAndMaterialize as combined,
  evaluateAeonicArithmeticAndMaterialize, AEONIC_RATIONAL_ARITHMETIC_PROFILE as profile,
  AEONIC_RATIONAL_ARITHMETIC_DEFAULT_RESOURCE_LIMITS,
  type AeonicRationalArithmeticOperand, type AeonicRationalArithmeticRequest,
} from '../../src/index.js';
const context = { profile };
const one = { number: { category: 'finiteNumber' as const, value: '1' } };
const request: AeonicRationalArithmeticRequest = { operation: 'divide', input: { left: one, right: one, context } };
const result = evaluate(request);
if (result.outcome === 'value') {
  evaluate({ operation: 'add', input: { left: result.value, right: one, context } });
  evaluate({ operation: 'quantize', input: { value: result.value, context, policy: {
    increment: { category: 'exactNumber', coefficient: '1', exponent: '-2' }, rounding: 'half-even',
  } } });
} else {
  // @ts-expect-error Diagnostics cannot feed arithmetic values.
  evaluate({ operation: 'multiply', input: { left: result.value, right: one, context } });
}
const output = combined(request, { family: 'decimal', quantize: {
  increment: { category: 'exactNumber', coefficient: '1', exponent: '-2' }, rounding: 'floor',
} });
if (output.outcome === 'value') {
  const representation: string = output.value.number.value;
  const evaluation: 'exact-for-operands' | 'rounded-for-operands' = output.metadata.steps[0].metadata.evaluation;
  void representation; void evaluation;
} else {
  const step: 'calculation' | 'quantization' | 'materialization' = output.step;
  void step;
  // @ts-expect-error No partial value on combined failure.
  output.value;
}
evaluateAeonicRationalArithmeticText('{}', { resourceLimits: { maxDenominatorDigits: 10 } });
const bound: number = AEONIC_RATIONAL_ARITHMETIC_DEFAULT_RESOURCE_LIMITS.maxDenominatorDigits;
void bound;
// @ts-expect-error Derived rationals require history.
const noHistory: AeonicRationalArithmeticOperand = { number: { category: 'exactRational', coefficient: '1', exponent: '0', denominator: '3' } };
// @ts-expect-error Output family is mandatory.
combined(request, {});
// @ts-expect-error Every quantization needs a rounding mode.
combined(request, { family: 'decimal', quantize: { increment: { category: 'exactNumber', coefficient: '1', exponent: '-2' } } });
// @ts-expect-error Native floating-point values are not authored Number text.
const native: AeonicRationalArithmeticOperand = { number: { category: 'finiteNumber', value: 0.1 } };
// @ts-expect-error The finite helper has no implicit division/rounding capability.
evaluateAeonicArithmeticAndMaterialize(request, { family: 'decimal' });
void noHistory; void native;
