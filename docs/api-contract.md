# SANSA Parser API Contract

Status: implementation contract for the address parser/model, resolver, query clause parser/model, query expression parser/model, bounded query evaluator, and standalone query tooling slices.

The parser validates SANSA address syntax and returns a structural model. The resolver applies the parsed selector model to a host-supplied namespace adapter. The query parser validates the SANSA.Query clause and expression surfaces and returns structural models. The query evaluator applies a bounded query subset over host-exposed binding metadata. The package does not inspect host values directly, check authorization, or assign semantics to qualifiers.

The implementation capability manifest is [capabilities.json](capabilities.json). It advertises `AEON.ValueSemantics`, `SANSA.Addressing`, `SANSA.Resolve`, `SANSA.Query`, Query budget controls, the experimental `validation` Query policy, and experimental `SANSA.Transform` extensions.

CTS lanes:

```bash
npm run cts
npm run cts:value-semantics
npm run cts:query
npm run cts:query:experimental
```

The default Query CTS lane is core conformance and skips experimental extension cases. The experimental lane includes those cases for implementations that advertise matching extensions.

## Entry Points

```js
parseAddress(input, options?)
parseAddressOrThrow(input, options?)
parseQuery(input, options?)
parseQueryOrThrow(input, options?)
parseQueryExpression(input, options?)
parseQueryExpressionOrThrow(input, options?)
evaluateQuery(input, namespace, options?)
evaluateValueSemanticsOperation(operation, input)
resolveAddress(input, namespace, options?)
renderAddress(address)
renderQuery(query)
renderQueryExpression(expression)
renderQualifierExpression(expression)
renderQualifierTerm(term)
```

`parseAddress` returns a discriminated result:

```js
{ ok: true, address }
{ ok: false, errors: [{ code, message, index }] }
```

`parseAddressOrThrow` returns `address` or throws `SansaParseError`.

`parseQuery` returns a discriminated result:

```js
{ ok: true, query }
{ ok: false, errors: [{ code, message, index }] }
```

`parseQueryOrThrow` returns `query` or throws `SansaParseError`.

`parseQueryExpression` returns a discriminated result:

```js
{ ok: true, expression }
{ ok: false, errors: [{ code, message, index }] }
```

`parseQueryExpressionOrThrow` returns `expression` or throws `SansaParseError`.

`evaluateQuery` accepts either a query string or a parsed `SansaQuery` and returns:

```js
{ ok: true, results, diagnostics }
{ ok: false, results: [], errors }
```

Experimental extensions are enabled by default when the package advertises them. Callers can disable the transform-library surface with:

```js
evaluateQuery(query, namespace, { extensions: { transform: false } })
```

Callers can also provide an exact allow-list:

```js
evaluateQuery(query, namespace, { enabledExtensions: ["sansa.transform.objectFrom"] })
```

A disabled advertised extension fails with `SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION` and includes the extension id in the diagnostic.

The proposal-stage validation policy can be enabled with:

```js
evaluateQuery(query, namespace, { policy: "validation" })
```

This policy rejects presentation and transform behavior before evaluation: `order by`, `offset`, `limit`, object projection expressions, and transform-library helpers. Rejections use `SANSA_QUERY_POLICY_VIOLATION` with `phase: "policy"`.

Query evaluation budgets are optional and fail closed:

```js
evaluateQuery(query, namespace, {
  budget: {
    maxFromBindings: 100000,
    maxWhereCandidates: 100000,
    maxOrderCandidates: 100000,
    maxResultRecords: 10000
  }
})
```

Budget exhaustion returns `SANSA_QUERY_BUDGET_EXCEEDED` with `phase`, `budget`, `limit`, and `observed`. It never implicitly truncates the Binding Set or returns partial results.

The standalone query CLI exposes these budgets as `--max-from-bindings`, `--max-where-candidates`, `--max-order-candidates`, and `--max-result-records`. The browser workbench exposes the same four limits as optional evaluation budget fields.

`evaluateValueSemanticsOperation` evaluates the Shared AEON Value Semantics minimum consumer operation shape used by the CTS scaffold:

```js
evaluateValueSemanticsOperation("equal", {
  left: { category: "finiteNumber", value: "42" },
  right: { category: "finiteNumber", value: "42" }
})

evaluateValueSemanticsOperation("compare", {
  left: { category: "negativeInfinity" },
  right: { category: "finiteNumber", value: "0" }
})

evaluateValueSemanticsOperation("isValue", {
  value: { category: "string", value: "active" }
})

evaluateValueSemanticsOperation("compare", {
  left: { category: "string", value: "éclair" },
  right: { category: "string", value: "zebre" }
}, {
  valueSemantics: createFrenchValueSemanticsProfile()
})
```

