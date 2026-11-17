import type { AeonicArithmeticOperand } from './aeonic-arithmetic.js';

export const AEONIC_TEMPORAL_CIVIL_DATETIME_PROFILE: 'aeonic.operations.temporal.civil-datetime.v1';
export interface AeonicCivilDateTimeResourceLimits {
  readonly maxRequestBytes: number;
  readonly maxRequestDepth: number;
  readonly maxTemporalCharacters: number;
  readonly maxInputPieces: number;
  readonly maxIntermediatePieces: number;
  readonly maxOutputPieces: number;
  readonly maxWork: number;
  readonly maxFractionDigits: number;
  readonly maxCountCharacters: number;
  readonly maxNumericCharacters: number;
  readonly maxCoefficientDigits: number;
  readonly maxExponentMagnitude: number;
  readonly maxWorkspaceDigits: number;
  readonly maxOutputCharacters: number;
  readonly maxResultBytes: number;
}
export const AEONIC_TEMPORAL_CIVIL_DATETIME_DEFAULT_RESOURCE_LIMITS: Readonly<AeonicCivilDateTimeResourceLimits>;
export interface AeonicCivilDateTimeOptions {
  readonly resourceLimits?: Partial<AeonicCivilDateTimeResourceLimits>;
  readonly capabilities?: readonly ('relations' | 'arithmetic')[];
}
export type AeonicCivilDateTimeDateGranularity = 'year' | 'month' | 'day';
export type AeonicCivilDateTimeClockForm = 'hour' | 'minute' | 'second';
export interface AeonicCivilDateTimeHistory {
  readonly clamping: 'none-declared' | 'clamping-declared';
  readonly approximation: 'none-declared' | 'approximation-declared';
}
export interface AeonicCivilDateTimeOrigin {
  readonly dateGranularity: AeonicCivilDateTimeDateGranularity | 'undeclared';
  readonly clockForm: AeonicCivilDateTimeClockForm | 'undeclared';
}
export interface AeonicCivilDateTimePoint { readonly kind: 'point'; readonly at: string }
export interface AeonicCivilDateTimeInterval {
  readonly kind: 'interval';
  readonly start: string;
  /** The boundary marker is legal only with includeEnd: false. */
  readonly end: string | { readonly boundary: 'endOfDomain' };
  readonly includeStart: boolean;
  readonly includeEnd: boolean;
}
export interface AeonicCivilDateTimeSet {
  readonly category: 'civilDateTimeSet';
  /** Nonempty canonical sorted pieces. No redundant points or mergeable intervals. */
  readonly pieces: readonly (AeonicCivilDateTimePoint | AeonicCivilDateTimeInterval)[];
}
export interface AeonicAuthoredDateTimeBundle {
  readonly temporal: { readonly category: 'civilDateTime'; readonly value: string };
  readonly originDateGranularity?: AeonicCivilDateTimeOrigin['dateGranularity'];
  readonly originClockForm?: AeonicCivilDateTimeOrigin['clockForm'];
  readonly history?: AeonicCivilDateTimeHistory;
}
export interface AeonicDerivedDateTimeBundle {
  readonly temporal: AeonicCivilDateTimeSet;
  readonly originDateGranularity: AeonicCivilDateTimeOrigin['dateGranularity'];
  readonly originClockForm: AeonicCivilDateTimeOrigin['clockForm'];
  readonly history: AeonicCivilDateTimeHistory;
}
export interface AeonicMaterializedDateTimeBundle extends AeonicAuthoredDateTimeBundle {
  readonly originDateGranularity: AeonicCivilDateTimeOrigin['dateGranularity'];
  readonly originClockForm: AeonicCivilDateTimeOrigin['clockForm'];
  readonly history: AeonicCivilDateTimeHistory;
}
export type AeonicCivilDateTimeOperand = AeonicAuthoredDateTimeBundle | AeonicDerivedDateTimeBundle;
export interface AeonicCivilDateTimeProfile { readonly profile?: string }
export interface AeonicCivilDateTimeRelationRequest {
  readonly operation: 'equal' | 'compare' | 'relate';
  readonly input: { readonly left: AeonicCivilDateTimeOperand; readonly right: AeonicCivilDateTimeOperand;
    readonly context?: AeonicCivilDateTimeProfile; readonly policy?: AeonicCivilDateTimeProfile };
}
export interface AeonicCivilDateTimeShiftRequest {
  readonly operation: 'shift';
  readonly input: { readonly value: AeonicCivilDateTimeOperand; readonly context?: AeonicCivilDateTimeProfile;
    readonly policy: AeonicCivilDateTimeProfile & { readonly unit: 'day' | 'month' | 'year' | 'eom' | 'eoy'; readonly count: string } };
}
export interface AeonicCivilDateTimeClockShiftRequest {
  readonly operation: 'shiftClock';
  readonly input: { readonly value: AeonicCivilDateTimeOperand;
    /** Finite authored or exact-decimal bundle; nonterminating rationals require explicit quantization first. */
    readonly amount: AeonicArithmeticOperand; readonly context?: AeonicCivilDateTimeProfile; readonly policy?: AeonicCivilDateTimeProfile };
}
export interface AeonicCivilDateTimeOutputPolicy extends AeonicCivilDateTimeProfile {
  readonly dateGranularity: AeonicCivilDateTimeDateGranularity;
  readonly clockForm: AeonicCivilDateTimeClockForm;
}
export interface AeonicCivilDateTimeStepRequest {
  readonly operation: 'step';
  readonly input: { readonly value: AeonicCivilDateTimeOperand; readonly context?: AeonicCivilDateTimeProfile;
    readonly policy: AeonicCivilDateTimeOutputPolicy & { readonly count: string } };
}
export interface AeonicCivilDateTimeMaterializeRequest {
  readonly operation: 'materialize';
  readonly input: { readonly value: AeonicCivilDateTimeOperand; readonly context?: AeonicCivilDateTimeProfile;
    readonly policy: AeonicCivilDateTimeOutputPolicy };
}
export type AeonicCivilDateTimeArithmeticRequest = AeonicCivilDateTimeShiftRequest | AeonicCivilDateTimeClockShiftRequest
  | AeonicCivilDateTimeStepRequest | AeonicCivilDateTimeMaterializeRequest;
