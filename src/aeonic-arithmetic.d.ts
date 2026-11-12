export const AEONIC_ARITHMETIC_PROFILE: 'aeonic.operations.arithmetic.exact.v1';
export interface AeonicArithmeticResourceLimits {
  readonly maxRequestBytes: number;
  readonly maxRequestDepth: number;
  readonly maxNumericCharacters: number;
  readonly maxCoefficientDigits: number;
  readonly maxExponentMagnitude: number;
  readonly maxWorkspaceDigits: number;
  readonly maxOutputCharacters: number;
}
export const AEONIC_ARITHMETIC_DEFAULT_RESOURCE_LIMITS: Readonly<AeonicArithmeticResourceLimits>;
export interface AeonicArithmeticOptions {
  readonly resourceLimits?: Partial<AeonicArithmeticResourceLimits>;
}
export type AeonicArithmeticHistory = 'none-declared' | 'approximation-declared';
export interface AeonicFiniteNumber {
  readonly category: 'finiteNumber';
  readonly value: string;
}
export interface AeonicExactNumber {
  readonly category: 'exactNumber';
  readonly coefficient: string;
  readonly exponent: string;
}
export interface AeonicArithmeticDeferredNumber {
  readonly category: 'string' | 'boolean' | 'symbol' | 'positiveInfinity' | 'negativeInfinity'
    | 'nan' | 'explicitNull' | 'explicitAbsence' | 'toggle' | 'hex' | 'radix'
    | 'encoding' | 'separator' | 'sansaAddress' | 'referenceForm' | 'temporal' | 'container';
  readonly [field: string]: unknown;
}
export type AeonicArithmeticOperand =
  | { readonly number: AeonicFiniteNumber | AeonicArithmeticDeferredNumber; readonly history?: AeonicArithmeticHistory }
  | { readonly number: AeonicExactNumber; readonly history: AeonicArithmeticHistory };
export interface AeonicArithmeticPolicy {
  readonly profile?: string;
}
export interface AeonicArithmeticBinaryRequest {
  readonly operation: 'add' | 'subtract' | 'multiply';
  readonly input: {
    readonly left: AeonicArithmeticOperand;
    readonly right: AeonicArithmeticOperand;
    readonly policy?: AeonicArithmeticPolicy;
    readonly context?: AeonicArithmeticPolicy;
  };
}
export type AeonicArithmeticOutputFamily = 'integer' | 'decimal' | 'exponent';
export interface AeonicArithmeticMaterializeRequest {
  readonly operation: 'materialize';
  readonly input: {
    readonly value: AeonicArithmeticOperand;
    readonly context?: AeonicArithmeticPolicy;
    readonly policy: AeonicArithmeticPolicy & {
      readonly family: AeonicArithmeticOutputFamily;
      readonly zeroSign?: 'positive' | 'negative';
    };
  };
}
export type AeonicArithmeticRequest = AeonicArithmeticBinaryRequest | AeonicArithmeticMaterializeRequest;
export interface AeonicArithmeticDiagnostic {
  readonly outcome: 'diagnostic';
  readonly reason: 'resource_limit' | 'invalid_operand' | 'unsupported_operation'
    | 'invalid_policy' | 'unsupported_profile' | 'unsupported_domain' | 'unrepresentable_result';
  readonly context: { readonly stage: 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly path: string | null };
  readonly message?: string;
}
export interface AeonicArithmeticValueResult {
  readonly outcome: 'value';
  readonly value:
    | { readonly number: AeonicFiniteNumber; readonly history: AeonicArithmeticHistory }
    | { readonly number: AeonicExactNumber; readonly history: AeonicArithmeticHistory };
  readonly metadata: {
    readonly evaluation: 'exact-for-operands';
    readonly effectivePolicy: {
      readonly profile: typeof AEONIC_ARITHMETIC_PROFILE;
      readonly family?: AeonicArithmeticOutputFamily;
      readonly zeroSign?: 'positive' | 'negative';
    };
  };
}
export type AeonicArithmeticResult = AeonicArithmeticValueResult | AeonicArithmeticDiagnostic;
/** Exact finite arithmetic and explicit materialization; diagnostics never carry values. */
export function evaluateAeonicArithmetic(request: AeonicArithmeticRequest, options?: AeonicArithmeticOptions): AeonicArithmeticResult;
/** Exact Unicode JSON ingress with staged byte/depth and duplicate-key admission. */
export function evaluateAeonicArithmeticText(requestText: string, options?: AeonicArithmeticOptions): AeonicArithmeticResult;