The supported operations are `equal`, `notEqual`, `compare`, and `isValue`. The supported minimum-profile categories are `finiteNumber`, `positiveInfinity`, `negativeInfinity`, `nan`, `string`, `boolean`, `toggle`, `encoding`, `separator`, `sansaAddress`, `referenceForm`, `temporal`, `lexicalStructuredScalar`, `explicitNull`, `explicitAbsence`, `missing`, `container`, and `bindingSet`.

The default exported profile, `aeonValueSemanticsDefaultProfile`, uses Unicode scalar-value string order and deterministic default Unicode case mapping. `createIntlValueSemanticsProfile(...)` creates an explicit Intl-backed string profile, and `createFrenchValueSemanticsProfile(...)` is a convenience profile for French collation and case mapping. Query evaluation accepts the same profile surface through `evaluateQuery(..., { valueSemantics })`.

`resolveAddress` accepts either an address string or a parsed `SansaAddress` and returns:

```js
{ ok: true, bindings, diagnostics }
{ ok: false, bindings: [], errors }
```

Parse errors are returned through the same `ok: false` shape. Normal no-match resolution returns `ok: true` with an empty `bindings` array.

Resolve distinguishes a **resolution miss** from a **resolution failure**. A miss occurs when a valid, supported selector applies to the namespace but finds no exposed structure on one or more branches; that branch contributes no bindings. A failure occurs when resolution cannot safely or validly continue, such as an unsupported selector capability, missing contextual root, forbidden boundary escape, implementation limit failure, or exact-expression multiplicity violation.

Resolve invariants:

- Selectors are applied left to right.
- Each selector consumes and produces an ordered Binding Set.
- Current bindings are processed in Binding Set order.
- Per-binding results are appended in deterministic local structural order.
- Resolve does not implicitly deduplicate bindings; repeated traversal routes may produce repeated binding occurrences.
- A supported selector that is structurally inapplicable to one input binding produces no bindings for that branch.
- Unsupported or forbidden operations fail explicitly.
- Every output binding is expected to retain a canonical address when the host adapter exposes one.
- An exact expression must not produce more than one binding; multiplicity violations fail with `SANSA_RESOLVE_EXACT_MULTIPLICITY_VIOLATION`.
- Resolve performs no value evaluation, predicate evaluation, projection, sorting, slicing, aggregation, or mutation.

Parent traversal defaults to the conservative structural model: traversal from the effective resolution root resolves to an empty Binding Set. The effective resolution root is the root binding established by `$`, `?`, or the root of a dynamic resolution context for the current branch. Callers that need stricter boundary diagnostics can pass:

```js
resolveAddress('?.^', namespace, {
  contextualRoot,
  failOnParentFromEffectiveRoot: true
})
```

This reports `SANSA_RESOLVE_BOUNDARY_ESCAPE_FORBIDDEN` instead of an empty Binding Set. Callers that forbid parent traversal entirely can pass:

```js
resolveAddress('$.items[0].^', namespace, {
  parentTraversal: 'forbid'
})
```

This reports `SANSA_RESOLVE_PARENT_TRAVERSAL_FORBIDDEN`, distinct from `SANSA_RESOLVE_UNSUPPORTED_PARENT`, which means the namespace adapter does not expose parent traversal.

Query evaluation diagnostics include query context when available:

```js
{
  code,
  message,
  phase,
  candidateAddress,
  extension,
  budget,
  limit,
  observed
}
```

`phase` is one of `parse`, `policy`, `from`, `where`, `order`, or `select`. `candidateAddress` is present when the failure occurs while evaluating a specific candidate binding. `extension` identifies disabled or unsupported extension surfaces. `budget`, `limit`, and `observed` identify budget exhaustion context.

## Command Line Tool

The package exposes `sansa-query` and the local `npm run query` script. The tool is intended for development fixtures and language exploration rather than host integration.

```bash
npm run query -- --query 'from $.inventory.items.* where .qty >= 2 select .sku'
npm run query -- --mode parse --format json --query 'from $.inventory.items.* select .sku'
npm run query -- --policy validation --query 'from $.inventory.items.* where .qty >= 4 select .sku'
npm run query -- --disable-transform --query 'from $.table.content.* select objectFrom($.table.header.*, .*)'
npm run query -- --params '{"source":{"type":"SansaAddressLiteral","address":"$.inventory.items[3]"},"field":{"type":"SansaAddressLiteral","address":"?.sku"}}' --query 'from path($.<"params">.source) select path($.<"params">.field)'
```

