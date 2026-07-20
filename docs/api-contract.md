# SANSA Parser API Contract

Status: initial implementation contract for the Stage 2 parser/model, Stage 3 resolve, Stage 4 query clause parser/model, Stage 5 query expression parser/model, Stage 6 query evaluator scaffold, and standalone query tool slices.

The parser validates SANSA address syntax and returns a structural model. The resolver applies the parsed selector model to a host-supplied namespace adapter. The query parser validates the SANSA.Query clause and expression surfaces and returns structural models. The query evaluator scaffold applies a restricted query subset over host-exposed binding metadata. The package does not inspect host values directly, check authorization, or assign semantics to qualifiers.

## Entry Points

```js
parseAddress(input, options?)
parseAddressOrThrow(input, options?)
parseQuery(input, options?)
parseQueryOrThrow(input, options?)
parseQueryExpression(input, options?)
parseQueryExpressionOrThrow(input, options?)
evaluateQuery(input, namespace, options?)
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

`resolveAddress` accepts either an address string or a parsed `SansaAddress` and returns:

```js
{ ok: true, bindings, diagnostics }
{ ok: false, bindings: [], errors }
```

Parse errors are returned through the same `ok: false` shape. Normal no-match resolution returns `ok: true` with an empty `bindings` array.

Query evaluation diagnostics include query context when available:

```js
{
  code,
  message,
  phase,
  candidateAddress
}
```

`phase` is one of `parse`, `from`, `where`, `order`, or `select`. `candidateAddress` is present when the failure occurs while evaluating a specific candidate binding.

## Command Line Tool

The package exposes `sansa-query` and the local `npm run query` script. The tool is intended for development fixtures and language exploration rather than host integration.

```bash
npm run query -- --query 'from $.inventory.items.* where .qty >= 2 select .sku'
npm run query -- --mode parse --format json --query 'from $.inventory.items.* select .sku'
```

Evaluate-mode text output renders values in an AEON-like display form. Strings remain quoted, constructed objects render compactly, and explicit null bindings with a surfaced `nullReason` render as `!reason`, for example `!notSet`. JSON output is unchanged and remains the stable structured result envelope for tooling.

Options:

- `--query`, `-q`: query source
- `--query-file`: read query source from a file
- `--fixture`, `-f`: JSON namespace fixture, defaulting to `fixtures/query-inventory.json`
- `--mode`: `evaluate` or `parse`
- `--format`: `text` or `json`

Fixture bindings are host-neutral objects. The built-in adapter reads `root`, `children`, `attributeSpace` or `attributes`, `localSpaces`, and scalar values through `value` or `scalar`.

The package also includes a browser workbench:

```bash
npm run query:web
```

The workbench serves [tools/query-web](../tools/query-web), defaults to `.aeon` source input, and exposes a local `/api/query` endpoint. For `.aeon` source, the endpoint uses the AEON TypeScript core compiler to derive a host-neutral SANSA resolver namespace before running SANSA.Query. JSON fixture mode remains available for direct resolver-shape debugging.

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

Expansion selectors, filters, and name patterns make the address expression non-exact.

## Selector Nodes

```js
{ type: "member", name, quoted }
{ type: "position", index }
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
  attributeSpace,
  attributes
}
```

`scalarKind`, `valueKind`, or `literalKind` may be used by host-neutral fixtures to preserve scalar forms that JSON cannot express directly, such as `nan`, `infinity`, and explicit `null`. `nullReason` carries the surfaced AEON null reason, such as `notSet` or `notApplicable`.

Exact member and position selectors select direct children. `.*` returns direct children. `.**` returns descendants in deterministic preorder, excluding the current binding. Descendant expansion follows structural children only; it does not implicitly enter attribute or local address spaces. `.("pattern")` selects direct children whose binding name matches the complete glob pattern, where `?` matches one character and `*` matches zero or more characters.

`#name` filters the current binding set by semantic type. The default matcher accepts exact semantic type names and base names before `<...>` or `[...]`. `%name` filters the current binding set by representation kind.

`?` uses `options.contextualRoot` or `namespace.contextualRoot`. Attribute and local address-space traversal are explicit transitions through `.@` and `.<"name">`. They fail explicitly unless exposed by the namespace adapter or binding model. When local-space traversal is supported but a binding does not expose the named local space, normal resolution returns an empty binding set.

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

`from` is required and must contain one valid SANSA address expression. `select` is required and terminal. `where`, `select`, and order-key expression bodies carry both a canonical source string and an expression AST. `order by` is split into top-level keys, each with an `asc` or `desc` direction; omitted directions canonicalize to `asc`. `offset` and `limit` accept non-negative integers without leading zeroes.

Query comments are lexical trivia:

```text
// line comment
/* block comment */
```

Comments are removed from canonical query rendering.

Query clause nodes:

