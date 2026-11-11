export const AEONIC_COMPARISON_BASELINE_PROFILE: 'aeonic.operations.comparison.baseline.v1';
export const AEONIC_COMPARISON_CODEPOINT_PROFILE: 'aeonic.operations.string.codepoint.v1';

export interface AeonicComparisonResourceLimits {
  readonly maxRequestBytes: number;
  readonly maxRequestDepth: number;
  readonly maxNumericCharacters: number;
  readonly maxStringScalars: number;
  readonly maxSymbolScalars: number;
  readonly maxDeclarations: number;
  readonly maxDeclaredSymbols: number;
}
export const AEONIC_COMPARISON_DEFAULT_RESOURCE_LIMITS: Readonly<AeonicComparisonResourceLimits>;
export interface AeonicComparisonOptions {
  readonly resourceLimits?: Partial<AeonicComparisonResourceLimits>;
}
export interface AeonicComparisonSymbol {
  readonly category: 'symbol';
  readonly value: string;
}
export type AeonicComparisonOperand =
  | { readonly category: 'finiteNumber' | 'string'; readonly value: string }
  | { readonly category: 'boolean'; readonly value: boolean }
  | AeonicComparisonSymbol
  | {
      readonly category: 'positiveInfinity' | 'negativeInfinity' | 'nan' | 'explicitNull'
        | 'explicitAbsence' | 'toggle' | 'hex' | 'radix' | 'encoding' | 'separator'
        | 'sansaAddress' | 'referenceForm' | 'temporal' | 'container';
      readonly [field: string]: unknown;
    };
export interface AeonicComparisonDeclaration {
  readonly id: string;
  readonly version: string;
  readonly order: readonly AeonicComparisonSymbol[];
}
export type AeonicComparisonSymbolSelection =
  | { readonly mode: 'string-profile'; readonly profile: string }
  | {
      readonly mode: 'declared-order';
      readonly declaration: { readonly order: readonly AeonicComparisonSymbol[] }
        | { readonly reference: { readonly id: string; readonly version: string } };
    };
export interface AeonicComparisonPolicy {
  readonly profile?: string;
  readonly strings?: { readonly profile: string };
  readonly symbols?: AeonicComparisonSymbolSelection;
}
export interface AeonicComparisonContext extends AeonicComparisonPolicy {
  readonly declarations?: readonly AeonicComparisonDeclaration[];
}
export interface AeonicComparisonRequest {
  readonly operation: 'equal' | 'compare';
  readonly input: {
    readonly left: AeonicComparisonOperand;
    readonly right: AeonicComparisonOperand;
    readonly policy?: AeonicComparisonPolicy;
    readonly context?: AeonicComparisonContext;
  };
}
export type AeonicComparisonDiagnosticReason = 'invalid_operand' | 'unsupported_domain'
  | 'incompatible_comparison' | 'unsupported_operation' | 'unsupported_profile'
  | 'invalid_policy' | 'undeclared_symbol' | 'resource_limit';
export type AeonicComparisonResult =
  | {
      readonly outcome: 'value';
      readonly value: { readonly category: 'symbol'; readonly value: 'equal' | 'notEqual' | 'less' | 'greater' };
      readonly metadata: {
        readonly effectivePolicy: {
          readonly profile: typeof AEONIC_COMPARISON_BASELINE_PROFILE;
          readonly domain: 'finiteNumber' | 'string' | 'boolean' | 'symbol';
          readonly comparison: 'exact-numeric' | 'boolean' | 'string-profile';
          readonly strings: { readonly profile: typeof AEONIC_COMPARISON_CODEPOINT_PROFILE };
          readonly symbols: { readonly mode: 'string-profile'; readonly profile: typeof AEONIC_COMPARISON_CODEPOINT_PROFILE };
        };
      };
    }
  | {
      readonly outcome: 'diagnostic';
      readonly reason: AeonicComparisonDiagnosticReason;
      readonly context: { readonly stage: 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly path: string | null };
      readonly message?: string;
    };
/** Typed logical operands; no JSON serialization or implicit numeric coercion. */
export function evaluateAeonicComparison(request: AeonicComparisonRequest, options?: AeonicComparisonOptions): AeonicComparisonResult;
/** Exact JSON ingress, with byte/depth admission and duplicate-member rejection. */
export function evaluateAeonicComparisonText(requestText: string, options?: AeonicComparisonOptions): AeonicComparisonResult;