Evaluate-mode text output renders values in an AEON-like display form. Strings remain quoted, constructed objects render compactly, and explicit null bindings with a surfaced `nullReason` render as `!reason`, for example `!notSet`. JSON output is unchanged and remains the stable structured result envelope for tooling.

Options:

- `--query`, `-q`: query source
- `--query-file`: read query source from a file
- `--fixture`, `-f`: AEON or JSON namespace fixture, defaulting to `fixtures/query-inventory.json`
- `--fixture-kind`: force fixture kind as `aeon` or `json`; otherwise inferred from the file extension
- `--params`: JSON params mounted at `$.<"params">`
- `--params-file`: read JSON params from a file and mount them at `$.<"params">`
- `--mode`: `evaluate` or `parse`
- `--format`: `text` or `json`
- `--policy`: optional query policy, currently `validation`
- `--disable-transform`: disable experimental `SANSA.Transform` helpers during evaluation
- `--max-from-bindings`: fail if the from source resolves more than this many bindings
- `--max-where-candidates`: fail if where would evaluate more than this many candidates
- `--max-order-candidates`: fail if order by would sort more than this many candidates
- `--max-result-records`: fail if select would produce more than this many result records

The default CLI fixture is JSON so `sansa-query` can run without optional host integrations after package install. AEON fixtures are compiled with an optional AEON TypeScript Core runtime and adapted into a SANSA resolver namespace. JSON fixture bindings remain host-neutral objects. The built-in JSON adapter reads `root`, `children`, `attributeSpace` or `attributes`, `localSpaces`, and scalar values through `value` or `scalar`.

AEON fixture support is optional. The tool resolves AEON Core from `SANSA_AEON_CORE_MODULE`, from an installed `@altopelago/aeon-core` visible to the calling project, or from the sibling aeon-family development workspace path. JSON fixtures and Query parsing do not require AEON Core.

Params may be supplied either as a full local-space fixture binding with `children`, or as a simple object map. Structured SANSA Address Literal values use `{ "type": "SansaAddressLiteral", "address": "..." }`; these are preserved as `sansa` bindings so query expressions can activate them with `path(...)`.

The package also includes a browser workbench:

```bash
npm run query:web
```

The workbench serves [tools/query-web](../tools/query-web), defaults to `.aeon` source input, and exposes a local `/api/query` endpoint. For `.aeon` source, the endpoint uses the optional AEON TypeScript core compiler to derive a host-neutral SANSA resolver namespace before running SANSA.Query. A params editor mounts a small AEON source snippet as `$.<"params">`; top-level params bindings become children of that local address space. JSON fixture mode remains available for direct resolver-shape debugging. The browser UI includes a Normal/Validation policy toggle, a Transform extension toggle, and evaluation budget inputs. `/api/query` accepts `policy: "validation"`, `transformExtensions: false`, and `budget` for evaluate requests.

Workbench responses include `text` for successful results and diagnostics. Successful parse and evaluate responses also include `inspect`, a scan-friendly diagnostic view for the browser workbench. Text mode is intended for compact inspection, Inspect mode shows candidate/value metadata, and JSON mode exposes the structured result or diagnostic payload.

Workbench example queries are defined as grouped catalog data in [tools/query-web/examples.mjs](../tools/query-web/examples.mjs). The UI renders its example menu from that module, and tests use the same catalog to keep labels, queries, and expected behavior in sync.

## Address Model

```js
{
  type: "SansaAddress",
  root,
  selectors,
  qualifierExpression,
  isExact,
  canonical
}
```

`root.kind` is `absolute` for `$` or `contextual` for `?`.

`isExact` is true only when every selector is one of:

- `member`
- `position`
- `attributeSpace`
- `localSpace`

Parent traversal, position ranges, expansion selectors, filters, and name patterns make the address expression non-exact.

## Selector Nodes

```js
{ type: "member", name, quoted }
{ type: "position", index }
{ type: "positionRange", start, end }
{ type: "parent" }
{ type: "attributeSpace" }
{ type: "localSpace", name }
{ type: "directExpansion" }
{ type: "descendantExpansion" }
{ type: "namePattern", pattern }
{ type: "semanticTypeFilter", name }
{ type: "representationKindFilter", name }
```

Selector names and patterns are decoded string values. Renderers choose the shortest unambiguous canonical form.

## Resolve Namespace Adapter

Resolve is host-adapted. A namespace must expose a root binding:

