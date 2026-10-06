# AltoPelago SANSA Runtime

`altopelago-sansa-runtime` is the host-neutral Rust implementation of SANSA.
The Rust library is imported as `sansa_runtime`.

The current release implements and directly exercises these pinned stable CTS
lanes:

- `SANSA.Addressing`
- `SANSA.Resolve`
- `SANSA.Query`
- the `AEON.ValueSemantics` minimum-consumer contract

The Rust Query surface parses the stable clause and expression grammar and
evaluates the complete stable core lane: 57 parser cases and 160 evaluator
cases. It preserves opaque host binding handles, typed scalar families,
binding sets, ordered derived-object fields, deterministic ordering,
short-circuit behavior, phase-specific budgets, and constrained dynamic
address activation. Experimental Transform cases remain excluded.

Resolve operates on opaque `Clone + Eq` binding handles through the `Namespace`
trait, so hosts retain their own document representation. The runtime does not
use JSON as its semantic model.

```rust
use sansa_runtime::address::parse_address;
use sansa_runtime::query::parse_query;

let address = parse_address("$.inventory.items[0]").expect("address parses");
assert_eq!(address.canonical, "$.inventory.items[0]");

let query = parse_query("from $.inventory.items.*\nselect .sku").expect("query parses");
assert_eq!(query.canonical, "from $.inventory.items.*\nselect .sku");

```

Hosts implement `resolve::Namespace` over their own opaque binding handles,
including the defaulted value and canonical-address hooks consumed by
`evaluate::evaluate_query`.

See the [SANSA repository](https://github.com/AltoPelago/sansa) for contracts,
conformance details, and the JavaScript implementation.

The repository conformance harness is opt-in for registry consumers because it
requires an authoritative `aeonite-cts` checkout. Set `AEONITE_CTS_ROOT` to its
`cts` directory and run `cargo test --features cts`.
