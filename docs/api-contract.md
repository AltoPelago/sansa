# SANSA Address Parser API Contract

Status: initial implementation contract for the Stage 2 parser/model and Stage 3 resolve slices.

The parser validates SANSA address syntax and returns a structural model. The resolver applies the parsed selector model to a host-supplied namespace adapter. The package does not evaluate queries, inspect host values directly, check authorization, or assign semantics to qualifiers.

## Entry Points

```js
parseAddress(input, options?)
parseAddressOrThrow(input, options?)
resolveAddress(input, namespace, options?)
renderAddress(address)
renderQualifierExpression(expression)
renderQualifierTerm(term)
```

`parseAddress` returns a discriminated result:

```js
{ ok: true, address }
{ ok: false, errors: [{ code, message, index }] }
```

`parseAddressOrThrow` returns `address` or throws `SansaParseError`.

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

Exact member and position selectors select direct children. `.*` returns direct children. `.**` returns descendants, excluding the current binding. `.("pattern")` selects direct children whose binding name matches the complete glob pattern, where `?` matches one character and `*` matches zero or more characters.

`#name` filters the current binding set by semantic type. The default matcher accepts exact semantic type names and base names before `<...>` or `[...]`. `%name` filters the current binding set by representation kind.

`?` uses `options.contextualRoot` or `namespace.contextualRoot`. Attribute and local address-space traversal fail explicitly unless exposed by the namespace adapter or binding model.

Qualifiers are preserved by the parser but ignored by generic structural resolution.

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

## Current Resolve Error Codes

- `SANSA_RESOLVE_EXPECTED_NAMESPACE`
- `SANSA_RESOLVE_MISSING_ROOT`
- `SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT`
- `SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE`
- `SANSA_RESOLVE_UNSUPPORTED_LOCAL_SPACE`
- `SANSA_RESOLVE_UNSUPPORTED_SELECTOR`