```js
{
  root,
  contextualRoot?,
  children?(binding),
  parent?(binding),
  member?(binding, name),
  position?(binding, index),
  attributeSpace?(binding),
  localSpace?(binding, name),
  name?(binding),
  index?(binding),
  semanticType?(binding),
  representationKind?(binding),
  value?(binding),
  nullReason?(binding),
  semanticTypeMatches?(binding, expected),
  representationKindMatches?(binding, expected)
}
```

For simple hosts, bindings may expose fields directly:

```js
{
  address,
  name,
  index,
  semanticType,
  datatype,
  representationKind,
  kind,
  type,
  scalarKind,
  valueKind,
  literalKind,
  nullReason,
  value,
  scalar,
  children,
  parent,
  attributeSpace,
  attributes
}
```

`scalarKind`, `valueKind`, or `literalKind` may be used by host-neutral fixtures to preserve scalar forms that JSON cannot express directly, such as `nan`, `infinity`, and explicit `null`. `nullReason` carries the surfaced AEON null reason, such as `notSet` or `notApplicable`.

Exact member and position selectors select direct children. This implementation caps position indexes and position range endpoints at `999999`; SANSA v1 portability requires implementations to support at least one million addressable positions, expressed as indexes `0` through `999999` inclusive. Larger accepted values are implementation-defined and non-portable. Implementations that accept larger values should surface `SANSA_NON_PORTABLE_POSITION_INDEX` when their host API supports non-fatal diagnostics. Position ranges select inclusive positional children exposed by the host binding; open start means position `0`, open end means through the final exposed positional child, and reversed ranges resolve to an empty binding set. `.^` selects an exposed parent binding, resolves empty at the effective resolution root unless stricter policy is requested, and fails explicitly when parent traversal is unsupported or forbidden. `.*` returns direct children. `.**` returns descendants in deterministic preorder, excluding the current binding. Descendant expansion follows structural children only; it does not implicitly enter attribute or local address spaces. `.("pattern")` selects direct children whose binding name matches the complete glob pattern, where `?` matches one Unicode code point and `*` matches zero or more Unicode code points. Within the decoded pattern payload, `\?`, `\*`, and `\\` match literal question mark, asterisk, and backslash characters respectively. Pattern matching operates on the exact exposed binding name without normalization or locale-sensitive comparison.

`#name` filters the current binding set by semantic type. The default matcher accepts exact semantic type names and base names before `<...>` or `[...]`. `%name` filters the current binding set by representation kind.

`?` uses a binding supplied through `options.contextualRoot` or `namespace.contextualRoot`. Unlike `root`, `contextualRoot` is a binding value, not a callback. Hosts that need a dynamic contextual root should resolve it before calling `resolveAddress`. Attribute and local address-space traversal are explicit transitions through `.@` and `.<"name">`. They fail explicitly unless exposed by the namespace adapter or binding model. When local-space traversal is supported but a binding does not expose the named local space, normal resolution returns an empty binding set.

Qualifiers are preserved by the parser but ignored by generic structural resolution.

## Query Parser Model

```js
{
  type: "SansaQuery",
  from,
  where,
  orderBy,
  offset,
  limit,
  select,
  clauses,
  canonical
}
```

Query parsing validates query structure and expression syntax only. It does not evaluate query expressions, resolve candidate bindings, apply filters, sort bindings, slice results, or construct projection output.

The accepted clause order is:

```text
from
where
order by
offset
limit
select
```

`from` is required and must contain either one valid SANSA address expression or a `path(...)` source expression. `select` is required and terminal. `where`, `select`, and order-key expression bodies carry both a canonical source string and an expression AST. `order by` is split into top-level keys, each with an `asc` or `desc` direction; omitted directions canonicalize to `asc`. `offset` and `limit` accept non-negative integers without leading zeroes up to this implementation's query integer cap, `9007199254740991`.

Query comments are lexical trivia:

```text
// line comment
/* block comment */
```

Comments are removed from canonical query rendering.

Query clause nodes:

```js
{ type: "fromClause", source: "address", address }
{ type: "fromClause", source: "expression", expression, ast }
{ type: "whereClause", expression, ast }
{ type: "orderByClause", keys }
{ type: "offsetClause", value }
{ type: "limitClause", value }
{ type: "selectClause", expression, ast }
```

Order keys:

```js
{ type: "orderKey", expression, ast, direction }
```

## Query Expression Model

The expression parser produces a syntax AST only. It does not assign semantic meaning to functions, compare values, collapse Binding Sets, resolve addresses, or decide whether a query is authorized.

Expression nodes:

