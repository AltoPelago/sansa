import type {
  AeonicArithmeticResourceLimits, AeonicArithmeticOperand, AeonicArithmeticHistory,
  AeonicFiniteNumber, AeonicExactNumber, AeonicArithmeticOutputFamily, AeonicArithmeticDiagnostic,
} from './aeonic-arithmetic.js';

export const AEONIC_RATIONAL_ARITHMETIC_PROFILE: 'aeonic.operations.arithmetic.rational.v1';
export interface AeonicRationalArithmeticResourceLimits extends AeonicArithmeticResourceLimits {
  readonly maxDenominatorDigits: number;
}
export const AEONIC_RATIONAL_ARITHMETIC_DEFAULT_RESOURCE_LIMITS: Readonly<AeonicRationalArithmeticResourceLimits>;
export interface AeonicRationalArithmeticOptions {
  readonly resourceLimits?: Partial<AeonicRationalArithmeticResourceLimits>;
}
/** Normalized internal value coefficient × 10^exponent / denominator; not an AEON literal. */
export interface AeonicExactRational {
  readonly category: 'exactRational';
  readonly coefficient: string;
  readonly exponent: string;
  readonly denominator: string;
}
export type AeonicRationalArithmeticOperand = AeonicArithmeticOperand
  | { readonly number: AeonicExactRational; readonly history: AeonicArithmeticHistory };
export type AeonicRoundingMode = 'half-even' | 'half-away-from-zero' | 'half-toward-zero'
  | 'toward-zero' | 'away-from-zero' | 'floor' | 'ceiling';
export interface AeonicRationalArithmeticPolicy { readonly profile?: string }
export interface AeonicQuantizationPolicy extends AeonicRationalArithmeticPolicy {
  readonly increment: AeonicExactNumber;
  readonly rounding: AeonicRoundingMode;
}
export interface AeonicRationalMaterializationPolicy extends AeonicRationalArithmeticPolicy {
  readonly family: AeonicArithmeticOutputFamily;
  readonly zeroSign?: 'positive' | 'negative';
}
export interface AeonicRationalArithmeticBinaryRequest {
  readonly operation: 'add' | 'subtract' | 'multiply' | 'divide';
  readonly input: {
    readonly left: AeonicRationalArithmeticOperand;
    readonly right: AeonicRationalArithmeticOperand;
    readonly context?: AeonicRationalArithmeticPolicy;
    readonly policy?: AeonicRationalArithmeticPolicy;
  };
}
export interface AeonicQuantizeRequest {
  readonly operation: 'quantize';
  readonly input: {
    readonly value: AeonicRationalArithmeticOperand;
    readonly context?: AeonicRationalArithmeticPolicy;
    readonly policy: AeonicQuantizationPolicy;
  };
}
export interface AeonicRationalMaterializeRequest {
  readonly operation: 'materialize';
  readonly input: {
    readonly value: AeonicRationalArithmeticOperand;
    readonly context?: AeonicRationalArithmeticPolicy;
    readonly policy: AeonicRationalMaterializationPolicy;
  };
}
export type AeonicRationalArithmeticRequest = AeonicRationalArithmeticBinaryRequest
  | AeonicQuantizeRequest | AeonicRationalMaterializeRequest;
export type AeonicRationalArithmeticDiagnostic = Omit<AeonicArithmeticDiagnostic, 'reason'> & {
  readonly reason: AeonicArithmeticDiagnostic['reason'] | 'division_by_zero';
};
export interface AeonicRationalArithmeticMetadata {
  readonly evaluation: 'exact-for-operands' | 'rounded-for-operands';
  readonly effectivePolicy: {
    readonly profile: typeof AEONIC_RATIONAL_ARITHMETIC_PROFILE;
    readonly increment?: AeonicExactNumber;
    readonly rounding?: AeonicRoundingMode;
    readonly family?: AeonicArithmeticOutputFamily;
    readonly zeroSign?: 'positive' | 'negative';
  };
}
export interface AeonicRationalArithmeticValueResult {
  readonly outcome: 'value';
  readonly value:
    | { readonly number: AeonicFiniteNumber; readonly history: AeonicArithmeticHistory }
    | { readonly number: AeonicExactNumber; readonly history: AeonicArithmeticHistory }
    | { readonly number: AeonicExactRational; readonly history: AeonicArithmeticHistory };
  readonly metadata: AeonicRationalArithmeticMetadata;
}
export type AeonicRationalArithmeticResult = AeonicRationalArithmeticValueResult | AeonicRationalArithmeticDiagnostic;
/** Structured JSON admission. Requires explicit rational profile at runtime; no profile fallback. */
export function evaluateAeonicRationalArithmetic(request: AeonicRationalArithmeticRequest, options?: AeonicRationalArithmeticOptions): AeonicRationalArithmeticResult;
/** Verbatim scalar JSON ingress with byte/depth/duplicate-key admission. */
export function evaluateAeonicRationalArithmeticText(requestText: string, options?: AeonicRationalArithmeticOptions): AeonicRationalArithmeticResult;
