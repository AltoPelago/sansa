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
  | 'SANSA_PARSE_ERROR';

export interface SansaDiagnostic {
  readonly code: SansaParseErrorCode;
  readonly message: string;
  readonly index: number;
}

export interface SansaParseOptions {}

export type SansaParseResult =
  | { readonly ok: true; readonly address: SansaAddress }
  | { readonly ok: false; readonly errors: readonly SansaDiagnostic[] };

export interface SansaAddress {
  readonly type: 'SansaAddress';
  readonly root: RootSelector;
  readonly selectors: readonly SansaSelector[];
  readonly qualifierExpression: QualifierExpression | null;
  readonly isExact: boolean;
  readonly canonical: string;
}

export interface RootSelector {
  readonly type: 'root';
  readonly kind: 'absolute' | 'contextual';
}

export type SansaSelector =
  | MemberSelector
  | PositionSelector
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
  readonly parameters: readonly QualifierTerm[];
  readonly argument: QualifierArgument | null;
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

export function parseAddress(input: string, options?: SansaParseOptions): SansaParseResult;
export function parseAddressOrThrow(input: string, options?: SansaParseOptions): SansaAddress;
export function renderAddress(address: SansaAddress): string;
export function renderQualifierExpression(expression: QualifierExpression): string;
export function renderQualifierTerm(term: QualifierTerm): string;
