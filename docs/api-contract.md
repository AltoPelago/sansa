# SANSA Parser API Contract

Status: initial implementation contract for the Stage 2 parser/model, Stage 3 resolve, Stage 4 query clause parser/model, Stage 5 query expression parser/model, and Stage 6 query evaluator scaffold slices.

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
  children,
  attributeSpace,
  attributes
}
```

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
- comparisons: `==`, `!=`, `<`, `<=`, `>`, `>=`
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
- Boolean `not`, `and`, `or`
- cardinality predicates over resolved binding sets: `any`, `all`, `none`
- projection expressions

Currently rejected with explicit diagnostics:

- function-call expressions
- cardinality expressions that do not contain a supported binding-set predicate
- cross-type comparisons
- missing scalar values in scalar context
- multiple bindings in scalar context

Query results:

```js
{
  type: "queryResult",
  binding,
  value
}
```

Query values:

```js
{ type: "scalar", value }
{ type: "bindingSet", bindings }
{ type: "object", value }
```

Bindings expose scalar values through `namespace.value(binding)`, `binding.value`, or `binding.scalar`.

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

- `SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION`
- `SANSA_QUERY_EVALUATE_UNSUPPORTED_EXPRESSION`
- `SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN`
- `SANSA_QUERY_EVALUATE_EXPECTED_SCALAR`
- `SANSA_QUERY_EVALUATE_MISSING_SCALAR`
- `SANSA_QUERY_EVALUATE_CARDINALITY`
- `SANSA_QUERY_EVALUATE_INVALID_COMPARISON`
- `SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT`

## Current Resolve Error Codes

- `SANSA_RESOLVE_EXPECTED_NAMESPACE`
- `SANSA_RESOLVE_MISSING_ROOT`
- `SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT`
- `SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE`
- `SANSA_RESOLVE_UNSUPPORTED_LOCAL_SPACE`
- `SANSA_RESOLVE_UNSUPPORTED_SELECTOR`
