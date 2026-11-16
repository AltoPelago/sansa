# Standalone property Resolve implementation

Date:16 November2026. Unreleased candidate; no profile promotion or release.

JavaScript/TypeScript and Rust execute `&key("...")` and `&tag("...")` only in
standalone read-only Resolve with an explicitly capable namespace. Public types
are `PropertyAccess`, `PropertyAccessContext` and checked `PropertyAccessFault`
(TypeScript), or `property::PropertyAccess` and its context/scope/kind/error types
(Rust). `Namespace.properties()` defaults to `None`. Existing adapters remain
unchanged and unsupported for property inspection.

The adapter must prove authorized topology and direct-head ownership, without
inferring authority from paths, display names, ordinary `tag` fields or cached
outer tags. The optional `namespace.properties` facet supplies `scope` and `key`,
or `scope` and all three node callbacks. See the [contract](property-selectors-contract.md).

```js
// namespace implements the authoritative property facet.
const result = resolveAddress('$.items.*&key("")', namespace, {
  maxPropertyInspections: 1000,
});
// Results retain original opaque binding handles and structural paths.
```

Each occurrence carries a private authorized scope/evaluation frame. Absolute
and contextual roots begin boundaries; explicit attribute/local-space transitions
begin boundaries at their returned roots. Ordinary navigation retains the frame,
including repeated handles arriving through distinct spaces. Existing parent
traversal is unchanged; inspecting an escaped occurrence fails before key/tag
access. Root keys are hidden while intrinsic root tags remain eligible. Contexts
are frozen in JavaScript and borrowed read-only in Rust. Public options, ASTs and
results do not carry authority roots or mutable counters/sessions.

Validation order is input/AST, options, root, complete requested capabilities,
then traversal. Missing support fails before child/metadata/head callbacks even
on empty prefixes or later predicates. Existing parse options and property
preparation bounds remain in force; caller exact/canonical flags are recomputed.
Earlier execution-closed standalone placeholders now test this approved opt-in
contract. Prohibited consumers retain pre-traversal denials.

`maxPropertyInspections` defaults to10000 and accepts finite integer numbers
0..1000000. Rust enforces the same ceiling through `u32`; JSON/Python conversions
remain owning-bridge work. Invalid limits fail before roots even without a
predicate. Charge each predicate candidate before scope/metadata, including
misses and hidden roots. NodeLiteral tag predicates additionally charge each
yielded direct head before scope/ownership/kind/tag checks. Return the original
container at most once per occurrence and retain repeated results/charges.
Stop at the first match; permit a terminal next probe at the exact allowance.
Checked failures return no partial bindings or host exception/hidden values.

Enumeration is incremental. JavaScript closes iterators after early matches,
budget failures and iterator/metadata faults, including a thrown `next`;
cleanup faults fail too. Rust drops iterators on every exit; panic/abort and
throwing destructors are outside its checked-fault guarantee. The Rust regression
adapter streams existing identifiers without cloning the head vector during
acquisition. Logical inspections do not bound all adapter work, old navigation,
input preparation, elapsed time or allocation.

Regression mirrors preserve exact prepared CTS fixture bytes:83 JavaScript
Resolve vectors and67 selected Rust text vectors, asserting every present
expected field/counter. Rust native types cannot encode JS getter/cycle ASTs or
boolean/negative/fractional `u32` allowances; those16 vectors are not claimed by
the Rust text selection. Separate native tests cover flags, multiplicity, bounds,
allowances and distinct frames. The one scripted invalid UTF-16 host value maps
to a checked metadata fault in the Rust test adapter, not a production JSON bridge.
Additional tests cover typed/cleanup faults, reentry and closed consumers. These
mirrors are runtime regressions, not a new CTS protocol/profile advertisement or
execution of the full149-case property target.

Query, activation (including trusted), Graph, Instruction/Mutate/SO, AEOS selectors,
Type Transpiler, structural/reference/event/storage consumers stay closed. No
AEON SDK/AEOS/Python/native/WASM adapter or dependency is repinned. Owning providers
must implement authoritative facets and bridge distinctions before advertising
support. The playground does not gain property execution through unchanged AEON
SDKs. Query cursor/current-row syntax and Query-wide accounting remain separate.

Rust source porting includes new `ResolveOptions`/`Diagnostic` fields for clients
using exhaustive struct literals, alongside the prior selector enum/QualifierTerm
Drop considerations. No version or capability manifest changes. Original
compatibility/target checks and1.15x latency/1.20x memory ceilings stay unchanged.
New cost qualification, provider matrices and the positional gate remain open.
Official releases and deployment stay held.
