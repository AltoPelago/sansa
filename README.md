# SANSA

Shared Semantic Address NameSpace Abstraction (SANSA) address, resolve, query, and mutation-planning model.

This package is the first implementation package for SANSA Address, SANSA Resolve, and SANSA.Query, with an experimental structured-plan API for SANSA.Mutate. It parses and renders SANSA address expressions, resolves those expressions against a host-supplied namespace adapter, parses the SANSA.Query clause and expression surfaces, and evaluates a bounded query subset over host-neutral bindings. It also exposes the Shared AEON Value Semantics minimum consumer contract used by Query for concrete value predicates, equality, ordering behavior, and string profile hooks. The experimental Mutate API plans exact create, replace, remove, insert, and same-container move operations, preserves datatype/kind value intent, enforces operation/precondition/value budgets, and applies plans only through host-supplied mutation hooks. It does not inspect host values directly beyond host-exposed binding metadata, apply host-specific authorization, provide transactions, decide schema legality, or assign semantics to qualifiers.

Implementation capability metadata is recorded in [docs/capabilities.json](docs/capabilities.json). The package currently advertises `AEON.ValueSemantics`, `SANSA.Addressing`, `SANSA.Resolve`, `SANSA.Query`, Query budget controls, the experimental `validation` Query policy, experimental `SANSA.Transform` library extensions for `objectFrom` and `fieldsFrom`, and an experimental `SANSA.Mutate` plan API.

## Current Scope

- root selectors: `$`, `?`
- member selectors: `.name`, `.["quoted.name"]`
- positional selectors: `[0]`, `[2..5]`, `[2..]`, `[..5]`
- parent selector: `.^`
- attribute address-space selector: `.@`
- local address-space selector: `.<"namespace">`
- expansion selectors: `.*`, `.**`
- filters: `#type`, `%kind`
- name pattern selector: `.("pattern")`
- qualified address literals with top-level qualifier unions
- structural resolve over host bindings with exact selectors, parent traversal, position ranges, expansion selectors, name patterns, semantic type filters, and representation kind filters
- deterministic preorder descendant expansion with explicit attribute and local address-space traversal
- SANSA.Query parsing for `from`, `where`, `order by`, `offset`, `limit`, and `select`
- query comment stripping, clause-order validation, and canonical query rendering
- SANSA.Query expression parsing for resolution expressions, literals, comparisons, Boolean operators, membership, cardinality operators, function-call shape, and projection shape
- SANSA.Query evaluation for `from`, Boolean `where`, `order by`, `offset`, `limit`, and `select` over literals, resolution expressions, comparisons, Boolean operators, membership, cardinality predicates, built-in string functions, function-like operators, and projection expressions
- experimental SANSA.Mutate structured planning for exact `create`, `replace`, `remove`, ordered `insert`, and same-container `move`
- experimental SANSA.Mutate value-intent preservation and operation, precondition, and value budgets
- experimental mutation apply through explicit host mutation hooks with stale-target checks

Host implementations decide which qualifier surface they accept. This parser accepts the SANSA qualifier grammar and preserves it structurally.

Host implementations also decide which address spaces they expose during resolution. Attribute and local address-space traversal are entered explicitly with `.@` and `.<"namespace">`. They fail explicitly unless the host exposes those capabilities through the resolve namespace adapter or binding model.

Resolve returns ordered Binding Sets. Supported selectors that miss on one branch contribute no bindings for that branch; unsupported or forbidden operations fail explicitly. The resolver preserves duplicate traversal occurrences and does not deduplicate by address. Parent traversal from the effective resolution root resolves empty by default, but callers can request stricter policy diagnostics with `failOnParentFromEffectiveRoot: true` or forbid parent traversal entirely with `parentTraversal: "forbid"`.

Name patterns use `?` for one Unicode code point and `*` for zero or more Unicode code points. Within the decoded pattern payload, `\?`, `\*`, and `\\` match literal question mark, asterisk, and backslash characters respectively.

The current API and AST contract is documented in [docs/api-contract.md](docs/api-contract.md).

The CTS runner covers address parsing, resolve behavior, query parsing, and query evaluation:

```bash
npm run cts
npm run cts:value-semantics
npm run cts:resolve
npm run cts:query
npm run cts:query:experimental
npm run cts:mutate
```

The default Query CTS lane runs core conformance and skips experimental extension cases. `cts:query:experimental` includes experimental extension coverage.
The Mutate CTS lane is experimental and is not included in `npm run cts` while SANSA.Mutate remains proposal-stage.

## Query Tool

The package includes a standalone query tool for exercising SANSA.Query against
AEON source or a host-neutral JSON namespace fixture:

```bash
npm run query -- --query 'from $.inventory.items.* where contains(.sku, "B") select .sku'
```

The default CLI fixture is [fixtures/query-inventory.json](fixtures/query-inventory.json),
which keeps `sansa-query` self-contained after package install. `.aeon` fixture
support is optional and uses an AEON TypeScript Core runtime when one is
available.

For browser-based technical testing, run the Query Workbench:

```bash
npm run query:web
```

Then open `http://127.0.0.1:4173/tools/query-web/`.

The same local server also exposes the experimental Mutate Workbench:

```bash
npm run mutate:web
```

Then open `http://127.0.0.1:4173/tools/mutate-web/`.

Both the CLI and browser workbench can select an explicit query value-semantics
profile, such as the default codepoint profile, the Natural ASCII numeric-region
profile, or the French locale profile, to test comparison, ordering, and
case-mapping behavior under different consumer contexts.

Full CLI, workbench, Query semantics, and recipe details live in
[docs/query-tool.md](docs/query-tool.md).

## Release Notes

Release history lives in [CHANGELOG.md](CHANGELOG.md).

## API

```js
import {
  evaluateQuery,
  evaluateValueSemanticsOperation,
  applyMutationPlan,
  parseAddress,
  planMutation,
  parseQuery,
  parseQueryExpression,
  renderAddress,
  resolveAddress
} from "@altopelago/sansa";

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
  console.log(evaluated.results[0]?.address);
}

const ordinary = evaluateValueSemanticsOperation("isValue", {
  value: { category: "finiteNumber", value: "42" }
});

if (ordinary.ok) {
  console.log(ordinary.value);
}

const mutation = planMutation({ op: "replace", target: "$.inventory.sku", value: "B-200" }, {
  root,
  mutate: {
    replace(target, value) {
      target.value = value;
      return { binding: target };
    }
  }
});

if (mutation.ok) {
  const applied = applyMutationPlan(mutation.plan, {
    root,
    mutate: {
      replace(target, value) {
        target.value = value;
        return { binding: target };
      }
    }
  });
  console.log(applied.ok);
}
```

Each query result carries the source candidate `address` when the namespace exposes one. The projected selection or object lives in `result.value`.
