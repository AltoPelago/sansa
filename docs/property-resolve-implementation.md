# Read-only property Resolve and Query implementation

This document describes the historical SANSA 0.15.0 providers. See
[revised node model support](property-selector-support.md#development-for-the-revised-node-model)
for the current JavaScript and Rust development providers.

Initial implementation: 16 November 2026; provider boundaries audited 22 November.
Publication status updated 25 November 2026: the described opt-in runtime APIs
ship in SANSA 0.15.0. Package publication does not promote experimental profiles
or CTS claims. Coordinated AEON stable delivery remains separate. See the
[provider/host matrix](property-selector-support.md) for delivered owning APIs and
intentional host denials.

JavaScript/TypeScript and Rust execute `&key("...")`, `&tag("...")` and `&headTag("...")` only in
standalone read-only Resolve and direct read-only Query with an explicitly capable namespace. Public types
are `PropertyAccess`, `PropertyAccessContext` and checked `PropertyAccessFault`
(TypeScript), or `property::PropertyAccess` and its context/scope/kind/error types
(Rust). `Namespace.properties()` defaults to `None`. An adapter must explicitly
implement the facet; bare or legacy adapters do not acquire support from metadata.
The owning AEON SDK and pure-Python namespaces implement the documented facet.

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
0..1000000. Rust enforces the same ceiling through `u32`; existing native Pytonic
and portable AEOS bridges validate their documented numeric inputs before that
field. Pure Python has its own checked allowance conversion. Invalid limits fail before roots even without a
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

The initial 16 November Resolve mirrors preserved prepared CTS fixture bytes:83 JavaScript
Resolve vectors and67 selected Rust text vectors, asserting every present
expected field/counter. Rust native types cannot encode JS getter/cycle ASTs or
boolean/negative/fractional `u32` allowances; those16 vectors are not claimed by
the Rust text selection. Separate native tests cover flags, multiplicity, bounds,
allowances and distinct frames. The one scripted invalid UTF-16 host value maps
to a checked metadata fault in the Rust test adapter, not a production JSON bridge.
Additional tests cover typed/cleanup faults, reentry and closed consumers. These
mirrors are runtime regressions, not a new CTS protocol/profile advertisement or
execution of the full149-case property target.

Direct read-only Query admits property addresses in `from`, `where`, `order by`
and `select`, including projections and nested expressions. `.&key("x")` and
`.&tag("x")` retain the row's originating scope while moving its evaluation root;
explicit `?&key("x")` establishes a boundary at the row, hiding its incoming key.
Attribute/local-space boundaries, repeated occurrence frames and stable ordering
survive filtering and slicing. One private property allowance spans the entire
Query; separate and reentrant public calls get fresh state. Complete capability
preflight runs before empty/short-circuited traversal. Caller property Query ASTs
are snapshotted while preserving completed-node sharing and rejecting active
cycles. The existing 20,000-entry/128-level/1 MiB preparation bounds stay in force;
a separate walk checks semantic rendering against the same entry/text ceilings
before rendering shared expression occurrences. The snapshot is then reparsed; output bindings/records carry no frames or
mutable counters. The 15 byte-identical prepared Query vectors check every present
field and callback count in text and native AST forms, alongside local regressions.
They are regression mirrors, not full CTS protocol/profile claims.

Activation (including trusted), Graph, Instruction/Mutate/SO and structural/
reference/event/storage consumers stay closed. Direct Query does not admit
Query-shaped mutation/precondition callers. The separately implemented portable
AEOS rule-selector profile is admitted only through its explicit AES/Telex APIs;
legacy native-event validation and the LSP path remain closed. The Type Transpiler
is deferred. Pure Python has no Query evaluator, while the existing native
Pytonic `Document.query()` is admitted through the Rust SDK. Core/native/WASM
literal APIs remain inert; WASM gains no Query API.

Rust source porting includes new `ResolveOptions`/`Diagnostic` fields for clients
using exhaustive struct literals, alongside the prior selector enum/QualifierTerm
Drop considerations. SANSA's stable package version advances; capability/profile
and CTS claim statuses do not. Original compatibility/target checks and 1.15x
latency/1.20x memory ceilings remain unchanged. New cost qualification, broader
host/platform matrices and the existing narrow identity qualification limitation
remain separate from runtime support. Newline/local positions stay deferred to
tentative AEON 0.17.1. Production deployment remains held.
