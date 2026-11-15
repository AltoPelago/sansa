export const AEONIC_TEMPORAL_CIVIL_DATE_PROFILE: 'aeonic.operations.temporal.civil-date.v1';
export interface AeonicTemporalResourceLimits {
  readonly maxRequestBytes: number;
  readonly maxRequestDepth: number;
  readonly maxInputRanges: number;
  readonly maxCountCharacters: number;
  readonly maxOutputRanges: number;
  readonly maxCalendarWork: number;
  readonly maxOutputCharacters: number;
  readonly maxResultBytes: number;
}
export const AEONIC_TEMPORAL_CIVIL_DATE_DEFAULT_RESOURCE_LIMITS: Readonly<AeonicTemporalResourceLimits>;
export type AeonicTemporalCapability = 'relations' | 'calendar';
export interface AeonicTemporalOptions {
  readonly resourceLimits?: Partial<AeonicTemporalResourceLimits>;
  readonly capabilities?: readonly AeonicTemporalCapability[];
}
export type AeonicTemporalGranularity = 'day' | 'month' | 'year';
export type AeonicTemporalOrigin = AeonicTemporalGranularity | 'undeclared';
export type AeonicTemporalHistory = 'none-declared' | 'clamping-declared';
export interface AeonicCivilDate { readonly category: 'civilDate'; readonly value: string }
export interface AeonicCivilDateRange { readonly start: string; readonly end: string }
export interface AeonicCivilDateSet {
  readonly category: 'civilDateSet';
  /** Nonempty, sorted inclusive full-date ranges; disjoint and nonadjacent. */
  readonly ranges: readonly AeonicCivilDateRange[];
}
export interface AeonicAuthoredDateBundle {
  readonly temporal: AeonicCivilDate;
  readonly originGranularity?: AeonicTemporalOrigin;
  readonly history?: AeonicTemporalHistory;
}
export interface AeonicDerivedDateBundle {
  readonly temporal: AeonicCivilDateSet;
  readonly originGranularity: AeonicTemporalOrigin;
  readonly history: AeonicTemporalHistory;
}
/** Successful materialization retains metadata; bare date text does not. */
export interface AeonicMaterializedDateBundle {
  readonly temporal: AeonicCivilDate;
  readonly originGranularity: AeonicTemporalOrigin;
  readonly history: AeonicTemporalHistory;
}
export type AeonicTemporalOperand = AeonicAuthoredDateBundle | AeonicDerivedDateBundle;
export type AeonicTemporalValue = AeonicDerivedDateBundle | AeonicMaterializedDateBundle;
export interface AeonicTemporalProfile { readonly profile?: string }
export interface AeonicTemporalRelationRequest {
  readonly operation: 'equal' | 'compare' | 'relate';
  readonly input: {
    readonly left: AeonicTemporalOperand;
    readonly right: AeonicTemporalOperand;
    readonly context?: AeonicTemporalProfile;
    readonly policy?: AeonicTemporalProfile;
  };
}
export interface AeonicTemporalShiftRequest {
  readonly operation: 'shift';
  readonly input: {
    readonly value: AeonicTemporalOperand;
    readonly context?: AeonicTemporalProfile;
    readonly policy: AeonicTemporalProfile & {
      readonly unit: AeonicTemporalGranularity | 'eom' | 'eoy';
      /** Canonical signed whole-number text; no implicit fractional calendar units. */
      readonly count: string;
    };
  };
}
export interface AeonicTemporalStepRequest {
  readonly operation: 'step';
  readonly input: {
    readonly value: AeonicTemporalOperand;
    readonly context?: AeonicTemporalProfile;
    readonly policy: AeonicTemporalProfile & { readonly granularity: AeonicTemporalGranularity; readonly count: string };
  };
}
export interface AeonicTemporalMaterializeRequest {
  readonly operation: 'materialize';
  readonly input: {
    readonly value: AeonicTemporalOperand;
    readonly context?: AeonicTemporalProfile;
    readonly policy: AeonicTemporalProfile & { readonly granularity: AeonicTemporalGranularity };
  };
}
export type AeonicTemporalCalendarRequest = AeonicTemporalShiftRequest | AeonicTemporalStepRequest | AeonicTemporalMaterializeRequest;
export type AeonicTemporalRequest = AeonicTemporalCalendarRequest | AeonicTemporalRelationRequest;
export interface AeonicTemporalDiagnostic {
  readonly outcome: 'diagnostic';
  readonly reason: 'invalid_operand' | 'invalid_policy' | 'unsupported_profile' | 'unsupported_operation'
    | 'unsupported_domain' | 'incompatible_operand' | 'unrepresentable_result' | 'resource_limit';
  readonly context: { readonly stage: 1 | 2 | 3 | 4 | 5 | 6 | 7; readonly path: string | null };
  readonly message?: string;
}
export interface AeonicTemporalMetadata {
  readonly evaluation: 'exact-for-policy';
  readonly clamping: 'applied' | 'not-applied';
  readonly effectivePolicy: {
    readonly profile: typeof AEONIC_TEMPORAL_CIVIL_DATE_PROFILE;
    readonly unit?: AeonicTemporalGranularity | 'eom' | 'eoy';
    readonly count?: string;
    readonly granularity?: AeonicTemporalGranularity;
  };
}
export interface AeonicTemporalCalendarValueResult {
  readonly outcome: 'value';
  readonly value: AeonicTemporalValue;
  readonly metadata: AeonicTemporalMetadata;
}
export interface AeonicTemporalRelationValueResult {
  readonly outcome: 'value';
  readonly value: { readonly category: 'symbol'; readonly value: 'equal' | 'notEqual' | 'before' | 'after' | 'indeterminate' | 'contains' | 'containedBy' | 'overlaps' | 'disjoint' };
  readonly metadata: AeonicTemporalMetadata & {
    readonly operandHistory: { readonly left: AeonicTemporalHistory; readonly right: AeonicTemporalHistory };
  };
}
export type AeonicTemporalCalendarResult = AeonicTemporalCalendarValueResult | AeonicTemporalDiagnostic;
export type AeonicTemporalRelationResult = AeonicTemporalRelationValueResult | AeonicTemporalDiagnostic;
export type AeonicTemporalResult = AeonicTemporalCalendarValueResult | AeonicTemporalRelationValueResult | AeonicTemporalDiagnostic;
/** Explicit profile selection required at runtime. Complete returned bundles can chain directly. */
export function evaluateAeonicTemporal(request: AeonicTemporalCalendarRequest, options?: AeonicTemporalOptions): AeonicTemporalCalendarResult;
export function evaluateAeonicTemporal(request: AeonicTemporalRelationRequest, options?: AeonicTemporalOptions): AeonicTemporalRelationResult;
export function evaluateAeonicTemporal(request: AeonicTemporalRequest, options?: AeonicTemporalOptions): AeonicTemporalResult;
/** Verbatim scalar JSON ingress, preserving duplicate keys and raw numeric token widths for validation. */
export function evaluateAeonicTemporalText(requestText: string, options?: AeonicTemporalOptions): AeonicTemporalResult;
