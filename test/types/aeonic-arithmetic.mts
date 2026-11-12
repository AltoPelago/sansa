import {
  evaluateAeonicArithmetic,
  evaluateAeonicArithmeticText,
  AEONIC_ARITHMETIC_DEFAULT_RESOURCE_LIMITS,
  type AeonicArithmeticOperand,
} from '../../src/index.js';

const source: AeonicArithmeticOperand = { number: { category: 'finiteNumber', value: '0.1' } };
const result = evaluateAeonicArithmetic({ operation: 'add', input: { left: source, right: source } });
if (result.outcome === 'value') {
  evaluateAeonicArithmetic({ operation: 'multiply', input: { left: result.value, right: source } });
  evaluateAeonicArithmetic({ operation: 'materialize', input: { value: result.value, policy: { family: 'decimal' } } });
} else {
  const reason: string = result.reason;
  void reason;
  // @ts-expect-error Fail-closed diagnostics have no value bundle to chain.
  evaluateAeonicArithmetic({ operation: 'add', input: { left: result.value, right: source } });
}
evaluateAeonicArithmeticText('{}', { resourceLimits: { maxNumericCharacters: 5 } });
const limit: number = AEONIC_ARITHMETIC_DEFAULT_RESOURCE_LIMITS.maxWorkspaceDigits;
void limit;
// @ts-expect-error Materialization must explicitly select an output family.
evaluateAeonicArithmetic({ operation: 'materialize', input: { value: source, policy: {} } });
// @ts-expect-error Native numbers are not exact authored AEON numerical text.
const native: AeonicArithmeticOperand = { number: { category: 'finiteNumber', value: 0.1 } };
// @ts-expect-error Derived values require explicit history even when none is declared.
const missingHistory: AeonicArithmeticOperand = { number: { category: 'exactNumber', coefficient: '1', exponent: '0' } };
void native;
void missingHistory;
