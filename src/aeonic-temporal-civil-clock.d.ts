import type { AeonicArithmeticOperand } from './aeonic-arithmetic.js';

export const AEONIC_TEMPORAL_CIVIL_CLOCK_PROFILE: 'aeonic.operations.temporal.civil-clock.v1';
export interface AeonicCivilClockResourceLimits {
  readonly maxRequestBytes: number;
  readonly maxRequestDepth: number;
  readonly maxTemporalCharacters: number;
  readonly maxInputPieces: number;
  readonly maxIntermediatePieces: number;
  readonly maxOutputPieces: number;
  readonly maxWork: number;
  readonly maxFractionDigits: number;
  readonly maxRelativeDayDigits: number;
  readonly maxCountCharacters: number;
  readonly maxNumericCharacters: number;
  readonly maxCoefficientDigits: number;
  readonly maxExponentMagnitude: number;
  readonly maxWorkspaceDigits: number;
  readonly maxOutputCharacters: number;
  readonly maxResultBytes: number;
}
export const AEONIC_TEMPORAL_CIVIL_CLOCK_DEFAULT_RESOURCE_LIMITS: Readonly<AeonicCivilClockResourceLimits>;
export interface AeonicCivilClockOptions {
  readonly resourceLimits?: Partial<AeonicCivilClockResourceLimits>;
  readonly capabilities?: readonly ('relations' | 'arithmetic')[];
}
export type AeonicCivilClockForm = 'hour' | 'minute' | 'second';
export type AeonicCivilClockOrigin = AeonicCivilClockForm | 'undeclared';
export type AeonicCivilClockHistory = 'none-declared' | 'approximation-declared';
export interface AeonicCivilClockCoordinate {
  /** Canonical signed integer text: 0, 1, -1; no calendar date is assigned. */
  readonly day: string;
  /** Full canonical HH:MM:SS[.fraction], with no trailing fractional zeroes. */
  readonly time: string;
}
export interface AeonicCivilClockPoint { readonly kind: 'point'; readonly at: AeonicCivilClockCoordinate }
export interface AeonicCivilClockInterval {
  readonly kind: 'interval';
  readonly start: AeonicCivilClockCoordinate;
  readonly end: AeonicCivilClockCoordinate;
  readonly includeStart: boolean;
  readonly includeEnd: boolean;
}
export interface AeonicCivilClockSet {
  readonly category: 'civilClockSet';
  /** Nonempty canonical sorted pieces, preserving gaps and excluded endpoints. */
  readonly pieces: readonly (AeonicCivilClockPoint | AeonicCivilClockInterval)[];
}
export interface AeonicAuthoredClockBundle {
  readonly temporal: { readonly category: 'civilClock'; readonly value: string };
  readonly originClockForm?: AeonicCivilClockOrigin;
  readonly history?: AeonicCivilClockHistory;
}
export interface AeonicDerivedClockBundle {
  readonly temporal: AeonicCivilClockSet;
  readonly originClockForm: AeonicCivilClockOrigin;
  readonly history: AeonicCivilClockHistory;
}
export interface AeonicMaterializedClockBundle extends AeonicAuthoredClockBundle {
  readonly originClockForm: AeonicCivilClockOrigin;
  readonly history: AeonicCivilClockHistory;
}
export type AeonicCivilClockOperand = AeonicAuthoredClockBundle | AeonicDerivedClockBundle;
export interface AeonicCivilClockProfile { readonly profile?: string }
export interface AeonicCivilClockRelationRequest {
  readonly operation: 'equal' | 'compare' | 'relate';
  readonly input: { readonly left: AeonicCivilClockOperand; readonly right: AeonicCivilClockOperand;
    readonly context?: AeonicCivilClockProfile; readonly policy?: AeonicCivilClockProfile };
}
export interface AeonicCivilClockShiftRequest {
  readonly operation: 'shiftClock';
  readonly input: { readonly value: AeonicCivilClockOperand;
    /** Finite authored or normalized exact decimal; rational amounts need explicit quantization first. */
    readonly amount: AeonicArithmeticOperand;
    readonly context?: AeonicCivilClockProfile; readonly policy?: AeonicCivilClockProfile };
}
export interface AeonicCivilClockOutputPolicy extends AeonicCivilClockProfile { readonly clockForm: AeonicCivilClockForm }
export interface AeonicCivilClockStepRequest {
  readonly operation: 'step';
  readonly input: { readonly value: AeonicCivilClockOperand; readonly context?: AeonicCivilClockProfile;
    readonly policy: AeonicCivilClockOutputPolicy & { readonly count: string } };
}
export interface AeonicCivilClockMaterializeRequest {
  readonly operation: 'materialize';
  readonly input: { readonly value: AeonicCivilClockOperand; readonly context?: AeonicCivilClockProfile;
    readonly policy: AeonicCivilClockOutputPolicy };
}
export type AeonicCivilClockArithmeticRequest = AeonicCivilClockShiftRequest | AeonicCivilClockStepRequest | AeonicCivilClockMaterializeRequest;
export type AeonicCivilClockRequest = AeonicCivilClockArithmeticRequest | AeonicCivilClockRelationRequest;
export interface AeonicCivilClockDiagnostic {
  readonly outcome: 'diagnostic';
  readonly reason: 'invalid_operand' | 'invalid_policy' | 'unsupported_profile' | 'unsupported_operation'
    | 'unsupported_domain' | 'incompatible_operand' | 'unrepresentable_result' | 'resource_limit';
  readonly context: { readonly stage: 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly path: string | null };
  readonly message?: string;
}
export interface AeonicCivilClockMetadata {
  readonly evaluation: 'exact-for-policy';
  readonly effectivePolicy: { readonly profile: typeof AEONIC_TEMPORAL_CIVIL_CLOCK_PROFILE;
    readonly count?: string; readonly clockForm?: AeonicCivilClockForm };
}
export interface AeonicCivilClockArithmeticValueResult {
  readonly outcome: 'value';
  readonly value: AeonicDerivedClockBundle | AeonicMaterializedClockBundle;
  readonly metadata: AeonicCivilClockMetadata;
}
export interface AeonicCivilClockRelationValueResult {
  readonly outcome: 'value';
  readonly value: { readonly category: 'symbol'; readonly value: 'equal' | 'notEqual' | 'before' | 'after' | 'indeterminate'
    | 'contains' | 'containedBy' | 'overlaps' | 'disjoint' };
  readonly metadata: AeonicCivilClockMetadata & {
    readonly operandHistory: { readonly left: AeonicCivilClockHistory; readonly right: AeonicCivilClockHistory };
    readonly operandOrigin: { readonly left: AeonicCivilClockOrigin; readonly right: AeonicCivilClockOrigin };
  };
}
export type AeonicCivilClockArithmeticResult = AeonicCivilClockArithmeticValueResult | AeonicCivilClockDiagnostic;
export type AeonicCivilClockRelationResult = AeonicCivilClockRelationValueResult | AeonicCivilClockDiagnostic;
export type AeonicCivilClockResult = AeonicCivilClockArithmeticValueResult | AeonicCivilClockRelationValueResult | AeonicCivilClockDiagnostic;
/** Explicit profile selection required. Full returned bundles retain relative days for chaining. */
export function evaluateAeonicCivilClock(request: AeonicCivilClockArithmeticRequest, options?: AeonicCivilClockOptions): AeonicCivilClockArithmeticResult;
export function evaluateAeonicCivilClock(request: AeonicCivilClockRelationRequest, options?: AeonicCivilClockOptions): AeonicCivilClockRelationResult;
export function evaluateAeonicCivilClock(request: AeonicCivilClockRequest, options?: AeonicCivilClockOptions): AeonicCivilClockResult;
/** Verbatim logical JSON preserves duplicate-key and raw numeric evidence. */
export function evaluateAeonicCivilClockText(requestText: string, options?: AeonicCivilClockOptions): AeonicCivilClockResult;
