# AltoPelago SANSA Runtime

`altopelago-sansa-runtime` is the host-neutral Rust implementation of SANSA.
The Rust library is imported as `sansa_runtime`.

The current release implements and directly exercises these pinned stable CTS
lanes:

- `SANSA.Addressing`
- `SANSA.Resolve`
- the `AEON.ValueSemantics` minimum-consumer contract

`SANSA.Query` is intentionally reported as unimplemented. The JavaScript
`@altopelago/sansa` package remains the released reference implementation for
Query and the broader experimental surfaces.

The additive Rust surface does parse the stable Query clause and expression
grammar and passes all 57 parser CTS cases. Parsing is resource-bounded and
returns a canonical host-neutral AST. This is not a Query capability claim:
evaluation and its 173 stable CTS cases remain unimplemented.

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

See the [SANSA repository](https://github.com/AltoPelago/sansa) for contracts,
conformance details, and the JavaScript implementation.

The repository conformance harness is opt-in for registry consumers because it
requires an authoritative `aeonite-cts` checkout. Set `AEONITE_CTS_ROOT` to its
`cts` directory and run `cargo test --features cts`.
