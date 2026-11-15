/** Candidate 0.1 declarations for review only. Not runtime/package exports. */
import type {SansaAddress, SansaSelector, SansaResolveNamespace, SansaResolveOptions, SansaQueryEvaluateOptions} from '../src/index.js';

export type PropertyName = 'key' | 'tag';
export type PropertyScopeRole = 'root' | 'inside' | 'outside';
export type PropertyNodeKind = 'NodeLiteral' | 'NodeHead' | 'Other';
export interface PropertyAccessContext<B extends object> {
  readonly scopeRoot: B;
  readonly evaluationRoot: B;
  /** Present only while validating a yielded direct head of this owner. */
  readonly directHeadOf?: B;
}
export interface PropertyAccessFault {
  readonly type: 'SansaPropertyAccessFault';
  readonly kind: 'invalidMetadata' | 'scopeViolation' | 'adapterFailure';
}
/** Callback faults are thrown, not returned as successful metadata. */
export interface PropertyAccess<B extends object> {
  readonly scope: (binding: B, context: PropertyAccessContext<B>) => PropertyScopeRole;
  readonly key?: (binding: B, context: PropertyAccessContext<B>) => string | undefined;
  readonly nodeKind?: (binding: B, context: PropertyAccessContext<B>) => PropertyNodeKind;
  readonly nodeTag?: (binding: B, context: PropertyAccessContext<B>) => string | undefined;
  readonly nodeHeads?: (binding: B, context: PropertyAccessContext<B>) => Iterable<B>;
}
export interface PropertyNamespace<B extends object> extends SansaResolveNamespace<B> {
  readonly properties?: PropertyAccess<B>;
}
export interface PropertyResolveOptions<B extends object> extends SansaResolveOptions<B> {
  /** Candidate: integer 0..1000000; default 10000. No public counter/session. */
  readonly maxPropertyInspections?: number;
}
export interface PropertyQueryOptions<B extends object> extends Omit<SansaQueryEvaluateOptions<B>, 'resolve'> {
  readonly resolve?: PropertyResolveOptions<B>;
}
export interface PropertyFilterSelector {
  readonly type: 'propertyFilter';
  readonly property: PropertyName;
  readonly value: string;
}
/** Contains untrusted caller flags until bounded normalization recomputes them. */
export interface PropertyAddress extends Omit<SansaAddress, 'selectors'> {
  readonly selectors: readonly (SansaSelector | PropertyFilterSelector)[];
}