```js
{ type: "literalExpression", kind, value, canonical }
{ type: "resolutionExpression", scope, address, canonical }
{ type: "groupExpression", expression, canonical }
{ type: "unaryExpression", operator, argument, canonical }
{ type: "binaryExpression", operator, left, right, canonical }
{ type: "functionCallExpression", name, arguments, canonical }
{ type: "existenceExpression", operator, argument, canonical }
{ type: "cardinalityExpression", operator, argument, canonical }
{ type: "projectionExpression", fields, canonical }
```

Projection fields:

```js
{ type: "projectionField", name, expression }
```

Resolution expression scopes:

- `current`: a leading dot expression such as `.name`
- `absolute`: a leading `$` SANSA address
- `contextual`: a leading `?` SANSA address

Recognized expression syntax:

- resolution expressions: `.name`, `.roles.*`, `$.users.*`, `$.<"params">.username`
- literals: double-quoted strings, numbers, `true`, `false`
- comparisons and membership: `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`
- Boolean operators: `not`, `and`, `or`
- parenthesized groups
- cardinality operators: `any(...)`, `all(...)`, `none(...)`
- function-call shape: `contains(.name, "x")`
- projection shape: `{ name = .name status = .status }`

Operator precedence:

```text
parenthesized expression
not
comparison
and
or
```

## Query Evaluator

The evaluator is intentionally narrower than the query grammar. It exists to prove the parser, resolver, and expression model can execute together over host-neutral bindings.

Currently evaluated:

- `from` through SANSA Resolve or `path(...)` source activation
- `where` expressions that produce explicit Boolean values
- `order by` over string and number scalar keys
- `offset`
- `limit`
- `select` expressions
- scalar literals
- resolution expressions
- comparisons between same-type scalar values
- membership over Binding Sets with `in`
- Boolean `not`, `and`, `or`
- existence predicates over resolution expressions: `exists`, `absent`
- cardinality predicates over resolved binding sets: `any`, `all`, `none`
- built-in string functions: `contains`, `startsWith`, `endsWith`, `lower`, `upper`, `concat`
- dynamic address activation in expression positions with `path`
- missing-aware fallback with `fallback`
- dynamic direct-child resolution over addressable containers with `resolveChild`
- experimental transform-library object construction with `objectFrom`
- experimental transform-library field projection with `fieldsFrom`
- built-in value predicates: `isValue`, `isNull`, `isNullReason`, `isNaN`, `isInfinity`
- projection expressions

Boolean context accepts explicit Boolean scalar values and single resolved bindings that expose a Boolean scalar. It does not apply host-language truthiness to strings, numbers, nulls, objects, or Binding Sets. Boolean `not` evaluates its operand in Boolean context and returns the negated value. Boolean `and` and `or` short-circuit from left to right. `a and b` does not evaluate `b` when `a` is false; `a or b` does not evaluate `b` when `a` is true.

Membership uses comparison-style syntax but explicitly consumes the right operand as a Binding Set:

```text
where "admin" in .roles.*
```

The left operand is consumed in scalar context. Right-side bindings are evaluated in Binding Set order. Each right-side binding is consumed as a scalar and compared using equality comparison rules. Membership returns true on the first successful match and does not evaluate later bindings. Empty Binding Sets and fully evaluated non-matching sets evaluate to false. Membership does not skip incompatible bindings before a match: explicit null, NaN, missing scalar, cardinality, and mixed-type comparison failures surface as diagnostics. The right operand must evaluate to a Binding Set; string containment remains the `contains(...)` function.

Existence predicates inspect binding presence rather than scalar value:

```text
exists(.email) == true when .email resolves one or more bindings
absent(.email) == true when .email resolves zero bindings
```

Use semantic or representation filters inside the existence operand to guard later scalar comparisons:

```text
where exists(.id#number) and .id > 2
```

Without the `#number` filter, `.id > 2` may fail on a present non-number binding.

Missing bindings, explicit null values, and special numeric values are distinct:

```text
absent(.status) == true when .status resolves zero bindings
isValue(.status) == true when .status resolves one concrete value binding
isNull(.status) == true when .status resolves one explicit null binding
isNullReason(.status, "notSet") == true when the null reason matches
isNaN(.metric) == true when the scalar is explicit NaN
isInfinity(.limit) == true when the scalar is positive or negative infinity
```

`isValue(...)` is a missing-aware concrete-value guard. It returns true when its operand evaluates to one concrete value, including finite numbers, infinities, strings, Booleans, lexical structured scalars, SANSA address literals, legal reference forms, and containers. It may inspect scalar expressions directly or consume a Binding Set produced by resolution or `path(...)`. It returns false for zero bindings, explicit null, explicit absence values, and NaN. More than one binding remains a cardinality error.

