# Migrating to SANSA0.15

Status: 0.15.0-rc.3 preparation, 24 November 2026. RC2 is already published and
registry verified. This fresh candidate still requires independent preparation
QA, its own publication/installed consumers and final affected-host acceptance.

## Included addressing and evaluation behavior

Read-only child identity selectors select direct children within the selected
scope. For example, `$.items.\item1\` selects a child of `items` by identity. Chained
identity steps traverse successive child relationships. Results retain canonical
structural paths, original handles, order and multiplicity. A second matching
child is ambiguous; a reused identity does not establish mutation freshness.
Use the existing explicit adapter capability and inspection allowance.

Property Resolve/direct Query requires an authoritative optional namespace facet.
`&key("name")` tests an exposed ordinary member key; `&tag("book")` selects a node
container; `&headTag("book")` selects a direct node head. Migrate earlier unpublished
head-target uses of `&tag` explicitly. Ordinary objects with a display `tag` field
cannot supply authoritative metadata. Incoming keys outside the scoped root stay
hidden. An authorized Query row retains its scope facts; it does not gain ancestry.

`$.[""]` addresses an ordinary empty member. Empty ordinary object/attribute keys
retain duplicate checks; empty identities/local-space names are not introduced.
Identity strings remain exact; Unicode wildcard/casing changes do not normalize
stored identities or broaden reference eligibility.

## Provider and host boundaries

See the owning [property support matrix](property-selector-support.md),
[implementation/API notes](property-resolve-implementation.md),
[child identity semantics](child-identity-candidate.md) and
[child identity workflows](child-identity-workflows.md).

The coordinated AEON SDK namespaces support read-only property Resolve and direct
Query; pure Python is standalone Resolve-only and existing native Pytonic Query
uses its separate Rust path. Selected portable AEOS entrypoints are admitted by
the owning AEON integration; native-event AEOS/LSP and structural rule paths stay
closed. Inert Core/native/WASM literals do not become executable selectors.

The SDK-backed source playground uses the actual engines and a matching built
AEON checkout. Legacy `sansa-query` and Query Workbench adapters expose no property
facet and fail with the documented unsupported-scope diagnostic; parsing success
is not evaluation support. Editor highlighting does not grant runtime capability.

AEON clone/pointer references remain constrained structural paths. Identity and
property selector parsing does not admit them into references, Instruction/Mutate/SO,
storage/event paths or other consumers without their existing explicit policies.
Existing constrained child-identity activation remains separately gated; trusted
activation does not enable it implicitly.

## API and resource migration

RC3 includes the merged JavaScript wildcard stabilization: `$.*` and `$.**`
consume adapter child iterables incrementally under `maxBindings`, stop at the
first over-limit candidate without partial results, and close active iterators.
Successful traversal keeps depth-first order, original binding handles and
repeated occurrences. RC2 may enumerate every child before rejecting the same
small allowance. The corresponding pure Python source fix belongs to
[AEON #217](https://github.com/AltoPelago/aeon/pull/217); it does not imply a new
native-wheel or standalone Python publication here. Namespace construction and
arbitrary adapter/iterator work remain separate from this expansion guard.

Rust enum/option/diagnostic changes may require downstream source updates; follow
the implementation notes rather than copying metadata fields from an opaque
adapter. Namespace facets are optional; callers must retain original binding
ownership and capability checks. Queries share private per-invocation inspection
budgets across their admitted identity/property uses; callers should pass the
existing supported options, not manufacture public budget/session objects.

Logical inspection limits do not bound all adapter construction, ancestry,
projection, rendering or allocation costs. Existing default/maximum and independent
parser/result/resource limits are unchanged. Compatibility/target tests and1.15x
latency/1.20x memory budgets remain required. The recorded identity V8 heap
qualification is still deferred/unqualified, without a new property-cost waiver.
This document makes no new whole-workflow or all-platform performance claim.

## Deferred and separately scoped features

Local `&first`, `&last`, `&fromFirst(n)` and `&fromLast(n)` plus newline convention/
canonical warnings are deferred to tentative AEON0.17.1. The existing `[n]` index
syntax and newline behavior retain their current contracts. No new recursive/root
selector, identity mutation/SO or identity-based reference is introduced here.
Standalone Aeonic and other experimental APIs retain their documented independent
contracts; advancing this package does not promote experimental snapshots or
synchronize their version numbers with AEON0.17.0.
