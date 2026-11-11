# Child identity selector candidate

Local experimental parser/render/read-only Resolve implementation, not a released capability. Scoped Rust, TypeScript/JavaScript and native Python candidates have local functional/artifact evidence; each package advertises only its verified APIs. Query, activation, AEOS selectors, custom matchers, Instruction, mutation and SO remain separately unadmitted. Final versions, registry locks, immutable spec/CTS references and platform verification remain release work.

The 12 November 2026 delivery decision defers unresolved JavaScript process-heap qualification so the implemented read-only roster can proceed toward rollout. This is an explicit qualification exception, not a memory-budget pass. Original results, baselines and 1.15× latency / 1.20× memory targets remain preserved; correctness, inspection budgets and other release gates remain mandatory.

Standalone Addressing accepts `.\id\` and renders `childIdentity` AST selectors. Expressions containing them remain non-exact. Standalone Resolve requires an explicit namespace `identity(binding)` accessor; it never infers support from a binding field. It scans exposed direct children, retains original bindings and canonical structural paths, and fails on ambiguous matches. Attributes and local spaces require explicit transitions.

`maxIdentityInspections` defaults to 10000 per call, includes missing identities and repeated branch visits, and is charged before identity inspection. Zero permits empty scans but rejects the first child inspection. Iterables are consumed incrementally and closed on early failure. Host enumeration/I/O costs are separate from logical inspection counts.

Caller AST identity payloads are validated through a fresh expression parse; caller-supplied canonical/isExact fields do not confer authority. Internal Query, activation, Instruction, mutation and graph resolution do not admit the new selector. Shared structural-reference cursors omit the optional identity parsing hook and retain native identifier rejection; this does not enable identity references. External adapters/consumers require their own explicit admission review.

Candidate tests vendor digest-recorded copies of authority fixtures under test/fixtures/child-identity; package tests do not depend on an adjacent CTS checkout. Runtime and consumer coverage must be reported per API; parser parity does not admit other consumers. Final versions, registry locks, immutable spec/CTS references and platform/release review remain open. No new public capability registry claim or package version is made by this prototype.

## Rust local verification — 8 November 2026 (historical checkpoint)

Independent Core/shared-runtime and scoped SDK read-only candidates now pass local source and packed verification: 20 parser/35 representable Resolve vectors per engine, AST/iterator/budget/admission checks, unchanged native reference behavior and 464 Rust performance metrics within 1.15× latency / 1.20× retained-memory ceilings. Three JS invalid-type inputs cannot inhabit the Rust API types and remain qualified. The SDK consumes the exact local 0.15.0-rc.1 runtime; registry publication/checksum lock and final versions remain release work. Core uses a distinct structural-identity field instead of its opaque occurrence identity. SDK iteration respects actual scope and node-head topology.

These are local Rust candidate results, not an extension of the existing JavaScript-only CLI protocol claim. Later Python/Pytonic/WASM and embedding evidence is tracked separately in the AEON delivery record; this historical Rust receipt does not establish those surfaces. Consumer admission and final release verification remain separate.


## Public diagnostic typing

`SansaResolveDiagnostic.identity` is an optional string containing the authored identity on identity-related resolution failures, including unsupported and ambiguous selection. It is diagnostic context, not a resolved binding handle or a canonical address. Its optional declaration matches the existing runtime result; this does not admit identity selectors into other consumers.
