import type { AeonicTemporalOperand } from './aeonic-temporal-civil-date.js';
import type { AeonicCivilClockOperand } from './aeonic-temporal-civil-clock.js';
import type { AeonicDerivedDateTimeBundle } from './aeonic-temporal-civil-datetime.js';
export const AEONIC_TEMPORAL_CIVIL_ANCHOR_PROFILE: 'aeonic.operations.temporal.civil-anchor.v1';
export interface AeonicCivilAnchorResourceLimits {
  readonly maxRequestBytes: number;
  readonly maxRequestDepth: number;
  readonly maxTemporalCharacters: number;
  readonly maxInputRanges: number;
  readonly maxInputPieces: number;
  readonly maxRelativeDayDigits: number;
  readonly maxFractionDigits: number;
  readonly maxWork: number;
  readonly maxIntermediatePieces: number;
  readonly maxOutputPieces: number;
  readonly maxResultBytes: number;
}
export const AEONIC_TEMPORAL_CIVIL_ANCHOR_DEFAULT_RESOURCE_LIMITS: Readonly<AeonicCivilAnchorResourceLimits>;
export interface AeonicCivilAnchorOptions {
  readonly resourceLimits?: Partial<AeonicCivilAnchorResourceLimits>;
  readonly capabilities?: readonly 'anchoring'[];
}
export interface AeonicCivilAnchorProfile { readonly profile?: string }
export interface AeonicCivilAnchorRequest {
  readonly operation: 'anchor';
  readonly input: {
    /** Coverage must be exactly one day; origin metadata does not determine eligibility. */
    readonly anchor: AeonicTemporalOperand;
    readonly clock: AeonicCivilClockOperand;
    readonly context?: AeonicCivilAnchorProfile;
    readonly policy?: AeonicCivilAnchorProfile;
  };
}
export interface AeonicCivilAnchorDiagnostic {
  readonly outcome: 'diagnostic';
  readonly reason: 'invalid_operand' | 'invalid_policy' | 'unsupported_profile' | 'unsupported_operation'
    | 'unsupported_domain' | 'incompatible_operand' | 'unrepresentable_result' | 'resource_limit';
  readonly context: { readonly stage: 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly path: string | null };
  readonly message?: string;
}
export interface AeonicCivilAnchorValueResult {
  readonly outcome: 'value';
  readonly value: AeonicDerivedDateTimeBundle;
  readonly metadata: {
    readonly evaluation: 'exact-for-policy';
    readonly clamping: 'not-applied';
    readonly effectivePolicy: { readonly profile: typeof AEONIC_TEMPORAL_CIVIL_ANCHOR_PROFILE };
  };
}
export type AeonicCivilAnchorResult = AeonicCivilAnchorValueResult | AeonicCivilAnchorDiagnostic;
/** Explicit profile required. Retain the complete result.value for date-time continuation. */
export function evaluateAeonicCivilAnchor(request: AeonicCivilAnchorRequest, options?: AeonicCivilAnchorOptions): AeonicCivilAnchorResult;
/** Verbatim logical JSON retains duplicate-key and raw numerical evidence. */
export function evaluateAeonicCivilAnchorText(requestText: string, options?: AeonicCivilAnchorOptions): AeonicCivilAnchorResult;
