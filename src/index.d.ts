export type SansaParseErrorCode =
  | 'SANSA_EMPTY_ADDRESS'
  | 'SANSA_EXPECTED_ROOT'
  | 'SANSA_EXPECTED_TOKEN'
  | 'SANSA_EXPECTED_IDENTIFIER'
  | 'SANSA_EXPECTED_INDEX'
  | 'SANSA_EXPECTED_QUALIFIER'
  | 'SANSA_EXPECTED_QUALIFIER_ARGUMENT'
  | 'SANSA_UNEXPECTED_CHARACTER'
  | 'SANSA_UNEXPECTED_WHITESPACE'
  | 'SANSA_TRAILING_INPUT'
  | 'SANSA_EMPTY_MEMBER_NAME'
  | 'SANSA_EMPTY_LOCAL_SPACE_NAME'
  | 'SANSA_LEADING_ZERO_INDEX'
  | 'SANSA_POSITION_INDEX_LIMIT_EXCEEDED'
  | 'SANSA_INVALID_QUALIFIER'
  | 'SANSA_INVALID_QUALIFIER_ARGUMENT'
  | 'SANSA_INVALID_QUALIFIER_ARGUMENT_CHAR'
  | 'SANSA_RAW_NEWLINE_IN_QUOTED_PAYLOAD'
  | 'SANSA_UNTERMINATED_QUOTED_PAYLOAD'
  | 'SANSA_UNTERMINATED_ESCAPE'
  | 'SANSA_INVALID_ESCAPE'
  | 'SANSA_UNTERMINATED_UNICODE_ESCAPE'
  | 'SANSA_INVALID_UNICODE_ESCAPE'
  | 'SANSA_INVALID_UNICODE_SCALAR'
  | 'SANSA_QUERY_EMPTY'
  | 'SANSA_QUERY_EXPECTED_FROM'
  | 'SANSA_QUERY_EXPECTED_SELECT'
  | 'SANSA_QUERY_SELECT_MUST_BE_TERMINAL'
  | 'SANSA_QUERY_DUPLICATE_CLAUSE'
  | 'SANSA_QUERY_INVALID_CLAUSE_ORDER'
  | 'SANSA_QUERY_UNTERMINATED_BLOCK_COMMENT'
  | 'SANSA_QUERY_EXPECTED_FROM_ADDRESS'
  | 'SANSA_QUERY_INVALID_FROM_ADDRESS'
  | 'SANSA_QUERY_INVALID_FROM_SOURCE'
  | 'SANSA_QUERY_EXPECTED_WHERE_EXPRESSION'
  | 'SANSA_QUERY_EXPECTED_SELECT_EXPRESSION'
  | 'SANSA_QUERY_EXPECTED_ORDER_EXPRESSION'
  | 'SANSA_QUERY_INVALID_OFFSET'
  | 'SANSA_QUERY_INVALID_LIMIT'
  | 'SANSA_QUERY_EXPECTED_EXPRESSION'
  | 'SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN'
  | 'SANSA_QUERY_UNTERMINATED_EXPRESSION'
  | 'SANSA_QUERY_INVALID_NUMBER_LITERAL'
  | 'SANSA_QUERY_EXPECTED_LITERAL_PAYLOAD'
  | 'SANSA_QUERY_INVALID_HEX_LITERAL'
  | 'SANSA_QUERY_INVALID_RADIX_LITERAL'
  | 'SANSA_QUERY_INVALID_ENCODING_LITERAL'
  | 'SANSA_QUERY_INVALID_SEPARATOR_LITERAL'
  | 'SANSA_QUERY_INVALID_NULL_LITERAL'
  | 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL'
  | 'SANSA_QUERY_INVALID_RESOLUTION_EXPRESSION'
  | 'SANSA_QUERY_INVALID_FUNCTION_CALL'
  | 'SANSA_QUERY_INVALID_PROJECTION'
  | 'SANSA_INSTRUCTION_EMPTY'
  | 'SANSA_INSTRUCTION_EXPECTED_MUTATION'
  | 'SANSA_INSTRUCTION_UNTERMINATED_BLOCK_COMMENT'
  | 'SANSA_INSTRUCTION_UNSUPPORTED_QUERY_CLAUSE'
  | 'SANSA_INSTRUCTION_UNSUPPORTED_VERB'
  | 'SANSA_INSTRUCTION_MULTIPLE_MUTATION_VERBS'
  | 'SANSA_INSTRUCTION_DUPLICATE_CLAUSE'
  | 'SANSA_INSTRUCTION_INVALID_CLAUSE_ORDER'
  | 'SANSA_INSTRUCTION_EXPECTED_FROM_ADDRESS'
  | 'SANSA_INSTRUCTION_EXPECTED_WHERE_EXPRESSION'
  | 'SANSA_INSTRUCTION_EXPECTED_WITH'
  | 'SANSA_INSTRUCTION_EXPECTED_IN'
  | 'SANSA_INSTRUCTION_EXPECTED_ADDRESS'
  | 'SANSA_INSTRUCTION_EXPECTED_CREATE_DESTINATION'
  | 'SANSA_INSTRUCTION_INVALID_CREATE_DESTINATION'
  | 'SANSA_INSTRUCTION_EXPECTED_VALUE'
  | 'SANSA_INSTRUCTION_INVALID_DATATYPE'
  | 'SANSA_INSTRUCTION_INVALID_VALUE_LITERAL'
  | 'SANSA_INSTRUCTION_INVALID_PLACEMENT'
  | 'SANSA_PARSE_ERROR';

export type SansaWarningCode =
  | 'SANSA_NON_PORTABLE_POSITION_INDEX';

export interface SansaDiagnostic {
  readonly code: SansaParseErrorCode;
  readonly message: string;
  readonly index: number;
}

export interface SansaWarning {
  readonly code: SansaWarningCode;
  readonly message: string;
  readonly index: number;
  readonly observed?: number;
  readonly portableFloor?: number;
}

export interface SansaParseOptions {
  readonly maxPositionIndex?: number;
}

export interface SansaQueryExpressionParseOptions {
  readonly address?: SansaParseOptions;
}

export interface SansaQueryParseOptions {
  readonly address?: SansaParseOptions;
  readonly expression?: SansaQueryExpressionParseOptions;
}

export interface SansaInstructionParseOptions {
  readonly address?: SansaParseOptions;
  readonly expression?: SansaQueryExpressionParseOptions;
}