```js
{ type: "fromClause", address }
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

## Query Evaluator Scaffold

The evaluator scaffold is intentionally narrower than the query grammar. It exists to prove the parser, resolver, and expression model can execute together over host-neutral bindings.

Currently evaluated:

- `from` through SANSA Resolve
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
- built-in string functions: `contains`, `startsWith`, `lower`, `concat`
- missing-aware fallback with `fallback`
- lookup over addressable containers with `lookup`
- built-in value predicates: `isNull`, `isNullReason`, `isNaN`, `isInfinity`
- projection expressions

Boolean context accepts explicit Boolean scalar values and single resolved bindings that expose a Boolean scalar. It does not apply host-language truthiness to strings, numbers, nulls, objects, or Binding Sets. Boolean `not` evaluates its operand in Boolean context and returns the negated value. Boolean `and` and `or` short-circuit from left to right. `a and b` does not evaluate `b` when `a` is false; `a or b` does not evaluate `b` when `a` is true.

Membership uses comparison-style syntax but explicitly consumes the right operand as a Binding Set:

```text
where "admin" in .roles.*
```

The left operand is consumed in scalar context. Each right-side binding is consumed as a scalar and compared using equality comparison rules. Empty Binding Sets and non-matching sets evaluate to false. Membership does not skip incompatible bindings: explicit null, NaN, missing scalar, cardinality, and mixed-type comparison failures surface as diagnostics. The right operand must evaluate to a Binding Set; string containment remains the `contains(...)` function.

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
isNull(.status) == true when .status resolves one explicit null binding
isNullReason(.status, "notSet") == true when the null reason matches
isNaN(.metric) == true when the scalar is explicit NaN
isInfinity(.limit) == true when the scalar is positive or negative infinity
```

`isNull(...)`, `isNullReason(...)`, `isNaN(...)`, and `isInfinity(...)` consume their first operand in single-binding scalar context. A missing operand therefore fails unless the query guards it with `exists(...)` or another missing-aware operator.

`NaN` is not comparable. Scalar comparison and ordering over `NaN` fail with `SANSA_QUERY_EVALUATE_INVALID_COMPARISON`; use `isNaN(...)` for explicit tests. Infinity values remain numeric bounds and may participate in same-type numeric comparisons and ordering.

Current comparison policy:

| Operands | Equality | Ordering | Result |
| --- | --- | --- | --- |
| number and number | allowed | allowed | numeric comparison |
| string and string | allowed | allowed | string comparison |
| boolean and boolean | allowed | error | ordering emits `SANSA_QUERY_EVALUATE_INVALID_COMPARISON` |
| explicit null | error | error | use `isNull(...)` / `isNullReason(...)` |
| NaN | error | error | use `isNaN(...)` |
| infinity and number | allowed | allowed | numeric bound comparison |
| mixed types | error | error | no implicit coercion |

Ordinary value-producing functions evaluate their arguments before invocation. Resolution-expression arguments are consumed in single-binding scalar context:

| Argument outcome | Diagnostic |
| --- | --- |
| zero bindings | `SANSA_QUERY_EVALUATE_MISSING_SCALAR` |
| multiple bindings | `SANSA_QUERY_EVALUATE_CARDINALITY` |
| unsupported scalar type | `SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL` |

The current built-in string functions require string arguments. They reject explicit null, NaN, infinity, Boolean, number, object, and Binding Set arguments unless a future function contract explicitly accepts one of those forms. Special value predicates such as `isNull(...)`, `isNullReason(...)`, `isNaN(...)`, and `isInfinity(...)` define their own argument contracts.

`fallback(primary, replacement)` is a function-like operator with lazy missing handling. The primary operand is consumed in scalar value context. If it resolves zero bindings, or raises a missing-scalar diagnostic, the replacement operand is evaluated and consumed in the same scalar value context. If the primary operand succeeds, the replacement operand is not evaluated. Explicit null values, cardinality errors, type errors, comparison errors, and unsupported-function errors do not trigger fallback.

`lookup(base, key)` is a function-like operator with a distinct argument contract. The base argument must be a resolution expression resolving exactly one binding. The key argument is consumed in scalar context; string keys select a direct member of the base, and non-negative integer keys select a direct positional child. A missing lookup target returns an empty Binding Set. Multiple base bindings, multiple key bindings, unsupported key types, and multiple target bindings fail with diagnostics.

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

`only(...)` is not currently recognized by the parser or evaluator. It is reserved as a possible future shorthand for the non-empty all-match pattern.

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
  binding,
  value
}
```

`address` is optional and records the canonical source address of the candidate binding when the namespace exposes one. It is the address selected by `from`, after `where`, ordering, and slicing. Projection output remains in `value`; a `select` expression that resolves other addresses returns those selected bindings inside a `bindingSet` value.

Query values:

```js
{ type: "scalar", value }
{ type: "bindingSet", bindings }
{ type: "object", value }
```

Bindings expose scalar values through `namespace.value(binding)`, `binding.value`, or `binding.scalar`.

The evaluator scaffold does not execute host-supplied functions. Function support is limited to the built-ins listed above.

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

Evaluation diagnostics may also include `phase` and `candidateAddress` fields. These fields are context, not distinct error categories.

- `SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION`
- `SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL`
- `SANSA_QUERY_EVALUATE_UNSUPPORTED_EXPRESSION`
- `SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN`
- `SANSA_QUERY_EVALUATE_EXPECTED_SCALAR`
- `SANSA_QUERY_EVALUATE_MISSING_SCALAR`
- `SANSA_QUERY_EVALUATE_CARDINALITY`
- `SANSA_QUERY_EVALUATE_INVALID_COMPARISON`
- `SANSA_QUERY_EVALUATE_INVALID_EXISTENCE_ARGUMENT`
- `SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT`

## Current Resolve Error Codes

- `SANSA_RESOLVE_EXPECTED_NAMESPACE`
- `SANSA_RESOLVE_MISSING_ROOT`
- `SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT`
- `SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE`
- `SANSA_RESOLVE_UNSUPPORTED_LOCAL_SPACE`
- `SANSA_RESOLVE_UNSUPPORTED_SELECTOR`
