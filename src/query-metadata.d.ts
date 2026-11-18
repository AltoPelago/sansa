/** Native scalar information for presentation; optional fields are never inferred. */
export interface SansaQueryValueMetadata {
  readonly kind?: string;
  readonly category?: string;
  readonly semanticType?: string;
  readonly containerKind?: string;
  readonly nullReason?: string;
  readonly numericLexeme?: string;
  readonly radixBase?: number;
  readonly radixScale?: number;
}

/** Returns a detached frozen descriptor for a live scalar query value, or undefined. */
export function getQueryValueMetadata(value: unknown): Readonly<SansaQueryValueMetadata> | undefined;
/** Pass the materialized object (queryValue.value), including nested projections. */
export function getQueryObjectFieldMetadata(value: unknown): Readonly<Record<string, Readonly<SansaQueryValueMetadata>>>;