`isNull(...)`, `isNullReason(...)`, `isNaN(...)`, and `isInfinity(...)` consume their first operand in single-binding scalar context. A missing operand therefore fails unless the query guards it with `exists(...)` or another missing-aware operator.

`NaN` is not comparable. Scalar comparison and ordering over `NaN` fail with `SANSA_QUERY_EVALUATE_INVALID_COMPARISON`; use `isNaN(...)` for explicit tests. Infinity values remain numeric bounds and may participate in same-type numeric comparisons and ordering.

Current comparison policy:

| Operands | Equality | Ordering | Result |
| --- | --- | --- | --- |
| number and number | allowed | allowed | numeric comparison |
| string and string | allowed | allowed | Unicode scalar-value ordering |
| boolean and boolean | allowed | error | ordering emits `SANSA_QUERY_EVALUATE_INVALID_COMPARISON` |
| explicit null | error | error | use `isNull(...)` / `isNullReason(...)` |
| NaN | error | error | use `isNaN(...)` |
| infinity and number | allowed | allowed | numeric bound comparison |
| mixed types | error | error | no implicit coercion |

By default, this implementation slice compares strings by Unicode scalar value. It must not use host locale, process locale, database collation, or `localeCompare`-style host defaults unless the caller explicitly supplies a value-semantics profile such as `createFrenchValueSemanticsProfile()`.

Ordinary value-producing functions evaluate their arguments before invocation. Resolution-expression arguments are consumed in single-binding scalar context:

| Argument outcome | Diagnostic |
| --- | --- |
| zero bindings | `SANSA_QUERY_EVALUATE_MISSING_SCALAR` |
| multiple bindings | `SANSA_QUERY_EVALUATE_CARDINALITY` |
| unsupported scalar type | `SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL` |

The current built-in string functions are `contains`, `startsWith`, `endsWith`, `lower`, `upper`, and `concat`. Function-name matching is case-sensitive. They require string arguments and reject explicit null, NaN, infinity, Boolean, number, object, and Binding Set arguments unless a future function contract explicitly accepts one of those forms. Value predicates such as `isValue(...)`, `isNull(...)`, `isNullReason(...)`, `isNaN(...)`, and `isInfinity(...)` define their own argument contracts.

`path(value)` is a function-like structural operator. Its operand is consumed in scalar context and must be a structured SANSA Address Literal value. The initial representation is an object such as `{ type: "SansaAddressLiteral", address: "?.sku" }` or `{ type: "SansaAddressLiteral", address: parsedAddress }`. Plain strings are rejected and are not parsed as address syntax. In expression positions such as `select`, `where`, and `order by`, the activated address resolves in the current candidate context and returns a Binding Set. In `from path(...)`, the activated address supplies the source Binding Set for the query.

`fallback(primary, replacement)` is a function-like operator with lazy missing handling. The primary operand is consumed in scalar value context. If it resolves zero bindings, or raises a missing-scalar diagnostic, the replacement operand is evaluated and consumed in the same scalar value context. If the primary operand succeeds, the replacement operand is not evaluated. Explicit null values, cardinality errors, type errors, comparison errors, and unsupported-function errors do not trigger fallback.

`resolveChild(base, key)` is a function-like structural operator with a distinct argument contract. The base argument must be a resolution expression resolving exactly one addressable container. The key argument is consumed in scalar context; string keys select a direct member of the base, and non-negative integer keys select a direct positional child. A missing target returns an empty Binding Set. Multiple base bindings, multiple key bindings, unsupported key types, and multiple target bindings fail with diagnostics. It does not parse traversal strings, scan collections, or perform join semantics.

`objectFrom(keys, values)` is an experimental transform-library helper with a distinct argument contract. Both arguments must be resolution expressions. The key and value Binding Sets must have equal length. Key bindings must expose unique string scalar values. Value bindings must expose scalar values. The helper pairs keys and values by resolved order and returns one derived object. Mismatched lengths, duplicate keys, non-string keys, and non-scalar values fail with diagnostics. It is not part of the required SANSA.Query v1 core surface.

`fieldsFrom(keys, values, field, ...)` is an experimental transform-library helper. It uses the same ordered pairing model as `objectFrom`, then returns only the requested string-named fields. It is implemented for workbench and conformance experimentation, but is not part of the required SANSA.Query v1 core surface.

Cardinality predicates follow conventional quantified logic:

```text
any(empty)  = false
all(empty)  = true
none(empty) = true
```

`all(...)` therefore means every resolved binding satisfies the predicate; it does not by itself require that at least one binding exists. A non-empty all-match condition is expressed by combining `any(...)` and `all(...)`:

```text
where any(.roles.* == "admin") and all(.roles.* == "admin")
```

