# Child identity selector candidate

Local experimental parser/render/read-only Resolve implementation, not a released capability. Scoped Rust, TypeScript/JavaScript and native Python candidates have local functional/artifact evidence; each package advertises only its verified APIs. Read-only Query now explicitly admits child identities in JavaScript and shared Rust; constrained identity activation is now explicitly available under its own feature and scope checks. AEOS selector admission is now implemented in the AEON TypeScript/Rust/pure-Python validation adapters; schema path fields remain structural. Titonic read-only selection is separately integrated in its local candidate. Other custom matchers, Instruction, mutation and SO remain separately unadmitted. Final versions, registry locks, immutable spec/CTS references and platform verification remain release work.

The 12 November 2026 delivery decision defers unresolved JavaScript process-heap qualification so the implemented read-only roster can proceed toward rollout. This is an explicit qualification exception, not a memory-budget pass. Original results, baselines and 1.15× latency / 1.20× memory targets remain preserved; correctness, inspection budgets and other release gates remain mandatory.

Standalone Addressing accepts `.\id\` and renders `childIdentity` AST selectors. Expressions containing them remain non-exact. Standalone Resolve requires an explicit namespace `identity(binding)` accessor; it never infers support from a binding field. It scans exposed direct children, retains original bindings and canonical structural paths, and fails on ambiguous matches. Attributes and local spaces require explicit transitions.

`maxIdentityInspections` defaults to 10000 per call, includes missing identities and repeated branch visits, and is charged before identity inspection. Zero permits empty scans but rejects the first child inspection. Iterables are consumed incrementally and closed on early failure. Host enumeration/I/O costs are separate from logical inspection counts.

Caller AST identity payloads are validated through a fresh expression parse; caller-supplied canonical/isExact fields do not confer authority. Query source and resolution expressions admit child identities, retaining Binding Set order and original handles. `resolve.maxIdentityInspections` is shared across all clauses, candidates and repeated reads of one Query invocation; every new invocation starts fresh. Any resolution failure discards the full Query result. Dynamic `path(...)` identity activation requires an explicit constrained `childIdentity` feature and pre-inspection/post-resolution canonical scope checks; trusted/default activation stays guarded. Public Rust standalone expression evaluation (used for mutation preconditions), Instruction, mutation and graph resolution remain closed. Shared structural-reference cursors omit the optional identity parsing hook and retain native identifier rejection; this does not enable identity references. External adapters/consumers require their own explicit admission review.

Candidate tests vendor digest-recorded copies of authority fixtures under test/fixtures/child-identity; package tests do not depend on an adjacent CTS checkout. Runtime and consumer coverage must be reported per API; parser parity does not admit other consumers. Final versions, registry locks, immutable spec/CTS references and platform/release review remain open. No new public capability registry claim or package version is made by this prototype.

## Rust local verification — 8 November 2026 (historical checkpoint)

Independent Core/shared-runtime and scoped SDK read-only candidates now pass local source and packed verification: 20 parser/35 representable Resolve vectors per engine, AST/iterator/budget/admission checks, unchanged native reference behavior and 464 Rust performance metrics within 1.15× latency / 1.20× retained-memory ceilings. Three JS invalid-type inputs cannot inhabit the Rust API types and remain qualified. The SDK consumes the exact local 0.15.0-rc.1 runtime; registry publication/checksum lock and final versions remain release work. Core uses a distinct structural-identity field instead of its opaque occurrence identity. SDK iteration respects actual scope and node-head topology.

These are local Rust candidate results, not an extension of the existing JavaScript-only CLI protocol claim. Later Python/Pytonic/WASM and embedding evidence is tracked separately in the AEON delivery record; this historical Rust receipt does not establish those surfaces. Consumer admission and final release verification remain separate.


## Public diagnostic typing

`SansaResolveDiagnostic.identity` is an optional string containing the authored identity on identity-related resolution failures, including unsupported and ambiguous selection. It is diagnostic context, not a resolved binding handle or a canonical address. Its optional declaration matches the existing runtime result; this does not admit identity selectors into other consumers.

See [constrained identity activation](child-identity-activation.md) for policy examples, canonical scope/AST rules, no-parent constraints and the Rust/Pytonic feature names.

AEOS validation owns a separate default 10,000-inspection budget (`max_identity_inspections`) and per-invocation identity-selector cache shared by expansion and closed-world allowance. This consumer integration is in the AEON candidate; SANSA parser support alone does not certify an older AEOS adapter.

Titonic's local candidate explicitly integrates child identities in its read-only
dispatcher using SANSA scans. Its `maxIdentityInspections` option defaults to
10,000 and spans the full call. Binding/alias IDs and NodeHead IDs remain distinct;
results retain structural paths and existing live pointer/clone proxy behavior.
Attribute/local spaces and qualified identity expressions remain unsupported.
Workspace-layout artifacts are locally verified; this does not qualify a
standalone registry install or the broader Tonics build, which retains unrelated
mode-converter value-kind exhaustiveness gaps. Browser/custom matchers,
Instruction, mutation and SO still require their own admission.
