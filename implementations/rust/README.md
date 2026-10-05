# SANSA Rust Runtime

This directory contains the unpublished host-neutral Rust SANSA runtime. It is
additive to the released JavaScript implementation. The current slice directly
implements the pinned stable `SANSA.Addressing`, `SANSA.Resolve`, and
`AEON.ValueSemantics` minimum-consumer CTS lanes. Query remains unimplemented
and unclaimed.

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

Run the Rust lane from the repository root with:

```bash
npm run test:rust
```

Set `AEONITE_CTS_ROOT` to the `cts` directory of an `aeonite-cts` checkout when
it is not available at the normal aeon-family sibling path.
