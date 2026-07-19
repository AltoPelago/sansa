# SANSA

Shared SANSA address, resolve, and query parser model.

This package is the first implementation slice for SANSA Address, SANSA Resolve, and SANSA.Query parsing. It parses and renders SANSA address expressions, can resolve those expressions against a host-supplied namespace adapter, and can parse the Stage 0 SANSA.Query clause surface. It does not evaluate queries, inspect host values directly, or apply host-specific authorization.

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
- deterministic preorder descendant expansion with explicit attribute and local address-space traversal
- Stage 0 SANSA.Query parsing for `from`, `where`, `order by`, `offset`, `limit`, and `select`
- query comment stripping, clause-order validation, and canonical query rendering

Host implementations decide which qualifier surface they accept. This parser accepts the SANSA qualifier grammar and preserves it structurally.

Host implementations also decide which address spaces they expose during resolution. Attribute and local address-space traversal are entered explicitly with `.@` and `.<"namespace">`. They fail explicitly unless the host exposes those capabilities through the resolve namespace adapter or binding model.

The current API and AST contract is documented in [docs/api-contract.md](docs/api-contract.md).

The CTS runner covers address parsing, resolve behavior, and the query parser scaffold:

```bash
npm run cts
npm run cts:resolve
npm run cts:query
```

## API

```js
import { parseAddress, parseQuery, renderAddress, resolveAddress } from "@altopelago/sansa";

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

const query = parseQuery('from $.inventory.items.*\nwhere .qty >= 1\nselect .sku');

if (query.ok) {
  console.log(query.query.canonical);
}
```
