# SANSA Rust Runtime

This directory contains the unpublished shell for a future host-neutral Rust
SANSA runtime. It is additive to the released JavaScript implementation and
does not currently implement or claim SANSA Address, Resolve, Query, or AEON
Value Semantics conformance.

The initial workspace exists to establish:

- a SANSA-owned Rust dependency boundary;
- normalized diagnostic and capability metadata;
- direct validation of pinned, authoritative CTS manifests; and
- CI checks that prevent capabilities from being claimed before their stable
  lanes are implemented.

Run the Rust lane from the repository root with:

```bash
npm run test:rust
```

Set `AEONITE_CTS_ROOT` to the `cts` directory of an `aeonite-cts` checkout when
it is not available at the normal aeon-family sibling path.
