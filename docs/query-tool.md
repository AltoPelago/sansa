# SANSA Query Tool

The package includes a standalone query tool for exercising SANSA.Query against
AEON source or a host-neutral JSON namespace fixture:

```bash
npm run query -- --query 'from $.inventory.items.* where contains(.sku, "B") select .sku'
npm run query -- --format json --query 'from $.inventory.items.* where any(.roles.* == "admin") select { sku = .sku name = .name }'
npm run query -- --query-file query.sansaq --fixture fixtures/query-inventory.aeon
npm run query -- --query-file query.sansaq --fixture fixtures/query-inventory.json
npm run query -- --policy validation --query 'from $.inventory.items.* where .qty >= 4 select .sku'
npm run query -- --disable-transform --query 'from $.table.content.* select objectFrom($.table.header.*, .*)'
npm run query -- --max-from-bindings 3 --query 'from $.inventory.items.* select .sku'
npm run query -- --value-semantics fr --query 'from $.inventory.items.* order by .name asc select .name'
npm run query -- --params '{"source":{"type":"SansaAddressLiteral","address":"$.inventory.items[3]"},"field":{"type":"SansaAddressLiteral","address":"?.sku"}}' --query 'from path($.<"params">.source) select path($.<"params">.field)'
```

Text output uses an AEON-like value renderer for readability, including
explicit null reasons such as `!notSet`. JSON output remains the structured
machine-readable result envelope.

The default CLI fixture is [../fixtures/query-inventory.json](../fixtures/query-inventory.json),
which keeps `sansa-query` self-contained after package install. `.aeon`
fixtures are compiled with an optional AEON TypeScript Core runtime and adapted
into a SANSA resolver namespace; JSON fixtures expose bindings with `address`,
`children`, optional `attributeSpace` or `attributes`, optional `localSpaces`,
and scalar values through `value` or `scalar`.

AEON fixture support is optional so SANSA can remain a lower-level package. For
published-package use, install `@altopelago/aeon-core` in the calling project or
set `SANSA_AEON_CORE_MODULE` to an AEON Core module path or specifier. Inside
the aeon-family development workspace, the tool also falls back to the sibling
AEON TypeScript build path.

The CLI can also mount JSON params at `$.<"params">` using `--params` or
`--params-file`. Params may be supplied as a full fixture binding with
`children`, or as a simple object map. Structured SANSA Address Literal values
use `{ "type": "SansaAddressLiteral", "address": "..." }` and become usable
through `path(...)`.

Use `--policy validation` to exercise the proposal-stage validation policy from
the CLI. Use `--disable-transform` to run normal Query evaluation with
experimental `SANSA.Transform` helpers disabled.

Use `--value-semantics <profile>` to select an explicit query value-semantics
profile. The current implementation recognizes `default`,
`aeon.value.default.v1`, `aeon.value.string.codepoint.v1`,
`aeon.value.string.natural.ascii.v1`, `fr`, `fr-FR`, and
`aeon.value.string.locale.fr.v1`; other compact locale tags are passed to
the host Intl collation surface as implementation-slice behavior.

Host callers can pass optional `evaluateQuery(..., { budget: ... })` limits for
pipeline sizes such as `maxFromBindings`, `maxWhereCandidates`,
`maxOrderCandidates`, and `maxResultRecords`. The CLI exposes the same surface
through `--max-from-bindings`, `--max-where-candidates`,
`--max-order-candidates`, and `--max-result-records`. Budget exhaustion reports
`SANSA_QUERY_BUDGET_EXCEEDED` and returns no partial result set.

## Browser Workbench

For browser-based testing against `.aeon` source, run the technical workbench:

```bash
npm run query:web
```

Then open `http://127.0.0.1:4173/tools/query-web/`.

The workbench defaults to [../fixtures/query-inventory.aeon](../fixtures/query-inventory.aeon),
derives a SANSA resolver namespace from the optional AEON TypeScript Core
runtime, and runs SANSA.Query over that derived graph. It also includes a params
local-space editor mounted at `$.<"params">`, a Normal/Validation policy toggle,
a Transform extension toggle, a value-semantics profile selector, optional
budget limit inputs, plus a JSON fixture mode for debugging the resolver shape
directly.

In text mode, failed parses and evaluations render compact diagnostic lines
with phase and candidate context when available. JSON mode exposes the full
diagnostic payload. Inspect mode renders a scan-friendly view of candidate
addresses, projected values, selected binding addresses, and binding metadata.

Workbench examples live in [../tools/query-web/examples.mjs](../tools/query-web/examples.mjs).
The browser UI renders the grouped example menu from that catalog, and the
runtime tests execute the same examples against the default `.aeon` fixture
when an AEON runtime is available.

## Query Semantics

Boolean context accepts explicit Boolean scalar values and single resolved
bindings that expose a Boolean scalar; it does not use host-language truthiness.
Boolean `not` negates Boolean expressions. Boolean `and` and `or` evaluate left
to right and short-circuit, so guard predicates can protect later scalar
comparisons from missing or incompatible bindings.

Existence predicates inspect whether a resolution expression resolves any
bindings. `exists(...)` returns true when one or more bindings are present, and
`absent(...)` returns true when no bindings are present.

