# SANSA Rust Runtime

This directory contains the host-neutral Rust SANSA runtime, published as
`altopelago-sansa-runtime` and imported as `sansa_runtime`. It is additive to
the JavaScript implementation. The current Rust surface directly implements
the pinned stable `SANSA.Addressing`, `SANSA.Resolve`, and
`AEON.ValueSemantics` minimum-consumer CTS lanes, plus all 226 stable core
`SANSA.Query` cases: 57 parser cases and 169 evaluator cases.

The workspace establishes:

- a SANSA-owned Rust dependency boundary;
- normalized diagnostic and capability metadata;
- direct execution of pinned, authoritative stable CTS cases; and
- CI checks that prevent capabilities from being claimed before their stable
  lanes are implemented.

The Value Semantics implementation includes exact finite-number comparison,
portable Unicode scalar ordering, and the stable natural-ASCII string profile.
It deliberately does not claim locale-sensitive collation or the experimental
radix numeric profiles.

Resolve operates on opaque `Clone + Eq` binding handles through a generic host
namespace trait. Hosts retain their own document representation while exposing
only the navigation and metadata capabilities they support. Resolution covers
contextual roots, parent-boundary policy, attribute and local spaces, filters,
exact multiplicity, and bounded binding materialization.

The Query parser produces a host-neutral syntax AST and canonical source. Its
default limits bound input bytes, consumed tokens, AST nodes, nesting depth,
and literal bytes. The evaluator consumes the same opaque namespace handles as
Resolve, returns typed scalar/binding/object results, preserves deterministic
ordering and short-circuit behavior, enforces phase-specific budgets, and
requires explicit authority for dynamic `path(...)` activation.

The runtime additionally implements the side-effect-free plan surface from the
proposal-stage SANSA.Mutate CTS snapshot: all 28 planner cases execute directly
against opaque host bindings. Planning covers the closed conservative operation
set, exact resolution, container and placement rules, Query preconditions,
conflict detection, budgets, provenance, and portability warnings. Target
validation, apply, and policy remain separately marked unimplemented. No
mutation hook is exposed by this slice.

Run the Rust lane from the repository root with:

```bash
npm run test:rust
```

Set `AEONITE_CTS_ROOT` to the `cts` directory of an `aeonite-cts` checkout when
it is not available at the normal aeon-family sibling path.

## Local child-identity candidate

The unpublished 0.15.0-rc.1 candidate adds `Selector::ChildIdentity`, canonical identity expressions and read-only Resolve. Implement `supports_structural_identity` and `structural_identity` explicitly; the defaults deny support. Override `identity_children` to stream rather than allocate the default child Vec. `max_identity_inspections` defaults to 10,000; logical inspections do not measure adapter I/O/allocation. Scope admission and caller-AST bounds are checked before metadata access. Query, activation and mutation remain closed.

The local AEON SDK pins this exact candidate and verifies extracted archives with a Cargo patch; it does not silently continue using registry 0.14.2. The registry/checksum lock and final version sequence require coordinated release verification. Public enum/option additions may require exhaustive-match or struct-literal updates. Twenty parser and 35 representable Resolve fixture outcomes pass per Rust engine; invalid unsigned limits and numeric Option<String> metadata are explicitly qualified rather than claimed runtime-diagnostic matches. Shared Rust `Diagnostic` now exposes optional selected `identity`; `Diagnostic::new` initializes it to `None`. The AEON Core facade also exposes optional `identity`, `limit` and `observed`. External Rust struct-literal callers must initialize the new fields. Mutable fixtures now assert selected identity, inspection context and six parser code/index pairs; fresh typed API probes pass. Ordinary diagnostic Debug output remains unchanged when the new context is absent. Diagnostic trial1 retains one native SDK quoted-load latency failure, so new production/performance certification remains open; the limit is unchanged. Python and bridge artifact evidence is maintained separately. Stable CTS lanes and the JavaScript-only experimental package claim remain unchanged; no standalone Rust CLI protocol claim is added.