export type SansaParseResult =
  | { readonly ok: true; readonly address: SansaAddress; readonly warnings: readonly SansaWarning[] }
  | { readonly ok: false; readonly errors: readonly SansaDiagnostic[] };

export type SansaQueryParseResult =
  | { readonly ok: true; readonly query: SansaQuery; readonly warnings: readonly SansaWarning[] }
  | { readonly ok: false; readonly errors: readonly SansaDiagnostic[] };

export type SansaQueryExpressionParseResult =
  | { readonly ok: true; readonly expression: SansaQueryExpression; readonly warnings: readonly SansaWarning[] }
  | { readonly ok: false; readonly errors: readonly SansaDiagnostic[] };

export type SansaInstructionParseResult =
  | { readonly ok: true; readonly instruction: SansaInstruction; readonly warnings: readonly SansaWarning[] }
  | { readonly ok: false; readonly errors: readonly SansaDiagnostic[] };

export type SansaResolveErrorCode =
  | 'SANSA_RESOLVE_EXPECTED_NAMESPACE'
  | 'SANSA_RESOLVE_MISSING_ROOT'
  | 'SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT'
  | 'SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE'
  | 'SANSA_RESOLVE_UNSUPPORTED_LOCAL_SPACE'
  | 'SANSA_RESOLVE_UNSUPPORTED_PARENT'
  | 'SANSA_RESOLVE_PARENT_TRAVERSAL_FORBIDDEN'
  | 'SANSA_RESOLVE_BOUNDARY_ESCAPE_FORBIDDEN'
  | 'SANSA_RESOLVE_EXACT_MULTIPLICITY_VIOLATION'
  | 'SANSA_RESOLVE_UNSUPPORTED_SELECTOR';

export type SansaQueryEvaluateErrorCode =
  | 'SANSA_QUERY_POLICY_VIOLATION'
  | 'SANSA_QUERY_BUDGET_EXCEEDED'
  | 'SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION'
  | 'SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION'
  | 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL'
  | 'SANSA_QUERY_EVALUATE_UNSUPPORTED_EXPRESSION'
  | 'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN'
  | 'SANSA_QUERY_EVALUATE_EXPECTED_SCALAR'
  | 'SANSA_QUERY_EVALUATE_MISSING_SCALAR'
  | 'SANSA_QUERY_EVALUATE_CARDINALITY'
  | 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON'
  | 'SANSA_QUERY_EVALUATE_INVALID_FROM_SOURCE'
  | 'SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL'
  | 'SANSA_QUERY_EVALUATE_INVALID_REFERENCE_TARGET'
  | 'SANSA_QUERY_EVALUATE_MISSING_REFERENCE_TARGET'
  | 'SANSA_QUERY_EVALUATE_INVALID_EXISTENCE_ARGUMENT'
  | 'SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT';

export type SansaMutateErrorCode =
  | 'SANSA_MUTATE_INVALID_REQUEST'
  | 'SANSA_MUTATE_INVALID_PLAN'
  | 'SANSA_MUTATE_INVALID_OPERATION'
  | 'SANSA_MUTATE_UNSUPPORTED_OPERATION'
  | 'SANSA_MUTATE_UNSUPPORTED_PLACEMENT'
  | 'SANSA_MUTATE_INVALID_TARGET'
  | 'SANSA_MUTATE_NON_EXACT_TARGET'
  | 'SANSA_MUTATE_TARGET_RESOLUTION_FAILED'
  | 'SANSA_MUTATE_TARGET_MISS'
  | 'SANSA_MUTATE_TARGET_MULTIPLICITY'
  | 'SANSA_MUTATE_TARGET_EXISTS'
  | 'SANSA_MUTATE_INVALID_PRECONDITION'
  | 'SANSA_MUTATE_INVALID_VALUE_SEMANTICS_PROFILE'
  | 'SANSA_MUTATE_INVALID_DATATYPE'
  | 'SANSA_MUTATE_INVALID_KIND'
  | 'SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED'
  | 'SANSA_MUTATE_PRECONDITION_FAILED'
  | 'SANSA_MUTATE_BUDGET_EXCEEDED'
  | 'SANSA_MUTATE_DUPLICATE_TARGET'
  | 'SANSA_MUTATE_INVALID_NAME'
  | 'SANSA_MUTATE_ROOT_REMOVE_FORBIDDEN'
  | 'SANSA_MUTATE_INVALID_ANCHOR'
  | 'SANSA_MUTATE_INVALID_MOVE_ANCHOR'
  | 'SANSA_MUTATE_INVALID_MOVE_CONTAINER'
  | 'SANSA_MUTATE_STALE_TARGET'
  | 'SANSA_MUTATE_UNSUPPORTED_ADAPTER_OPERATION'
  | 'SANSA_MUTATE_ATOMIC_APPLY_UNAVAILABLE'
  | 'SANSA_MUTATE_TARGET_UNSUPPORTED_DATATYPE'
  | 'SANSA_MUTATE_TARGET_UNSUPPORTED_FEATURE'
  | 'SANSA_MUTATE_TARGET_UNSUPPORTED_VALUE'
  | 'SANSA_MUTATE_TARGET_UNSUPPORTED_OPERATION'
  | 'SANSA_MUTATE_APPLY_FAILED';

export interface SansaResolveDiagnostic {
  readonly code: SansaResolveErrorCode | SansaParseErrorCode;
  readonly message: string;
  readonly index?: number;
  readonly selectorIndex?: number;
}

export interface SansaQueryEvaluateDiagnostic {
  readonly code: SansaQueryEvaluateErrorCode | SansaResolveErrorCode | SansaParseErrorCode;
  readonly message: string;
  readonly phase?: 'parse' | 'policy' | 'from' | 'where' | 'order' | 'select';
  readonly candidateAddress?: string;
  readonly index?: number;
  readonly selectorIndex?: number;
  readonly extension?: string;
  readonly budget?: string;
  readonly limit?: number;
  readonly observed?: number;
}

export interface SansaMutateDiagnostic {
  readonly code: SansaMutateErrorCode | SansaResolveErrorCode | SansaParseErrorCode;
  readonly message: string;
  readonly phase?: 'plan' | 'target' | 'apply';
  readonly operationIndex?: number;
  readonly preconditionIndex?: number;
  readonly targetFormat?: string;
  readonly datatype?: string;
  readonly budget?: string;
  readonly limit?: number;
  readonly observed?: number;
  readonly cause?: unknown;
}

