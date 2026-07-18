# SANSA

Shared SANSA address parser and model.

This package is the first implementation slice for SANSA Address and SANSA Resolve. It parses and renders SANSA address expressions, and it can resolve those expressions against a host-supplied namespace adapter. It does not evaluate queries, inspect host values directly, or apply host-specific authorization.

## Current Scope

- root selectors: `$`, `?`
- member selectors: `.name`, `.["quoted.name"]`
- positional selectors: `[0]`
- attribute address-space selector: `.@`
- local address-space selector: `.<"namespace">`
- expansion selectors: `.*`, `.**`
- filters: `#type`, `%kind`
- name pattern selector: `.("pattern")`
- qualified address literals with top-level qualifier unions
- structural resolve over host bindings with exact selectors, expansion selectors, name patterns, semantic type filters, and representation kind filters

Host implementations decide which qualifier surface they accept. This parser accepts the SANSA qualifier grammar and preserves it structurally.

Host implementations also decide which address spaces they expose during resolution. Attribute and local address-space traversal fail explicitly unless the host exposes those capabilities through the resolve namespace adapter or binding model.

The current API and AST contract is documented in [docs/api-contract.md](docs/api-contract.md).

## API

```js
import { parseAddress, renderAddress, resolveAddress } from "@altopelago/sansa";

const result = parseAddress('$.inventory:csv[","]');

if (result.ok) {
  console.log(result.address.canonical);
  console.log(renderAddress(result.address));
}

const root = {
  address: "$",
  children: [
    {
      name: "inventory",
      address: "$.inventory",
      children: [
        { name: "sku", address: "$.inventory.sku", semanticType: "string", representationKind: "string" }
      ]
    }
  ]
};

const resolved = resolveAddress("$.inventory.*#string", { root });

if (resolved.ok) {
  console.log(resolved.bindings.map((binding) => binding.address));
}
```
