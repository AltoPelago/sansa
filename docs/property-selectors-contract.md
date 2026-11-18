# Property selectors: candidate API contract 0.2

Status: **unreleased candidate; core direct read-only Resolve and Query implemented**.
JavaScript/TypeScript and Rust expose the optional facet. Owning AEON SDK namespaces
supply authoritative metadata; pure Python remains Resolve-only because it has no
Query evaluator. Native/WASM ports expose Core literals, not a new Resolve/Query API.
The `.d.ts`, `.rs` and `.pyi` siblings retain original review sketches; current
exported types/modules and the [implementation checkpoint](property-resolve-implementation.md)
describe delivered support and limits. No profile promotion or release.
Existing capability manifests are unchanged.

## Address and Query model

`&key("...")`, `&tag("...")` and `&headTag("...")` are suffix filters without a preceding dot.
They use the existing SANSA quoted-payload decoder/canonical emitter; no JSON-only
or host-regex replacement is allowed. Payloads may contain whitespace, escaped
quotes/backslashes and literal wildcard characters. Unknown names/extra arguments
fail. `&first`/`&last`/rank operators remain deferred.

The proposed selector is `{type:'propertyFilter', property:'key'|'tag'|'headTag', value:string}`.
Normalize caller ASTs without mutation, recompute rendering/exactness, and reject
unknown variants/invalid Unicode/unchecked accessor fields or cyclic graphs.
Property-bearing addresses have fixed candidate ceilings: 256 total selectors,
4096 argument scalars and 65536 canonical scalars. Use bounded scratch while
recognizing/validating; do not serialize an unchecked graph. These are not a
constant work bound independent of caller input length. Preserve existing parsing
options, especially an explicitly increased position-index limit. Property-free
inputs retain existing limits and behavior.

Query `.&key("x")`/`.&tag("x")` is a distinct current-row resolution expression:
`scope:'current'`, contextual address root and the property selector. Standalone
Addressing still requires `$` or `?`. Explicit `?&key("x")` starts a contextual
boundary. Do not implement current-row syntax by a generic dot-member rewrite.
Query scanners must preserve quoted spaces, comment characters and clause words
inside arguments. An empty selected Binding Set retains its candidate result
record; a false `where exists(...)` removes it.

## Optional namespace facet

The single additive namespace member is `properties`. Keeping accessors together
avoids confusing `binding.key`, old `namespace.name` or cached outer tags with an
opt-in authoritative property interface. No public session, index or mutable
counter is introduced.

| Operation | Contract |
| --- | --- |
| `scope(binding, context)` | Mandatory for the facet. Return `root`, `inside` or `outside`; prove both authorization and any `directHeadOf` ownership request. |
| `key(binding, context)` | Optional key support; Unicode-scalar string or absent. Root keys are hidden by the engine without calling this hook. |
| `nodeKind(binding, context)` | For tag support, exactly `NodeLiteral`, `NodeHead` or `Other`; no binding-field fallback. |
| `nodeTag(binding, context)` | For tag support, Unicode-scalar string or absent. Only called on an authorized NodeHead. |
| `nodeHeads(binding, context)` | For tag support, incremental iterable of original directly owned head handles; no flattening, eager clone or hidden suffix read. |

Both tag predicates share node support requiring all three node operations, even in an empty/non-node
namespace. Key support requires `key`; both require `scope`. JavaScript/Python
use callable presence; Rust's optional facet has required `scope`, explicit
`supports_key`/`supports_nodes` defaults false and checked fallible methods.
A supported absent value is a miss. Invalid kinds, nonstring/ill-formed values,
non-iterables and wrong-kind heads fail. Scope and metadata errors must not expose
foreign addresses, hidden values or host exception text.

`PropertyAccessContext` is engine-created/read-only, with `scopeRoot`,
`evaluationRoot` and optional `directHeadOf`. Do not accept caller authority roots
in Resolve options/ASTs. Each in-flight occurrence retains its own scope frame:
absolute namespace root; standalone contextual boundary; Query current-row
anchor retaining its originating scope; and new boundaries at explicit attribute
or local-space roots. Parent navigation is unchanged, but property inspection of
an escaped occurrence fails. The facet must not infer authority from a canonical
path. Adapters unable to prove it stay unsupported.

Only `&headTag` matches a NodeHead's own tag. `&tag` matches only a NodeLiteral, existentially inspecting its direct heads,
emitting the original container at most once per input occurrence. Stop at first
match; later navigation still starts from that container. Repeated branches retain
results and charges. Ordinary `tag` object fields and cached outer tags are ignored.

## Failure and resource API

Use `maxPropertyInspections` (Rust `max_property_inspections`), default 10000,
portable finite integer-valued numbers 0..1000000; booleans are invalid. Integral numeric 1.0 and negative zero normalize to 1 and 0 across JSON/Python bridges before the Rust u32 field; do not coerce strings or arbitrary host objects. Invalid input/AST
comes first, then options, root validity, consumer policy and complete capability
preflight. Reject missing support before traversal even on an empty or
short-circuited branch. No metadata/child/head callback runs during preflight.