export interface SansaResolveBinding {
  readonly address?: string;
  readonly name?: string;
  readonly key?: string;
  readonly index?: number;
  readonly semanticType?: string;
  readonly datatype?: string;
  readonly representationKind?: string;
  readonly kind?: string;
  readonly type?: string;
  readonly scalarKind?: string;
  readonly valueKind?: string;
  readonly literalKind?: string;
  readonly nullReason?: string;
  readonly value?: unknown;
  readonly scalar?: unknown;
  readonly children?: readonly SansaResolveBinding[];
  readonly parent?: SansaResolveBinding | null;
  readonly attributeSpace?: SansaResolveBinding;
  readonly attributes?: SansaResolveBinding;
}

export interface SansaResolveNamespace<TBinding extends object = SansaResolveBinding> {
  readonly root: TBinding | (() => TBinding | undefined);
  readonly contextualRoot?: TBinding;
  readonly children?: (binding: TBinding) => Iterable<TBinding> | readonly TBinding[] | undefined;
  readonly parent?: (binding: TBinding) => TBinding | undefined;
  readonly member?: (binding: TBinding, name: string) => TBinding | undefined;
  readonly position?: (binding: TBinding, index: number) => TBinding | undefined;
  readonly attributeSpace?: (binding: TBinding) => TBinding | undefined;
  readonly localSpace?: (binding: TBinding, name: string) => TBinding | undefined;
  readonly name?: (binding: TBinding) => string | undefined;
  readonly index?: (binding: TBinding) => number | undefined;
  readonly semanticType?: (binding: TBinding) => string | undefined;
  readonly representationKind?: (binding: TBinding) => string | undefined;
  readonly value?: (binding: TBinding) => unknown;
  readonly nullReason?: (binding: TBinding) => string | undefined;
  readonly semanticTypeMatches?: (binding: TBinding, expected: string) => boolean;
  readonly representationKindMatches?: (binding: TBinding, expected: string) => boolean;
  readonly bindingHandle?: (binding: TBinding) => unknown;
  readonly observedState?: (binding: TBinding) => unknown;
  readonly namespaceState?: (() => unknown) | unknown;
  readonly mutate?: SansaMutationAdapter<TBinding>;
}

export interface SansaResolveOptions<TBinding extends object = SansaResolveBinding> {
  readonly parse?: SansaParseOptions;
  readonly contextualRoot?: TBinding;
  readonly allowParentFromEffectiveRoot?: boolean;
  readonly parentTraversal?: 'allow' | 'forbid';
  readonly failOnParentFromEffectiveRoot?: boolean;
}

export type SansaResolveResult<TBinding extends object = SansaResolveBinding> =
  | { readonly ok: true; readonly bindings: readonly TBinding[]; readonly diagnostics: readonly SansaResolveDiagnostic[] }
  | { readonly ok: false; readonly bindings: readonly TBinding[]; readonly errors: readonly SansaResolveDiagnostic[] };

export interface SansaQueryEvaluateOptions<TBinding extends object = SansaResolveBinding> {
  readonly parse?: SansaQueryParseOptions;
  readonly resolve?: SansaResolveOptions<TBinding>;
  readonly valueSemantics?: AeonValueSemanticsProfileInput;
  readonly policy?: 'validation' | { readonly mode?: 'validation'; readonly validation?: boolean };
  readonly extensions?: {
    readonly transform?: boolean;
    readonly objectFrom?: boolean;
    readonly fieldsFrom?: boolean;
  };
  readonly enabledExtensions?: readonly string[];
  readonly budget?: {
    readonly maxFromBindings?: number;
    readonly maxWhereCandidates?: number;
    readonly maxOrderCandidates?: number;
    readonly maxResultRecords?: number;
  };
}

export type SansaQueryEvaluateResult<TBinding extends object = SansaResolveBinding> =
  | { readonly ok: true; readonly results: readonly SansaQueryResult<TBinding>[]; readonly diagnostics: readonly SansaQueryEvaluateDiagnostic[] }
  | { readonly ok: false; readonly results: readonly SansaQueryResult<TBinding>[]; readonly errors: readonly SansaQueryEvaluateDiagnostic[] };

export interface SansaQueryResult<TBinding extends object = SansaResolveBinding> {
  readonly type: 'queryResult';
  /** Canonical candidate address retained for backwards-compatible result consumers. */
  readonly address?: string;
  readonly candidateAddress?: string;
  readonly valueAddress?: string;
  readonly kind: 'binding' | 'derived';
  readonly binding: TBinding;
  readonly value: SansaQueryValue<TBinding>;
}

export interface SansaMutationAdapter<TBinding extends object = SansaResolveBinding> {
  readonly supportsCreate?: boolean;
  readonly supportsReplace?: boolean;
  readonly supportsRemove?: boolean;
  readonly supportsOrderedInsert?: boolean;
  readonly supportsMove?: boolean;
  readonly supportsStableBindingIdentity?: boolean;
  readonly supportsAtomicApply?: boolean;
  readonly namespaceState?: () => unknown;
  readonly bindingHandle?: (binding: TBinding) => unknown;
  readonly observedState?: (binding: TBinding) => unknown;
  readonly sameBinding?: (left: TBinding, right: TBinding) => boolean;
  readonly create?: (
    parent: TBinding,
    name: string,
    value: unknown,
    operation: SansaCreateMutationOperation<TBinding>,
  ) => SansaMutationAdapterResult<TBinding> | void;
  readonly replace?: (
    target: TBinding,
    value: unknown,
    operation: SansaReplaceMutationOperation<TBinding>,
  ) => SansaMutationAdapterResult<TBinding> | void;
  readonly remove?: (
    target: TBinding,
    operation: SansaRemoveMutationOperation<TBinding>,
  ) => SansaMutationAdapterResult<TBinding> | void;
  readonly insert?: (
    container: TBinding,
    placement: SansaMutationPlacement<TBinding>,
    value: unknown,
    operation: SansaInsertMutationOperation<TBinding>,
  ) => SansaMutationAdapterResult<TBinding> | void;
  readonly move?: (
    source: TBinding,
    container: TBinding,
    placement: SansaMutationPlacement<TBinding>,
    operation: SansaMoveMutationOperation<TBinding>,
  ) => SansaMutationAdapterResult<TBinding> | void;
}

export type SansaMutationAdapterResult<TBinding extends object = SansaResolveBinding> =
  | {
      readonly ok?: true;
      readonly binding?: TBinding;
      readonly affectedBinding?: TBinding;
      readonly affectedAddress?: string;
      readonly resultingAddress?: string;
    }
  | { readonly ok: false; readonly message?: string; readonly error?: Error };

