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
  | 'SANSA_QUERY_INVALID_RESOLUTION_EXPRESSION'
  | 'SANSA_QUERY_INVALID_FUNCTION_CALL'
  | 'SANSA_QUERY_INVALID_PROJECTION'
  | 'SANSA_PARSE_ERROR';

export interface SansaDiagnostic {
  readonly code: SansaParseErrorCode;
  readonly message: string;
  readonly index: number;
}

export interface SansaParseOptions {}

export interface SansaQueryExpressionParseOptions {
  readonly address?: SansaParseOptions;
}

export interface SansaQueryParseOptions {
  readonly address?: SansaParseOptions;
  readonly expression?: SansaQueryExpressionParseOptions;
}

export type SansaParseResult =
  | { readonly ok: true; readonly address: SansaAddress }
  | { readonly ok: false; readonly errors: readonly SansaDiagnostic[] };

export type SansaQueryParseResult =
  | { readonly ok: true; readonly query: SansaQuery }
  | { readonly ok: false; readonly errors: readonly SansaDiagnostic[] };

export type SansaQueryExpressionParseResult =
  | { readonly ok: true; readonly expression: SansaQueryExpression }
  | { readonly ok: false; readonly errors: readonly SansaDiagnostic[] };

export type SansaResolveErrorCode =
  | 'SANSA_RESOLVE_EXPECTED_NAMESPACE'
  | 'SANSA_RESOLVE_MISSING_ROOT'
  | 'SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT'
  | 'SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE'
  | 'SANSA_RESOLVE_UNSUPPORTED_LOCAL_SPACE'
  | 'SANSA_RESOLVE_UNSUPPORTED_SELECTOR';

export type SansaQueryEvaluateErrorCode =
  | 'SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION'
  | 'SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL'
  | 'SANSA_QUERY_EVALUATE_UNSUPPORTED_EXPRESSION'
  | 'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN'
  | 'SANSA_QUERY_EVALUATE_EXPECTED_SCALAR'
  | 'SANSA_QUERY_EVALUATE_MISSING_SCALAR'
  | 'SANSA_QUERY_EVALUATE_CARDINALITY'
  | 'SANSA_QUERY_EVALUATE_INVALID_COMPARISON'
  | 'SANSA_QUERY_EVALUATE_INVALID_FROM_SOURCE'
  | 'SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL'
  | 'SANSA_QUERY_EVALUATE_INVALID_EXISTENCE_ARGUMENT'
  | 'SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT';

export interface SansaResolveDiagnostic {
  readonly code: SansaResolveErrorCode | SansaParseErrorCode;
  readonly message: string;
  readonly index?: number;
  readonly selectorIndex?: number;
}

export interface SansaQueryEvaluateDiagnostic {
  readonly code: SansaQueryEvaluateErrorCode | SansaResolveErrorCode | SansaParseErrorCode;
  readonly message: string;
  readonly phase?: 'parse' | 'from' | 'where' | 'order' | 'select';
  readonly candidateAddress?: string;
  readonly index?: number;
  readonly selectorIndex?: number;
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
  readonly contextualRoot?: TBinding | (() => TBinding | undefined);
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
}

export interface SansaResolveOptions<TBinding extends object = SansaResolveBinding> {
  readonly parse?: SansaParseOptions;
  readonly contextualRoot?: TBinding;
}

export type SansaResolveResult<TBinding extends object = SansaResolveBinding> =
  | { readonly ok: true; readonly bindings: readonly TBinding[]; readonly diagnostics: readonly SansaResolveDiagnostic[] }
  | { readonly ok: false; readonly bindings: readonly TBinding[]; readonly errors: readonly SansaResolveDiagnostic[] };

export interface SansaQueryEvaluateOptions<TBinding extends object = SansaResolveBinding> {
  readonly parse?: SansaQueryParseOptions;
  readonly resolve?: SansaResolveOptions<TBinding>;
}

export type SansaQueryEvaluateResult<TBinding extends object = SansaResolveBinding> =
  | { readonly ok: true; readonly results: readonly SansaQueryResult<TBinding>[]; readonly diagnostics: readonly SansaQueryEvaluateDiagnostic[] }
  | { readonly ok: false; readonly results: readonly SansaQueryResult<TBinding>[]; readonly errors: readonly SansaQueryEvaluateDiagnostic[] };

export interface SansaQueryResult<TBinding extends object = SansaResolveBinding> {
  readonly type: 'queryResult';
  readonly address?: string;
  readonly binding: TBinding;
  readonly value: SansaQueryValue<TBinding>;
}

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
  readonly kind: 'string' | 'number' | 'boolean';
  readonly value: string | number | boolean;
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
export function evaluateQuery<TBinding extends object = SansaResolveBinding>(
  input: string | SansaQuery,
  namespace: SansaResolveNamespace<TBinding>,
  options?: SansaQueryEvaluateOptions<TBinding>,
): SansaQueryEvaluateResult<TBinding>;
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