export type AeonicCivilDateTimeRequest = AeonicCivilDateTimeArithmeticRequest | AeonicCivilDateTimeRelationRequest;
export interface AeonicCivilDateTimeDiagnostic {
  readonly outcome: 'diagnostic';
  readonly reason: 'invalid_operand' | 'invalid_policy' | 'unsupported_profile' | 'unsupported_operation'
    | 'unsupported_domain' | 'incompatible_operand' | 'unrepresentable_result' | 'resource_limit';
  readonly context: { readonly stage: 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly path: string | null };
  readonly message?: string;
}
export interface AeonicCivilDateTimeMetadata {
  readonly evaluation: 'exact-for-policy';
  readonly clamping: 'applied' | 'not-applied';
  readonly effectivePolicy: { readonly profile: typeof AEONIC_TEMPORAL_CIVIL_DATETIME_PROFILE;
    readonly unit?: 'day' | 'month' | 'year' | 'eom' | 'eoy'; readonly count?: string;
    readonly dateGranularity?: AeonicCivilDateTimeDateGranularity; readonly clockForm?: AeonicCivilDateTimeClockForm };
}
export interface AeonicCivilDateTimeArithmeticValueResult {
  readonly outcome: 'value';
  readonly value: AeonicDerivedDateTimeBundle | AeonicMaterializedDateTimeBundle;
  readonly metadata: AeonicCivilDateTimeMetadata;
}
export interface AeonicCivilDateTimeRelationValueResult {
  readonly outcome: 'value';
  readonly value: { readonly category: 'symbol'; readonly value: 'equal' | 'notEqual' | 'before' | 'after' | 'indeterminate'
    | 'contains' | 'containedBy' | 'overlaps' | 'disjoint' };
  readonly metadata: AeonicCivilDateTimeMetadata & {
    readonly operandHistory: { readonly left: AeonicCivilDateTimeHistory; readonly right: AeonicCivilDateTimeHistory };
    readonly operandOrigin: { readonly left: AeonicCivilDateTimeOrigin; readonly right: AeonicCivilDateTimeOrigin };
  };
}
export type AeonicCivilDateTimeArithmeticResult = AeonicCivilDateTimeArithmeticValueResult | AeonicCivilDateTimeDiagnostic;
export type AeonicCivilDateTimeRelationResult = AeonicCivilDateTimeRelationValueResult | AeonicCivilDateTimeDiagnostic;
export type AeonicCivilDateTimeResult = AeonicCivilDateTimeArithmeticValueResult | AeonicCivilDateTimeRelationValueResult | AeonicCivilDateTimeDiagnostic;
/** Explicit versioned profile selection required; full returned bundles chain directly. */
export function evaluateAeonicCivilDateTime(request: AeonicCivilDateTimeArithmeticRequest, options?: AeonicCivilDateTimeOptions): AeonicCivilDateTimeArithmeticResult;
export function evaluateAeonicCivilDateTime(request: AeonicCivilDateTimeRelationRequest, options?: AeonicCivilDateTimeOptions): AeonicCivilDateTimeRelationResult;
export function evaluateAeonicCivilDateTime(request: AeonicCivilDateTimeRequest, options?: AeonicCivilDateTimeOptions): AeonicCivilDateTimeResult;
/** Verbatim logical JSON ingress preserves duplicate-key and raw numeric evidence for validation. */
export function evaluateAeonicCivilDateTimeText(requestText: string, options?: AeonicCivilDateTimeOptions): AeonicCivilDateTimeResult;