export type SansaMutationRequest<TBinding extends object = SansaResolveBinding> =
  | SansaMutationRequestEnvelope<TBinding>
  | SansaRequestedMutationOperation
  | readonly SansaRequestedMutationOperation[];

export interface SansaMutationRequestEnvelope<TBinding extends object = SansaResolveBinding> {
  readonly operations: readonly SansaRequestedMutationOperation[];
  readonly preconditions?: readonly SansaMutationPreconditionInput[];
  readonly provenance?: unknown;
}

export interface SansaMutationPreconditionInput {
  readonly expression: string;
  readonly target?: string | SansaAddress;
}

export type SansaRequestedMutationOperation =
  | SansaRequestedCreateOperation
  | SansaRequestedReplaceOperation
  | SansaRequestedRemoveOperation
  | SansaRequestedInsertOperation
  | SansaRequestedMoveOperation;

export interface SansaRequestedCreateOperation {
  readonly op: 'create';
  readonly parent: string | SansaAddress;
  readonly name: string;
  readonly datatype?: string;
  readonly kind?: string;
  readonly value: unknown;
  readonly provenance?: unknown;
}

export interface SansaRequestedReplaceOperation {
  readonly op: 'replace';
  readonly target: string | SansaAddress;
  readonly datatype?: string;
  readonly kind?: string;
  readonly value: unknown;
  readonly provenance?: unknown;
}

export interface SansaRequestedRemoveOperation {
  readonly op: 'remove';
  readonly target: string | SansaAddress;
  readonly provenance?: unknown;
}

export interface SansaRequestedInsertOperation {
  readonly op: 'insert';
  readonly container: string | SansaAddress;
  readonly placement: SansaRequestedMutationPlacement;
  readonly datatype?: string;
  readonly kind?: string;
  readonly value: unknown;
  readonly provenance?: unknown;
}

export interface SansaRequestedMoveOperation {
  readonly op: 'move';
  readonly source: string | SansaAddress;
  readonly container: string | SansaAddress;
  readonly placement: SansaRequestedMutationPlacement;
  readonly provenance?: unknown;
}

export type SansaRequestedMutationPlacement =
  | 'first'
  | 'last'
  | { readonly kind: 'first' | 'last' }
  | { readonly kind: 'before' | 'after'; readonly anchor: string | SansaAddress }
  | { readonly kind: 'before' | 'after'; readonly target: string | SansaAddress };

export type SansaPlanMutationResult<TBinding extends object = SansaResolveBinding> =
  | { readonly ok: true; readonly plan: SansaMutationPlan<TBinding>; readonly diagnostics: readonly SansaMutateDiagnostic[] }
  | { readonly ok: false; readonly errors: readonly SansaMutateDiagnostic[] };

/**
 * Current-process mutation execution artifact.
 *
 * Plans retain live resolver bindings and local adapter continuity artifacts.
 * They are inspectable but are not a portable serialized plan format.
 */
export interface SansaMutationPlan<TBinding extends object = SansaResolveBinding> {
  readonly type: 'SansaMutationPlan';
  readonly planVersion: 'sansa.mutate.plan.v1';
  readonly planId?: string;
  readonly namespaceState?: unknown;
  readonly operations: readonly SansaMutationOperation<TBinding>[];
  readonly preconditions: readonly SansaMutationPrecondition<TBinding>[];
  readonly sourceProvenance?: unknown;
  readonly portabilityWarnings?: readonly SansaDiagnostic[];
  readonly diagnostics: readonly SansaMutateDiagnostic[];
}

export type SansaMutationTargetSurfaceInput<TBinding extends object = SansaResolveBinding> =
  | 'aeon'
  | 'json'
  | 'json-compatible'
  | SansaMutationTargetSurface<TBinding>;

export interface SansaMutationTargetSurface<TBinding extends object = SansaResolveBinding> {
  readonly id?: string;
  readonly validateOperation: (
    operation: SansaMutationOperation<TBinding>,
    context: SansaMutationTargetSurfaceContext<TBinding>,
  ) => SansaMutationTargetSurfaceOperationResult;
}

export interface SansaMutationTargetSurfaceContext<TBinding extends object = SansaResolveBinding> {
  readonly plan: SansaMutationPlan<TBinding>;
  readonly operationIndex: number;
  readonly targetFormat: string;
}

export type SansaMutationTargetSurfaceOperationResult =
  | boolean
  | void
  | { readonly ok: true }
  | { readonly ok: false; readonly error?: SansaMutateDiagnostic; readonly errors?: readonly SansaMutateDiagnostic[]; readonly code?: SansaMutateErrorCode; readonly message?: string };

export type SansaValidateMutationPlanTargetResult =
  | { readonly ok: true; readonly diagnostics: readonly SansaMutateDiagnostic[] }
  | { readonly ok: false; readonly errors: readonly SansaMutateDiagnostic[] };

export interface SansaMutationPrecondition<TBinding extends object = SansaResolveBinding> {
  readonly expression: string;
  readonly canonical: string;
  readonly target?: SansaMutationTarget<TBinding>;
}

export type SansaMutationOperation<TBinding extends object = SansaResolveBinding> =
  | SansaCreateMutationOperation<TBinding>
  | SansaReplaceMutationOperation<TBinding>
  | SansaRemoveMutationOperation<TBinding>
  | SansaInsertMutationOperation<TBinding>
  | SansaMoveMutationOperation<TBinding>;

/**
 * Exact binding reference captured during planning.
 *
 * `binding`, `bindingHandle`, and `observedState` are local namespace-adapter
 * artifacts used for same-process stale-target checks.
 */
export interface SansaMutationTarget<TBinding extends object = SansaResolveBinding> {
  readonly requestedAddress: string;
  readonly canonicalAddress: string;
  readonly address: SansaAddress;
  readonly binding: TBinding;
  readonly bindingHandle?: unknown;
  readonly observedState?: unknown;
  readonly portabilityWarnings?: readonly SansaDiagnostic[];
}

export interface SansaCreateMutationOperation<TBinding extends object = SansaResolveBinding> {
  readonly op: 'create';
  readonly parent: SansaMutationTarget<TBinding>;
  readonly name: string;
  readonly datatype?: string;
  readonly kind?: string;
  readonly value: unknown;
  readonly provenance?: unknown;
}

export interface SansaReplaceMutationOperation<TBinding extends object = SansaResolveBinding> {
  readonly op: 'replace';
  readonly target: SansaMutationTarget<TBinding>;
  readonly datatype?: string;
  readonly kind?: string;
  readonly value: unknown;
  readonly provenance?: unknown;
}