`only(...)` may parse as a generic function-call expression, but it is not part of the current evaluator surface. It is reserved as a possible future shorthand for the non-empty all-match pattern and currently evaluates as `SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION`.

## Query Recipes

Recipes are non-normative examples that exercise multiple query features together. They are useful as implementation and workbench smoke tests.

Dynamic address literals can parameterize source, predicate, ordering, and projection:

```text
from path($.<"params">.source)
where isValue(path($.<"params">.statusField)) and path($.<"params">.statusField) == "active"
order by path($.<"params">.sortField) asc
select path($.<"params">.field)
```

`isValue(...)`, `exists(...)`, and explicit null predicates can distinguish ordinary values, explicit nulls, and missing bindings:

```text
from $.inventory.items.*
where isValue(.status) or (exists(.status) and isNull(.status))
select { sku = .sku status = fallback(.status, "missing") }
```

`resolveChild(...)` and `fallback(...)` can compose inside projections:

```text
from $.inventory.items.*
where .qty >= 4
select { sku = .sku category = resolveChild($.inventory.categoryLabels, .category) status = fallback(.status, "missing") }
```

Experimental `SANSA.Transform` helpers can construct row-shaped objects from table-like positional data. `objectFrom(...)` pairs all fields:

```text
from $.table.content.*
select objectFrom($.table.header.*, .*)
```

`fieldsFrom(...)` selects a subset of row-shaped fields:

```text
from $.table.content.*
select fieldsFrom($.table.header.*, .*, "age")
```

Currently rejected with explicit diagnostics:

- unsupported function names
- invalid built-in function arity or argument types
- cardinality expressions that do not contain a supported binding-set predicate
- cross-type comparisons
- missing scalar values in scalar context
- multiple bindings in scalar context

Query results:

```js
{
  type: "queryResult",
  address,
  candidateAddress,
  valueAddress,
  kind,
  binding,
  value
}
```

`address` is a backwards-compatible alias for `candidateAddress`. `candidateAddress` is optional and records the canonical source address of the candidate binding when the namespace exposes one. It is the address selected by `from`, after `where`, ordering, and slicing.

`valueAddress` is present only when projection preserves one existing selected binding identity. For example, `from $.items.* select .sku` can carry `candidateAddress = $.items[0]` and `valueAddress = $.items[0].sku`. If the selected value is a multi-binding Binding Set, each binding retains its own address inside the value instead of collapsing to one `valueAddress`.

`kind` is `binding` when the selected value is a Binding Set that preserves existing namespace binding identity. `valueAddress` is still present only for the single-binding case. `kind` is `derived` for constructed objects and scalar function results. Derived values do not become addressable namespace bindings.

Query values:

```js
{ type: "scalar", value }
{ type: "bindingSet", bindings }
{ type: "object", value }
```

Bindings expose scalar values through `namespace.value(binding)`, `binding.value`, or `binding.scalar`.

The evaluator does not execute host-supplied functions. Function support is limited to the built-ins listed above.

## Qualifier Model

```js
{
  type: "QualifierExpression",
  terms: [QualifierTerm]
}
```

```js
{
  type: "QualifierTerm",
  name,
  parameters,
  parameterGroups,
  arguments
}
```

Arguments are either:

```js
{ kind: "token", value }
{ kind: "quoted", value }
```

Top-level qualifier unions are represented by multiple `terms`. Nested qualifier unions inside generic parameters are rejected.

Qualifier terms may contain zero or more parameter groups and zero or more argument groups:

```text
name<parameter,parameter><parameter>[argument][argument]
```

`parameters` is a flattened convenience view. `parameterGroups` preserves how the term should render. Repeated parameter and argument groups allow host embeddings to avoid raw comma where comma would conflict with the host parser.

## Canonical Rendering

Canonical rendering:

- preserves `$` and `?` root kind
- renders identifier-safe members as `.name`
- renders other member names as `.["..."]`
- renders parent traversal as `.^`
- renders local spaces as `.<"...">`
- renders name patterns as `.("...")`
- renders quoted payload escapes using AEON double-quoted string escape forms
- renders qualifier unions without spaces, for example `number|nan`
- renders qualifier parameters without spaces, for example `list<string>`
- preserves repeated qualifier parameter groups, for example `tuple<x><y>`
- renders quoted qualifier arguments when the argument was parsed as quoted

## Current Error Codes

