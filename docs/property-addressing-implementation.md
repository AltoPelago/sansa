# Property Addressing implementation checkpoint

Date: 16 November 2026. Scope: first implementation slice of
[roadmap #51](https://github.com/AltoPelago/roadmap/issues/51), following merged
specs #58, SANSA #48 and CTS #72. Releases and deployment remain held.

JavaScript and Rust Addressing now recognize exact `&key("...")` and
`&tag("...")` suffixes, retain a `propertyFilter` AST variant and render canonical
payloads with existing quote/escape rules. They remain non-exact. No namespace
property inspection API or execution capability is advertised by this slice.

The property candidate bounds are 256 total selectors, 4096 decoded scalar values
per property argument and 65536 canonical scalars. Recognition distinguishes
quoted ampersands and qualifier payloads from selector syntax. Existing index
options and property-free limits remain in force. Property qualifier control flow
and canonical rendering are iterative; Rust releases nested qualifier data
iteratively so a successfully parsed bounded address does not overflow on drop.
JavaScript caller rendering reads plain data descriptors, ignores forged
canonical/exactness fields and rejects accessors, cycles and unknown variants.
Native property Resolve input validates bounds before namespace access and retains
explicit native positional limits while recomputing metadata.

## Parsing is separate from execution

Resolve denies property selectors before ordinary traversal, including an empty
prefix, even if a namespace supplies lookalike property callbacks. Query preflight
denies property-containing address expressions in from/where/order/select and
projections, including an otherwise empty/false branch. JavaScript Instructions,
Graph declarations and all address-activation modes retain explicit denials;
mutation exactness and reference structural-path guards remain in place.

Query cursor/current-row integration is **not delivered** here. JavaScript's
existing address expressions can carry the parsed suffix but evaluation denies
it. Rust Query text still rejects that suffix at its existing expression cursor;
caller Query ASTs are explicitly denied in policy preflight. No text/AST Query
execution parity or portable property-profile conformance is claimed.

The runtime-owned regression fixture mirrors the 34 parser expectations from
CTS `3edc3e27c657f1420c1bda3447c960df549b3427`, suite
`18-property-parser.json`, SHA-256
`84aac40fa4360a7fccfa16f820195edef5f0fe8938ad6d689a7c43c7477d25e0`.
Both implementations run all 34 expectations, including generated boundaries;
this does not execute or claim the complete 149-case preparation target.
Historical manifests, expectations, claim selections and performance ceilings are
unchanged. Existing temporal evidence is revalidated before refreshing exact
implementation fingerprints; original frozen reports remain retained.

## Rust API porting consideration

The new selector enum variant requires downstream exhaustive matches to be
updated before a dependency bump. `QualifierTerm` also now implements `Drop` for
stack-safe release of deeply nested qualifiers. Callers moving its owned fields
by value may need `std::mem::take` instead. That source-compatibility consideration
requires owning review; no AEON Rust dependency is repinned by this patch.

## Next slices

- [ ] Implement optional authoritative property facets, internal scope frames,
  checked failures and finite inspection accounting in Resolve/adapters.
- [ ] Complete Query cursor/current-row syntax, cross-provider scope and private
  Query-wide accounting, then explicitly admit read-only Query execution.
- [ ] Port the new selector variant into AEON lexical/AST consumers. In Rust,
  downstream exhaustive selector matches need source changes before a dependency
  update; this slice does not repin AEON. Pure Python and native/WASM bridges
  remain separate advertised-provider integration work.
- [ ] Deliver the executable CTS protocol and actual source/installed/native/WASM/
  browser/tooling checks. AEOS selector/Type Transpiler admission remains separate.
- [ ] Measure affected resource/performance behavior against unchanged 1.15x
  latency /1.20x memory ceilings; no new performance qualification or heap waiver.
- [ ] Close the separate positional resource gate or record reviewed release-scope
  deferral before final release qualification.

## QA follow-up — 16 November 2026

QA-2026-0082 and QA-2026-0083 are addressed by preflighting all Instruction
requirements and structured mutation preconditions before target traversal,
including later clauses, short circuits, empty sources and replay with
`recheckPreconditions: false`. Original and canonical precondition spellings
cannot hide one another. A candidate whose syntax cannot be validated fails
closed; inert quoted/encoded data retains its existing meaning.

Expression admission now uses iterative depth-first frames, lazy child-array
iteration, completed-node memoization for shared ASTs and active-path cycle
detection. This is a syntax/capability scan, so memoization does not remove
execution occurrences or chargeable property inspections. It does not make the
general expression evaluator or source-expression parser iterative.

Regression controls cover depths32/6000/9000, widths64/128, shared DAGs, cycles,
quoted ampersands, option-limited syntax and zero namespace/mutation-hook reads
for denied programs. Rust's standalone parsed-expression primitive receives the
same preflight denial for a short-circuited property. Compatibility, target and
resource settings are unchanged; execution and release remain closed.

## Copilot follow-up — 16 November 2026

- [x] Reject properties before acquiring absolute or contextual namespace roots
  in both JavaScript and Rust Resolve. Text and native ASTs return the same
  unsupported-selector diagnostic with missing roots and without invoking root
  hooks. Property-free root diagnostics and traversal retain their behavior.
- [x] Read expression nodes, clause wrappers, child arrays, projection fields
  and Instruction requirements through own data descriptors during admission.
  Accessors are rejected through existing Query/Instruction diagnostic envelopes
  without invoking them, including returning and throwing getters. Create
  destinations expressed as member names retain their existing lowering behavior.
- [x] Preserve iterative depth/width, shared-DAG and cycle controls. DAG visit
  instrumentation now counts data-descriptor reads rather than admitting getters.
  This does not advertise arbitrary Proxy AST support or harden every later
  evaluator/host interaction; it protects the admission fields this slice reads.

No property execution, capability, public declaration, dependency, target contract
or numeric budget changes. Release and deployment remain on hold.