export interface SansaRemoveMutationOperation<TBinding extends object = SansaResolveBinding> {
  readonly op: 'remove';
  readonly target: SansaMutationTarget<TBinding>;
  readonly provenance?: unknown;
}

export interface SansaInsertMutationOperation<TBinding extends object = SansaResolveBinding> {
  readonly op: 'insert';
  readonly container: SansaMutationTarget<TBinding>;
  readonly placement: SansaMutationPlacement<TBinding>;
  readonly datatype?: string;
  readonly kind?: string;
  readonly value: unknown;
  readonly provenance?: unknown;
}

export interface SansaMoveMutationOperation<TBinding extends object = SansaResolveBinding> {
  readonly op: 'move';
  readonly source: SansaMutationTarget<TBinding>;
  readonly container: SansaMutationTarget<TBinding>;
  readonly placement: SansaMutationPlacement<TBinding>;
  readonly provenance?: unknown;
}

export type SansaMutationPlacement<TBinding extends object = SansaResolveBinding> =
  | { readonly kind: 'first' | 'last' }
  | { readonly kind: 'before' | 'after'; readonly anchor: SansaMutationTarget<TBinding> };

export interface SansaApplyMutationOptions<TBinding extends object = SansaResolveBinding> {
  readonly resolve?: SansaResolveOptions<TBinding>;
  readonly requireAtomic?: boolean;
  readonly recheckPreconditions?: boolean;
  readonly valueSemantics?: AeonValueSemanticsProfileInput;
  readonly budget?: SansaMutationBudgetOptions;
  readonly parse?: SansaParseOptions | {
    readonly address?: SansaParseOptions;
    readonly expression?: SansaQueryExpressionParseOptions;
  };
}

export interface SansaMutationBudgetOptions {
  readonly maxOperations?: number;
  readonly maxPreconditions?: number;
  readonly maxValueNodes?: number;
  readonly maxValueDepth?: number;
  readonly maxStringLength?: number;
}

export interface SansaPlanMutationOptions<TBinding extends object = SansaResolveBinding> {
  readonly parse?: SansaParseOptions | {
    readonly address?: SansaParseOptions;
    readonly expression?: SansaQueryExpressionParseOptions;
  };
  readonly resolve?: SansaResolveOptions<TBinding>;
  readonly contextualRoot?: TBinding;
  readonly allowParentFromEffectiveRoot?: boolean;
  readonly parentTraversal?: 'allow' | 'forbid';
  readonly failOnParentFromEffectiveRoot?: boolean;
  readonly namespaceState?: unknown;
  readonly valueSemantics?: AeonValueSemanticsProfileInput;
  readonly budget?: SansaMutationBudgetOptions;
}

export type SansaApplyMutationPlanResult<TBinding extends object = SansaResolveBinding> =
  | {
      readonly ok: true;
      readonly planId?: string;
      readonly stateBefore?: unknown;
      readonly stateAfter?: unknown;
      readonly operationResults: readonly SansaMutationOperationResult<TBinding>[];
      readonly diagnostics: readonly SansaMutateDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly operationResults: readonly SansaMutationOperationResult<TBinding>[];
      readonly errors: readonly SansaMutateDiagnostic[];
    };

export interface SansaMutationOperationResult<TBinding extends object = SansaResolveBinding> {
  readonly operationIndex: number;
  readonly status: 'applied';
  readonly targetAddress?: string;
  readonly parentAddress?: string;
  readonly containerAddress?: string;
  readonly sourceAddress?: string;
  readonly anchorAddress?: string;
  readonly previousAddress?: string;
  readonly affectedAddress?: string;
  readonly resultingAddress?: string;
  readonly affectedBinding?: TBinding;
}

export type SansaInstructionLowerErrorCode =
  | 'SANSA_INSTRUCTION_PARSE_FAILED'
  | 'SANSA_INSTRUCTION_LOWERING_REQUIRES_NAMESPACE'
  | 'SANSA_INSTRUCTION_LOWERING_REQUIRES_CANDIDATE_EVALUATION'
  | 'SANSA_INSTRUCTION_INVALID_VALUE_SEMANTICS_PROFILE'
  | 'SANSA_INSTRUCTION_CANDIDATE_RESOLUTION_FAILED'
  | 'SANSA_INSTRUCTION_WHERE_EVALUATION_FAILED'
  | 'SANSA_INSTRUCTION_CANDIDATE_ADDRESS_UNAVAILABLE'
  | 'SANSA_INSTRUCTION_TARGET_RESOLUTION_FAILED'
  | 'SANSA_INSTRUCTION_TARGET_MISS'
  | 'SANSA_INSTRUCTION_TARGET_MULTIPLICITY'
  | 'SANSA_INSTRUCTION_TARGET_ADDRESS_UNAVAILABLE'
  | 'SANSA_INSTRUCTION_NON_EXACT_TARGET'
  | 'SANSA_INSTRUCTION_UNSUPPORTED_VERB'
  | 'SANSA_INSTRUCTION_CREATE_DESTINATION_NOT_MEMBER';

export interface SansaInstructionLowerDiagnostic {
  readonly code: SansaInstructionLowerErrorCode;
  readonly message: string;
  readonly phase: 'parse' | 'lower';
  readonly cause?: unknown;
}

export interface SansaLowerInstructionOptions {
  readonly parse?: SansaInstructionParseOptions;
  readonly namespace?: SansaResolveNamespace;
  readonly resolve?: SansaResolveOptions;
  readonly contextualRoot?: SansaResolveBinding;
  readonly valueSemantics?: AeonValueSemanticsProfileInput;
}

