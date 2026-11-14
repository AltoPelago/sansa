// Adapted from Aeonic rational arithmetic/convenience at 64347f19181041f86135e958da5a16ecc4b60b57.
// Copyright (c) 2026 Patrik. MIT; see LICENSE and docs/aeonic-rational-arithmetic.md.
import { evaluateAeonicArithmetic, evaluateAeonicArithmeticText } from './aeonic-arithmetic.js';
import { evaluateAeonicRationalArithmetic, evaluateAeonicRationalArithmeticText } from './aeonic-rational-arithmetic.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function combine(request, output, options, first, next, rational) {
  if (!record(output) || !Object.hasOwn(output, 'family')) {
    throw new TypeError('Combined arithmetic requires an output object with an explicit family.');
  }
  const calculated = first(request, options);
  if (calculated.outcome !== 'value') return { ...calculated, step: 'calculation' };
  const steps = [{ step: 'calculation', metadata: calculated.metadata }];
  const context = { profile: calculated.metadata.effectivePolicy.profile };
  let value = calculated.value;
  if (rational && Object.hasOwn(output, 'quantize')) {
    const quantized = next({ operation: 'quantize', input: { value, context, policy: output.quantize } }, options);
    if (quantized.outcome !== 'value') return { ...quantized, step: 'quantization' };
    steps.push({ step: 'quantization', metadata: quantized.metadata }); value = quantized.value;
  }
  const policy = rational ? Object.fromEntries(Object.entries(output).filter(([key]) => key !== 'quantize')) : output;
  const materialized = next({ operation: 'materialize', input: { value, context, policy } }, options);
  if (materialized.outcome !== 'value') return { ...materialized, step: 'materialization' };
  steps.push({ step: 'materialization', metadata: materialized.metadata });
  return { outcome: 'value', value: materialized.value, metadata: { steps } };
}

/** Application convenience composition, separate from frozen operation results.
 * output is a materialization policy; rational output may also contain an explicit
 * quantize policy. Diagnostics add step, retain their operation-local context,
 * and expose no intermediate values. Engine limits apply independently per step.
 */
export function evaluateAeonicArithmeticAndMaterialize(request, output, options = {}) {
  return combine(request, output, options, evaluateAeonicArithmetic, evaluateAeonicArithmetic, false);
}
export function evaluateAeonicArithmeticAndMaterializeText(requestText, output, options = {}) {
  return combine(requestText, output, options, evaluateAeonicArithmeticText, evaluateAeonicArithmetic, false);
}
export function evaluateAeonicRationalArithmeticAndMaterialize(request, output, options = {}) {
  return combine(request, output, options, evaluateAeonicRationalArithmetic, evaluateAeonicRationalArithmetic, true);
}
export function evaluateAeonicRationalArithmeticAndMaterializeText(requestText, output, options = {}) {
  return combine(requestText, output, options, evaluateAeonicRationalArithmeticText, evaluateAeonicRationalArithmetic, true);
}