- `SANSA_EMPTY_ADDRESS`
- `SANSA_EXPECTED_ROOT`
- `SANSA_EXPECTED_TOKEN`
- `SANSA_EXPECTED_IDENTIFIER`
- `SANSA_EXPECTED_INDEX`
- `SANSA_EXPECTED_QUALIFIER`
- `SANSA_EXPECTED_QUALIFIER_ARGUMENT`
- `SANSA_UNEXPECTED_CHARACTER`
- `SANSA_UNEXPECTED_WHITESPACE`
- `SANSA_TRAILING_INPUT`
- `SANSA_EMPTY_MEMBER_NAME`
- `SANSA_EMPTY_LOCAL_SPACE_NAME`
- `SANSA_LEADING_ZERO_INDEX`
- `SANSA_POSITION_INDEX_LIMIT_EXCEEDED`
- `SANSA_INVALID_QUALIFIER`
- `SANSA_INVALID_QUALIFIER_ARGUMENT`
- `SANSA_INVALID_QUALIFIER_ARGUMENT_CHAR`
- `SANSA_RAW_NEWLINE_IN_QUOTED_PAYLOAD`
- `SANSA_UNTERMINATED_QUOTED_PAYLOAD`
- `SANSA_UNTERMINATED_ESCAPE`
- `SANSA_INVALID_ESCAPE`
- `SANSA_UNTERMINATED_UNICODE_ESCAPE`
- `SANSA_INVALID_UNICODE_ESCAPE`
- `SANSA_INVALID_UNICODE_SCALAR`
- `SANSA_QUERY_EMPTY`
- `SANSA_QUERY_EXPECTED_FROM`
- `SANSA_QUERY_EXPECTED_SELECT`
- `SANSA_QUERY_SELECT_MUST_BE_TERMINAL`
- `SANSA_QUERY_DUPLICATE_CLAUSE`
- `SANSA_QUERY_INVALID_CLAUSE_ORDER`
- `SANSA_QUERY_UNTERMINATED_BLOCK_COMMENT`
- `SANSA_QUERY_EXPECTED_FROM_ADDRESS`
- `SANSA_QUERY_INVALID_FROM_ADDRESS`
- `SANSA_QUERY_INVALID_FROM_SOURCE`
- `SANSA_QUERY_EXPECTED_WHERE_EXPRESSION`
- `SANSA_QUERY_EXPECTED_SELECT_EXPRESSION`
- `SANSA_QUERY_EXPECTED_ORDER_EXPRESSION`
- `SANSA_QUERY_INVALID_OFFSET`
- `SANSA_QUERY_INVALID_LIMIT`
- `SANSA_QUERY_EXPECTED_EXPRESSION`
- `SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN`
- `SANSA_QUERY_UNTERMINATED_EXPRESSION`
- `SANSA_QUERY_INVALID_NUMBER_LITERAL`
- `SANSA_QUERY_INVALID_RESOLUTION_EXPRESSION`
- `SANSA_QUERY_INVALID_FUNCTION_CALL`
- `SANSA_QUERY_INVALID_PROJECTION`

## Current Query Evaluate Error Codes

Evaluation diagnostics may also include context fields such as `phase`, `candidateAddress`, `extension`, `budget`, `limit`, and `observed`. These fields are context, not distinct error categories.

- `SANSA_QUERY_POLICY_VIOLATION`
- `SANSA_QUERY_BUDGET_EXCEEDED`
- `SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION`
- `SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION`
- `SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL`
- `SANSA_QUERY_EVALUATE_UNSUPPORTED_EXPRESSION`
- `SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN`
- `SANSA_QUERY_EVALUATE_EXPECTED_SCALAR`
- `SANSA_QUERY_EVALUATE_MISSING_SCALAR`
- `SANSA_QUERY_EVALUATE_CARDINALITY`
- `SANSA_QUERY_EVALUATE_INVALID_COMPARISON`
- `SANSA_QUERY_EVALUATE_INVALID_FROM_SOURCE`
- `SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL`
- `SANSA_QUERY_EVALUATE_INVALID_EXISTENCE_ARGUMENT`
- `SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT`

## Current Resolve Error Codes

- `SANSA_RESOLVE_EXPECTED_NAMESPACE`
- `SANSA_RESOLVE_MISSING_ROOT`
- `SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT`
- `SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE`
- `SANSA_RESOLVE_UNSUPPORTED_LOCAL_SPACE`
- `SANSA_RESOLVE_UNSUPPORTED_PARENT`
- `SANSA_RESOLVE_PARENT_TRAVERSAL_FORBIDDEN`
- `SANSA_RESOLVE_BOUNDARY_ESCAPE_FORBIDDEN`
- `SANSA_RESOLVE_EXACT_MULTIPLICITY_VIOLATION`
- `SANSA_RESOLVE_UNSUPPORTED_SELECTOR`
