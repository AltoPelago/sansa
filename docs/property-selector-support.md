# Property selector support by provider and host

Delivered support in the published SANSA 0.15.0 package; publication status
updated 25 November 2026 from the 22 November provider audit. Coordinated AEON
stable delivery remains separate. Parsing a selector, exposing ordinary metadata
or coloring its text does not authorize evaluation. Capability/profile statuses
and stable CTS claims are unchanged by package publication.

`&key("name")` tests an authorized incoming member/attribute key. Empty and Unicode
keys remain literal; positions are not keys. `&tag("book")` returns a NodeLiteral
container with a matching direct head. `&headTag("book")` returns a NodeHead;
`...&headTag("book").*` explicitly visits that head's children. Results keep their
original binding handles and structural paths. See the [API contract](property-selectors-contract.md)
and [execution/accounting guide](property-resolve-implementation.md).

## Development for the revised node model

In the JavaScript and Rust provider source, `&tag("book")` inspects the selected
`NodeLiteral` directly. A tag inspection charges one candidate against the
property allowance. A scoped root retains its tag and hides its incoming key.
Both providers reject the former `&headTag()` syntax. The Rust `PropertyAccess`
facet supplies `scope`, `node_kind` and `node_tag` for tag filters. Use this source with
an AEON SDK that exposes tags on nodes and publishes its children at direct
indexes. The published SANSA 0.15.0 behavior is described above.

## Delivered providers

| Provider | Property support | Boundary |
| --- | --- | --- |
| SANSA JavaScript/TypeScript and Rust | Addressing/rendering; standalone read-only Resolve and direct read-only Query when the namespace supplies the authoritative property facet | A bare namespace or ordinary name/tag field does not opt in. Missing capability fails before traversal, including empty sources |
| AEON TypeScript/Rust SDK namespaces | Authoritative document facets for Resolve and direct Query | Document topology and scope authorize metadata; display paths/fields do not. The selected package graph must contain the coordinated implementation |
| Pure Python AEON | Standalone Addressing/Resolve and explicit portable AEOS validation | It has no Query evaluator; it is separate from native Python |
| Existing native Pytonic | `Document.query()` through the Rust SDK, including bounded property allowance and structured diagnostics | No generic Python callback facet or new standalone native Resolve API is introduced |
| Core/native/WASM literal APIs | Inert property literal parsing, representation and transport through their existing APIs | A literal is not activated; reduced Core namespaces cannot evaluate properties and WASM gains no Query API |

The [AEON SDK guide](https://github.com/AltoPelago/aeon/blob/main/implementations/typescript/packages/sdk/README.md)
and [portable AEOS guide](https://github.com/AltoPelago/aeon/blob/main/docs/aeos-property-selectors.md)
name the owning APIs. Declaration sketches beside the candidate contract are
historical design artifacts; current exported types describe the actual ABI.

## Hosts are separate entry points

| Host | Current property behavior |
| --- | --- |
| `tools/playground/` source playground | Uses the real AEON SDK facet and SANSA Resolve/Query engines when supplied a matching built AEON checkout; no substitute property parser or resolver |
| `sansa-query` / `scripts/query.mjs` | Its built-in JSON, native AEON and portable Telex/Film adapters expose no property facet. Parsing can succeed, but evaluation fails with `SANSA_RESOLVE_UNSUPPORTED_PROPERTY_SCOPE` |
| `tools/query-web/` legacy Query Workbench | Same capability limitation as its own adapters; it is distinct from the SDK-backed source playground. Ordinary/previously admitted identity behavior is unchanged |
| AEON language service | Compiler-backed inert literal acceptance; its existing native-event schema validation still rejects property rules. It is not the portable AEOS entry point |
| Editor grammars and installed/vendor hosts | Coloring and a source checkout do not establish semantic or installed support. Property-literal grammar coverage and final selected host graphs remain separate integration work |

Use a capable SDK namespace with `resolveAddress` / `evaluateQuery`, or the
SDK-backed source playground, to exercise property evaluation. Setting a larger
budget or enabling trusted activation does not give an incapable host authority.

## Consumer admission and limits

The separately implemented `aeos-properties-0.1` development profile admits
property predicates only in explicit portable AES/Telex rule-selector APIs.
Legacy native-event AEOS validation, structural `path` rules and the existing LSP
validation path remain closed. Activation (including trusted), Graph,
Instruction/Mutate/SO, clone/pointer references and event/storage paths also
remain closed to property predicates. Direct Query does not admit Query-shaped
mutation or precondition callers. The AES Type Transpiler is deferred and is not
a 0.17.0 prerequisite.

Resolve's `maxPropertyInspections` defaults to 10,000, maximum 1,000,000; Query
shares one private allowance across its clauses. Native Pytonic uses
`max_property_inspections`; portable AEOS uses its documented resource policy.
These names belong to different entry points. Logical inspections do not bound
namespace construction, ancestry, old navigation, all adapter work, time or heap.

SANSA 0.15.0 registry artifacts and clean consumers are verified. Coordinated
AEON stable artifacts/adoption, broader host/platform qualification and experimental
profile/CTS promotion remain separate. This support guide itself establishes no
new native/WASM rebuild, exhaustive conformance, performance acceptance or exact
WASM reproducibility. Compatibility/target checks, defaults and existing 1.15x
latency / 1.20x memory budgets are unchanged; the recorded identity qualification
limitation stays narrow. Deployment remains held. Newline/local positions stay
deferred to tentative AEON 0.17.1 with their own resource/scope gate.