Charge a candidate before scope/kind/key access, including hidden roots, absent
keys and Other kinds. Tagging a container also charges each yielded head before
its scope/ownership/kind/tag access. One terminal `next` probe may prove an exact
budget sufficient; it must not inspect a yielded over-budget head. Iterator work
before yielding is separate host cost. Query shares one private allowance across
from/where/order/select, projections and repeated internal resolutions. A new
public/reentrant call starts a fresh allowance. Do not repurpose identity or
binding limits, cache away charges or bypass earlier `maxBindings` errors.

Exhaustion returns no partial bindings/records, with
`SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED`, `budget:'maxPropertyInspections'`,
`limit`, `observed:limit+1`, `property` and `selectorIndex`. Query uses its existing
`phase`: `policy` for preflight or the consuming clause. Existing diagnostic span
conventions remain host-specific. Full identifiers are in the owning JSON resource.

Checked adapter faults have `invalidMetadata`, `scopeViolation` and `adapterFailure`
kinds, mapping to the corresponding property diagnostics. Other callback/iterator
exceptions map to `SANSA_RESOLVE_PROPERTY_ADAPTER_ERROR`. Existing non-property
callbacks keep their old behavior. Release iterator resources on all exits;
Python must explicitly close generators when appropriate, JavaScript uses return
and Rust Drop. An unvisited suffix is not validated after success. Rust iterator
`Err` is an iterator failure before another head's inspection, matching a thrown
JavaScript/Python next failure. Cleanup failures also fail the invocation; host
panic/abort behavior is not a portable checked-error guarantee.

## Provider and consumer plan

| Provider | Implementation obligation, not delivered support |
| --- | --- |
| JS/TypeScript SANSA + AEON SDK | Add the optional facet and validated read-only contexts. Back metadata with exposed authoritative topology, not `.name`, display paths or a cached container tag. |
| Rust SANSA + SDK/AEOS | Add default-None `Namespace.properties`; implement the fallible streaming facet in owning adapters. Preserve opaque `Binding: Clone + Eq`; no owned-document or borrowed-string API migration is required. |
| Pure Python AEON | Optional `properties` mapping follows the same camelCase callback/context keys and error domain. Resolve only until a separate Query implementation exists. |
| Native/Python/WASM bridges | Preserve error/absent/scope/ownership distinctions and counters through actual existing entry points. No new native/WASM API is implied by these sketches. |

Candidate 0.2 intends Addressing, read-only Resolve and direct read-only Query.
AEOS selector and Type Transpiler require separate integration admission. Activation
(including trusted), Graph, mutation/Instruction/SO, structural AEOS paths,
references and event/storage paths stay closed. Query-shaped mutation entry points
must deny properties before traversal; a generic Query parser/evaluator must not
silently admit them. AEON literal syntax reuses Addressing; lexical integration is an owning evidence gate, not a new literal deny rule. Never
change public capability manifests or claim CTS support just because this ABI exists.

## Delivery gates

1. Review/merge the owning unpublished spec/resource, this API and explicit CTS
   preparation target. They do not promote an immutable snapshot.
2. Implement parser/AST/render and bounded authorization/accounting in each
   advertised provider. Reuse existing payload/cursor machinery.
3. Implement direct Query current/contextual frames and full-clause preflight,
   with real Query record semantics and separate old-consumer denials.
4. Execute every selected experimental expectation, including probe counts,
   through actual source/installed/native/WASM/tooling consumers as advertised.
   Unsupported instrumentation must fail, not skip expectations.
5. Retain original reference/target checks and 1.15x latency/1.20x memory budgets;
   measure the new work under an approved protocol. No inherited heap waiver.

Local positions keep their separate group/candidate/buffer/cost gate. Official
release, deployment and publication stay held. No tests here establish implemented
property-selector conformance.

Owning specification input: [`ec43f7996d3d44d86e1a7639bb26d98b4fb829c1`](https://github.com/aeonite-org/aeonite-specs/commit/ec43f7996d3d44d86e1a7639bb26d98b4fb829c1). This pins the proposal, not an adopted or published profile.

## Unreleased 0.2 kind split

`&tag("book")` retains only NodeLiteral containers with a matching direct head.
`&headTag("book")` retains only NodeHead bindings with that intrinsic tag. A
wrong-kind candidate is a charged miss after scope/kind validation; it does not
read tag metadata or enumerate heads. Neither predicate matches a StringLiteral
whose value happens to be `book`. Both share the existing node capability and
inspection allowance. `nodeTag` remains the adapter callback name for authorized
head access; it is not renamed by this grammar addition.

Child navigation stays explicit: `...&headTag("book").*` selects the matched
head's children. A recursive search can now select containers or heads without
implicitly returning both. `&key`, scope/ownership, ordering, multiplicity,
canonical structural paths, resource ceilings and prohibited-consumer admission
remain unchanged. This revises an unpublished candidate; it does not promote a
stable profile. Rust exhaustive PropertyName matches must handle HeadTag.
