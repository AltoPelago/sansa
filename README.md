# SANSA

Shared SANSA address, resolve, and query parser/evaluator model.

This package is the first implementation slice for SANSA Address, SANSA Resolve, and SANSA.Query. It parses and renders SANSA address expressions, can resolve those expressions against a host-supplied namespace adapter, can parse the SANSA.Query clause and expression surfaces, and includes an initial evaluator scaffold. It does not inspect host values directly beyond host-exposed binding metadata, apply host-specific authorization, or assign semantics to qualifiers.

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
- Stage 1 SANSA.Query expression parsing for resolution expressions, literals, comparisons, Boolean operators, cardinality operators, function-call shape, and projection shape
- Stage 2 SANSA.Query evaluator scaffold for `from`, Boolean `where`, `order by`, `offset`, `limit`, and `select` over literals, resolution expressions, comparisons, Boolean operators, cardinality predicates, and projection expressions

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
import { evaluateQuery, parseAddress, parseQuery, parseQueryExpression, renderAddress, resolveAddress } from "@altopelago/sansa";

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

const expression = parseQueryExpression('any(.roles.* == "admin")');

if (expression.ok) {
  console.log(expression.expression.type);
}

const evaluated = evaluateQuery('from $.inventory.items.*\nselect .sku', { root });

if (evaluated.ok) {
  console.log(evaluated.results.length);
}
```