export type SansaLowerInstructionResult =
  | {
      readonly ok: true;
      readonly request: SansaRequestedMutationOperation | readonly SansaRequestedMutationOperation[];
      readonly diagnostics: readonly SansaInstructionLowerDiagnostic[];
      readonly warnings: readonly SansaWarning[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly SansaInstructionLowerDiagnostic[];
    };

export interface SansaPlanInstructionOptions extends SansaLowerInstructionOptions {
  readonly mutate?: SansaPlanMutationOptions;
}

export type SansaPlanInstructionResult<TBinding extends object = SansaResolveBinding> =
  | {
      readonly ok: true;
      readonly plan: SansaMutationPlan<TBinding>;
      readonly loweredRequest: SansaRequestedMutationOperation | readonly SansaRequestedMutationOperation[];
      readonly diagnostics: readonly SansaMutateDiagnostic[];
      readonly warnings: readonly SansaWarning[];
    }
  | {
      readonly ok: false;
      readonly phase: 'lower';
      readonly errors: readonly SansaInstructionLowerDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly phase: 'plan';
      readonly loweredRequest: SansaRequestedMutationOperation | readonly SansaRequestedMutationOperation[];
      readonly errors: readonly SansaMutateDiagnostic[];
      readonly warnings: readonly SansaWarning[];
    };

export type SansaQueryValue<TBinding extends object = SansaResolveBinding> =
  | SansaQueryScalarValue
  | SansaQueryBindingSetValue<TBinding>
  | SansaQueryObjectValue;

export interface SansaQueryScalarValue {
  readonly type: 'scalar';
  readonly value: unknown;
}

export interface SansaQueryBindingSetValue<TBinding extends object = SansaResolveBinding> {
  readonly type: 'bindingSet';
  readonly bindings: readonly TBinding[];
}

export interface SansaQueryObjectValue {
  readonly type: 'object';
  readonly value: Record<string, unknown>;
}

export type AeonValueSemanticsOperation = 'equal' | 'notEqual' | 'compare' | 'isValue';

export type AeonValueSemanticsCategory =
  | 'finiteNumber'
  | 'positiveInfinity'
  | 'negativeInfinity'
  | 'nan'
  | 'string'
  | 'boolean'
  | 'toggle'
  | 'hex'
  | 'radix'
  | 'encoding'
  | 'separator'
  | 'sansaAddress'
  | 'referenceForm'
  | 'temporal'
  | 'lexicalStructuredScalar'
  | 'explicitNull'
  | 'explicitAbsence'
  | 'missing'
  | 'container'
  | 'bindingSet';

export interface AeonValueSemanticsProfile {
  readonly id?: string;
  readonly locale?: string | readonly string[];
  readonly stringOrder?: string;
  readonly temporalOrder?: string;
  readonly caseMapping?: string;
  readonly compareStrings: (left: string, right: string) => number;
  readonly compareTemporal: (left: AeonTemporalSemanticValue, right: AeonTemporalSemanticValue) => number;
  readonly lowerString: (value: string) => string;
  readonly upperString: (value: string) => string;
}

export interface AeonTemporalSemanticValue {
  readonly payload: string;
  readonly semanticType?: string;
}

export interface AeonValueSemanticsProfileOptions {
  readonly id?: string;
  readonly locale?: string | readonly string[];
  readonly usage?: 'sort' | 'search';
  readonly sensitivity?: 'base' | 'accent' | 'case' | 'variant';
  readonly ignorePunctuation?: boolean;
  readonly numeric?: boolean;
  readonly caseFirst?: 'upper' | 'lower' | 'false';
  readonly compareTemporal?: (left: AeonTemporalSemanticValue, right: AeonTemporalSemanticValue) => number;
}

export type AeonValueSemanticsProfileInput =
  | 'default'
  | string
  | AeonValueSemanticsProfile
  | AeonValueSemanticsProfileOptions
  | { readonly profile: AeonValueSemanticsProfileInput };

export interface AeonValueSemanticsValueDescriptor {
  readonly category: AeonValueSemanticsCategory;
  readonly value?: unknown;
  readonly reason?: string;
  readonly semanticType?: string;
  readonly containerKind?: string;
  readonly count?: number;
}

export type AeonValueSemanticsOperationInput =
  | {
      readonly left: AeonValueSemanticsValueDescriptor;
      readonly right: AeonValueSemanticsValueDescriptor;
      readonly valueSemantics?: AeonValueSemanticsProfileInput;
      readonly profile?: AeonValueSemanticsProfileInput;
    }
  | {
      readonly value: AeonValueSemanticsValueDescriptor;
      readonly valueSemantics?: AeonValueSemanticsProfileInput;
      readonly profile?: AeonValueSemanticsProfileInput;
    };

export interface AeonValueSemanticsOperationOptions {
  readonly valueSemantics?: AeonValueSemanticsProfileInput;
}

export type AeonValueSemanticsResult =
  | {
      readonly ok: true;
      readonly outcome: 'value';
      readonly value?: boolean;
      readonly relation?: 'less' | 'equal' | 'greater';
    }
  | {
      readonly ok: false;
      readonly outcome: 'diagnostic';
      readonly reason: string;
      readonly error: {
        readonly code: string;
        readonly reason: string;
        readonly message: string;
      };
    };

export function evaluateValueSemanticsOperation(
  operation: AeonValueSemanticsOperation,
  input: AeonValueSemanticsOperationInput,
  options?: AeonValueSemanticsOperationOptions,
): AeonValueSemanticsResult;

export const aeonValueSemanticsDefaultProfile: AeonValueSemanticsProfile;
export function createIntlValueSemanticsProfile(options?: AeonValueSemanticsProfileOptions): AeonValueSemanticsProfile;
export function createFrenchValueSemanticsProfile(
  options?: Omit<AeonValueSemanticsProfileOptions, 'locale'> & { readonly locale?: 'fr' | 'fr-FR' },
): AeonValueSemanticsProfile;
export function createNaturalAsciiValueSemanticsProfile(options?: Omit<AeonValueSemanticsProfileOptions, 'locale'>): AeonValueSemanticsProfile;

export interface SansaAddress {
  readonly type: 'SansaAddress';
  readonly root: RootSelector;
  readonly selectors: readonly SansaSelector[];
  readonly qualifierExpression: QualifierExpression | null;
  readonly isExact: boolean;
  readonly canonical: string;
}

export interface SansaQuery {
  readonly type: 'SansaQuery';
  readonly from: SansaQueryFromClause;
  readonly where: SansaQueryExpressionClause | null;
  readonly orderBy: SansaQueryOrderByClause | null;
  readonly offset: SansaQueryIntegerClause | null;
  readonly limit: SansaQueryIntegerClause | null;
  readonly select: SansaQueryExpressionClause;
  readonly clauses: readonly SansaQueryClauseName[];
  readonly canonical: string;
}

export type SansaQueryClauseName = 'from' | 'where' | 'order' | 'offset' | 'limit' | 'select';

export type SansaQueryFromClause = SansaQueryAddressFromClause | SansaQueryExpressionFromClause;

export interface SansaQueryAddressFromClause {
  readonly type: 'fromClause';
  readonly source: 'address';
  readonly address: SansaAddress;
}

export interface SansaQueryExpressionFromClause {
  readonly type: 'fromClause';
  readonly source: 'expression';
  readonly expression: string;
  readonly ast: SansaQueryExpression;
}

export interface SansaQueryExpressionClause {
  readonly type: 'whereClause' | 'selectClause';
  readonly expression: string;
  readonly ast: SansaQueryExpression;
}

export interface SansaQueryOrderByClause {
  readonly type: 'orderByClause';
  readonly keys: readonly SansaQueryOrderKey[];
}

export interface SansaQueryOrderKey {
  readonly type: 'orderKey';
  readonly expression: string;
  readonly ast: SansaQueryExpression;
  readonly direction: 'asc' | 'desc';
}

export interface SansaQueryIntegerClause {
  readonly type: 'offsetClause' | 'limitClause';
  readonly value: number;
}

export type SansaQueryExpression =
  | SansaQueryLiteralExpression
  | SansaQueryCurrentBindingExpression
  | SansaQueryResolutionExpression
  | SansaQueryGroupExpression
  | SansaQueryUnaryExpression
  | SansaQueryBinaryExpression
  | SansaQueryFunctionCallExpression
  | SansaQueryExistenceExpression
  | SansaQueryCardinalityExpression
  | SansaQueryProjectionExpression;

export interface SansaQueryLiteralExpression {
  readonly type: 'literalExpression';
  readonly kind:
    | 'string'
    | 'number'
    | 'boolean'
    | 'toggle'
    | 'hex'
    | 'radix'
    | 'encoding'
    | 'separator'
    | 'date'
    | 'time'
    | 'datetime'
    | 'zrut'
    | 'null';
  readonly value: string | number | boolean | null;
  readonly nullReason?: string;
  readonly canonical: string;
}

export interface SansaQueryCurrentBindingExpression {
  readonly type: 'currentBindingExpression';
  readonly canonical: string;
}

export interface SansaQueryResolutionExpression {
  readonly type: 'resolutionExpression';
  readonly scope: 'current' | 'absolute' | 'contextual';
  readonly address: SansaAddress;
  readonly canonical: string;
}

export interface SansaQueryGroupExpression {
  readonly type: 'groupExpression';
  readonly expression: SansaQueryExpression;
  readonly canonical: string;
}

export interface SansaQueryUnaryExpression {
  readonly type: 'unaryExpression';
  readonly operator: 'not';
  readonly argument: SansaQueryExpression;
  readonly canonical: string;
}

export interface SansaQueryBinaryExpression {
  readonly type: 'binaryExpression';
  readonly operator: 'or' | 'and' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';
  readonly left: SansaQueryExpression;
  readonly right: SansaQueryExpression;
  readonly canonical: string;
}

export interface SansaQueryFunctionCallExpression {
  readonly type: 'functionCallExpression';
  readonly name: string;
  readonly arguments: readonly SansaQueryExpression[];
  readonly canonical: string;
}

export interface SansaQueryExistenceExpression {
  readonly type: 'existenceExpression';
  readonly operator: 'exists' | 'absent';
  readonly argument: SansaQueryExpression;
  readonly canonical: string;
}

export interface SansaQueryCardinalityExpression {
  readonly type: 'cardinalityExpression';
  readonly operator: 'any' | 'all' | 'none';
  readonly argument: SansaQueryExpression;
  readonly canonical: string;
}

export interface SansaQueryProjectionExpression {
  readonly type: 'projectionExpression';
  readonly fields: readonly SansaQueryProjectionField[];
  readonly canonical: string;
}

export interface SansaQueryProjectionField {
  readonly type: 'projectionField';
  readonly name: string;
  readonly expression: SansaQueryExpression;
}

export interface SansaInstruction {
  readonly type: 'SansaInstruction';
  readonly from: SansaInstructionFromClause | null;
  readonly where: SansaInstructionWhereClause | null;
  readonly mutation: SansaInstructionMutationClause;
  readonly clauses: readonly SansaInstructionClauseName[];
  readonly canonical: string;
}

export type SansaInstructionClauseName = 'from' | 'where' | 'create' | 'replace' | 'remove' | 'insert' | 'append' | 'move';

export interface SansaInstructionFromClause {
  readonly type: 'fromClause';
  readonly source: 'address';
  readonly address: SansaAddress;
}

export interface SansaInstructionWhereClause {
  readonly type: 'whereClause';
  readonly expression: string;
  readonly ast: SansaQueryExpression;
}

export type SansaInstructionMutationClause =
  | SansaInstructionCreateClause
  | SansaInstructionReplaceClause
  | SansaInstructionRemoveClause
  | SansaInstructionInsertClause
  | SansaInstructionMoveClause;

export interface SansaInstructionCreateClause {
  readonly type: 'mutationClause';
  readonly verb: 'create';
  readonly destination: SansaInstructionCreateDestination;
  readonly value: SansaInstructionValue;
}

export interface SansaInstructionReplaceClause {
  readonly type: 'mutationClause';
  readonly verb: 'replace';
  readonly target: SansaInstructionAddress;
  readonly value: SansaInstructionValue;
}

export interface SansaInstructionRemoveClause {
  readonly type: 'mutationClause';
  readonly verb: 'remove';
  readonly target: SansaInstructionAddress;
}

export interface SansaInstructionInsertClause {
  readonly type: 'mutationClause';
  readonly verb: 'insert';
  readonly placement: SansaInstructionPlacement;
  readonly container: SansaInstructionAddress;
  readonly value: SansaInstructionValue;
}

export interface SansaInstructionMoveClause {
  readonly type: 'mutationClause';
  readonly verb: 'move';
  readonly source: SansaInstructionAddress;
  readonly placement: SansaInstructionPlacement;
  readonly container: SansaInstructionAddress;
}

export type SansaInstructionCreateDestination =
  | {
      readonly type: 'createDestination';
      readonly kind: 'member';
      readonly name: string;
      readonly canonical: string;
    }
  | {
      readonly type: 'createDestination';
      readonly kind: 'address';
      readonly address: SansaAddress;
      readonly canonical: string;
    };

export interface SansaInstructionAddress {
  readonly type: 'instructionAddress';
  readonly source: string;
  readonly address: SansaAddress;
  readonly canonical: string;
}

export type SansaInstructionPlacement =
  | {
      readonly type: 'placement';
      readonly kind: 'first' | 'last';
    }
  | {
      readonly type: 'placement';
      readonly kind: 'before' | 'after';
      readonly anchor: SansaInstructionAddress;
    };

export interface SansaInstructionValue {
  readonly type: 'InstructionValue';
  readonly datatype?: string;
  readonly kind: SansaInstructionValueKind;
  readonly value: string | number | boolean | null;
  readonly literal: SansaInstructionValueLiteral;
  readonly canonical: string;
}

export type SansaInstructionValueKind = SansaQueryLiteralExpression['kind'] | 'sansa';

export type SansaInstructionValueLiteral =
  | {
      readonly type: 'instructionValueLiteral';
      readonly kind: 'sansa';
      readonly value: string;
      readonly address: SansaAddress;
      readonly canonical: string;
    }
  | {
      readonly type: 'instructionValueLiteral';
      readonly kind: SansaQueryLiteralExpression['kind'];
      readonly value: string | number | boolean | null;
      readonly expression: SansaQueryLiteralExpression;
      readonly canonical: string;
    };

export interface RootSelector {
  readonly type: 'root';
  readonly kind: 'absolute' | 'contextual';
}

export type SansaSelector =
  | MemberSelector
  | PositionSelector
  | PositionRangeSelector
  | ParentSelector
  | AttributeSpaceSelector
  | LocalSpaceSelector
  | DirectExpansionSelector
  | DescendantExpansionSelector
  | NamePatternSelector
  | SemanticTypeFilterSelector
  | RepresentationKindFilterSelector;

export interface MemberSelector {
  readonly type: 'member';
  readonly name: string;
  readonly quoted: boolean;
}

export interface PositionSelector {
  readonly type: 'position';
  readonly index: number;
}

export interface PositionRangeSelector {
  readonly type: 'positionRange';
  readonly start: number | null;
  readonly end: number | null;
}

export interface ParentSelector {
  readonly type: 'parent';
}

export interface AttributeSpaceSelector {
  readonly type: 'attributeSpace';
}

export interface LocalSpaceSelector {
  readonly type: 'localSpace';
  readonly name: string;
}

export interface DirectExpansionSelector {
  readonly type: 'directExpansion';
}

export interface DescendantExpansionSelector {
  readonly type: 'descendantExpansion';
}

export interface NamePatternSelector {
  readonly type: 'namePattern';
  readonly pattern: string;
}

export interface SemanticTypeFilterSelector {
  readonly type: 'semanticTypeFilter';
  readonly name: string;
}

export interface RepresentationKindFilterSelector {
  readonly type: 'representationKindFilter';
  readonly name: string;
}

export interface QualifierExpression {
  readonly type: 'QualifierExpression';
  readonly terms: readonly QualifierTerm[];
}

export interface QualifierTerm {
  readonly type: 'QualifierTerm';
  readonly name: string;
  /** Flattened convenience view across all parameter groups. */
  readonly parameters: readonly QualifierTerm[];
  /** Source-preserving parameter groups rendered as repeated <...> segments. */
  readonly parameterGroups: readonly (readonly QualifierTerm[])[];
  readonly arguments: readonly QualifierArgument[];
}

export type QualifierArgument = QualifierTokenArgument | QualifierQuotedArgument;

export interface QualifierTokenArgument {
  readonly kind: 'token';
  readonly value: string;
}

export interface QualifierQuotedArgument {
  readonly kind: 'quoted';
  readonly value: string;
}

export class SansaParseError extends Error {
  readonly code: SansaParseErrorCode;
  readonly index: number;
  constructor(message: string, index: number, code?: SansaParseErrorCode);
}

export declare const SANSA_MAX_POSITION_INDEX: number;
export declare const SANSA_MAX_QUERY_INTEGER: number;

export function parseAddress(input: string, options?: SansaParseOptions): SansaParseResult;
export function parseAddressOrThrow(input: string, options?: SansaParseOptions): SansaAddress;
export function parseQuery(input: string, options?: SansaQueryParseOptions): SansaQueryParseResult;
export function parseQueryOrThrow(input: string, options?: SansaQueryParseOptions): SansaQuery;
export function parseQueryExpression(input: string, options?: SansaQueryExpressionParseOptions): SansaQueryExpressionParseResult;
export function parseQueryExpressionOrThrow(input: string, options?: SansaQueryExpressionParseOptions): SansaQueryExpression;
export function parseInstruction(input: string, options?: SansaInstructionParseOptions): SansaInstructionParseResult;
export function parseInstructionOrThrow(input: string, options?: SansaInstructionParseOptions): SansaInstruction;
export function lowerInstruction(input: string | SansaInstruction, options?: SansaLowerInstructionOptions): SansaLowerInstructionResult;
export function lowerInstruction(
  input: string | SansaInstruction,
  namespace: SansaResolveNamespace,
  options?: Omit<SansaLowerInstructionOptions, 'namespace'>,
): SansaLowerInstructionResult;
export function planInstruction<TBinding extends object = SansaResolveBinding>(
  input: string | SansaInstruction,
  namespace: SansaResolveNamespace<TBinding>,
  options?: SansaPlanInstructionOptions,
): SansaPlanInstructionResult<TBinding>;
export function evaluateQuery<TBinding extends object = SansaResolveBinding>(
  input: string | SansaQuery,
  namespace: SansaResolveNamespace<TBinding>,
  options?: SansaQueryEvaluateOptions<TBinding>,
): SansaQueryEvaluateResult<TBinding>;
export function planMutation<TBinding extends object = SansaResolveBinding>(
  input: SansaMutationRequest<TBinding>,
  namespace: SansaResolveNamespace<TBinding>,
  options?: SansaPlanMutationOptions<TBinding>,
): SansaPlanMutationResult<TBinding>;
export function validateMutationPlanTarget<TBinding extends object = SansaResolveBinding>(
  plan: SansaMutationPlan<TBinding>,
  targetSurface?: SansaMutationTargetSurfaceInput<TBinding>,
): SansaValidateMutationPlanTargetResult;
export function applyMutationPlan<TBinding extends object = SansaResolveBinding>(
  plan: SansaMutationPlan<TBinding>,
  namespace: SansaResolveNamespace<TBinding>,
  options?: SansaApplyMutationOptions<TBinding>,
): SansaApplyMutationPlanResult<TBinding>;
export function resolveAddress<TBinding extends object = SansaResolveBinding>(
  input: string | SansaAddress,
  namespace: SansaResolveNamespace<TBinding>,
  options?: SansaResolveOptions<TBinding>,
): SansaResolveResult<TBinding>;
export function renderAddress(address: SansaAddress): string;
export function renderQuery(query: SansaQuery): string;
export function renderQueryExpression(expression: SansaQueryExpression): string;
export function renderQualifierExpression(expression: QualifierExpression): string;
export function renderQualifierTerm(term: QualifierTerm): string;