```text
where exists(.roles) and absent(.roles.*)
```

Explicit null values are bindings, not missing data. Use `isNull(...)` or
`isNullReason(...)` to test null values after guarding for presence:

```text
where exists(.status) and isNullReason(.status, "notSet")
```

NaN and infinity are explicit numeric special values. Use `isNaN(...)` and
`isInfinity(...)` for literal-form tests; `NaN` is rejected by scalar comparison
and ordering.

`isValue(...)` is a missing-aware concrete-value guard. It returns true for one
concrete value, including finite numbers, infinities, strings, Booleans,
lexical structured scalars, SANSA address literals, legal reference forms, and
containers. It can inspect scalar expressions directly or a Binding Set produced
by resolution or `path(...)`. It returns false for missing bindings, explicit
null, explicit absence values, and NaN, while multiple bindings remain a
cardinality error.

The current evaluator allows same-type number and string comparisons, Boolean
equality, and infinity as a numeric bound. It rejects mixed-type comparisons,
Boolean ordering, explicit null comparison, and NaN comparison.

Membership tests a scalar against the scalar values exposed by a Binding Set:

```text
where "admin" in .roles.*
```

The left operand must resolve to one scalar. The right operand must be a Binding
Set; empty and non-matching sets evaluate to false. Each right-side binding is
compared using equality comparison rules, so incompatible values, explicit
nulls, and NaN fail instead of being skipped.

Ordinary string functions consume single scalar string arguments. The current
built-ins are `contains`, `startsWith`, `endsWith`, `lower`, `upper`, and
`concat`. Function-name matching is case-sensitive. They fail on missing
bindings, multiple bindings, explicit null, numeric specials, and other
non-string values unless a specific function contract says otherwise.

String comparison and `order by` use deterministic Unicode scalar-value
ordering by default. They do not use host locale or process locale collation
unless an embedding caller supplies an explicit value-semantics profile.
For exploratory testing, the CLI and browser workbench can select the French
profile to compare locale-aware behavior against the default codepoint order, or
the Natural ASCII profile to compare numeric-region behavior such as
`part-2 < part-10`.

`path(value)` activates a structured SANSA Address Literal value. In expression
positions such as `select`, `where`, and `order by`, it resolves in the current
candidate context and returns a Binding Set. In `from path(...)`, it supplies
the source Binding Set for the query. It does not parse plain strings as
addresses.

`fallback(primary, replacement)` handles missing primary values only. The
replacement expression is evaluated only when the primary expression resolves no
scalar value; explicit null, cardinality, type, and comparison errors remain
fail-fast.

`resolveChild(base, key)` resolves a dynamic direct member or position from one
addressable base container. String keys select members; non-negative integer
keys select positions. A missing target returns an empty Binding Set, and the
consuming expression decides whether that is acceptable. It does not parse
traversal strings or perform collection joins.

`objectFrom(keys, values)` is an experimental transform-library helper. It
pairs two ordered Binding Sets by position and constructs a derived object. Key
bindings must expose unique string scalar values, value bindings must expose
scalar values, and mismatched lengths fail with a cardinality diagnostic.

`fieldsFrom(keys, values, field, ...)` is an experimental transform-library
helper. It uses the same ordered pairing model as `objectFrom`, then returns
only the requested string-named fields.

Semantic and representation filters can be used as comparison guards. This
keeps mixed-type or missing bindings out of scalar comparisons:

```text
where exists(.id#number) and .id > 2
```

Cardinality operators follow conventional quantified logic. `any(...)` requires
at least one match, `all(...)` is true when every resolved binding matches, and
`none(...)` is true when no resolved binding matches. Empty Binding Sets
therefore evaluate as `any(empty) = false`, `all(empty) = true`, and
`none(empty) = true`.

To require a non-empty set where every binding matches, combine `any(...)` and
`all(...)` explicitly:

```text
where any(.roles.* == "admin") and all(.roles.* == "admin")
```

The name `only(...)` is not part of the current evaluator surface; it remains a
possible future shorthand for this non-empty-all pattern.

## Recipes

Scalar params mounted in the `params` local space can be compared directly.
Local-space names use quoted selector syntax:

```text
from $.inventory.items.*
where .name == $.<"params">.name
select .sku
```

SANSA Address Literal params are activated with `path(...)` before resolution:

```text
from path($.<"params">.source)
where isValue(path($.<"params">.statusField)) and path($.<"params">.statusField) == "active"
order by path($.<"params">.sortField) asc
select path($.<"params">.field)
```

```text
from $.inventory.items.*
where isValue(.status) or (exists(.status) and isNull(.status))
select { sku = .sku status = fallback(.status, "missing") }
```

```text
from $.inventory.items.*
where .qty >= 4
select { sku = .sku category = resolveChild($.inventory.categoryLabels, .category) status = fallback(.status, "missing") }
```

```text
from $.table.content.*
select objectFrom($.table.header.*, .*)
```

```text
from $.table.content.*
select fieldsFrom($.table.header.*, .*, "age")
```

The table-row helpers above are experimental `SANSA.Transform` extensions, not
required SANSA.Query core behavior.
