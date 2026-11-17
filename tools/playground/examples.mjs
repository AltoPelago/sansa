const inventory = String.raw`inventory:object = {
  items:list<object> = [
    \item1\ = { sku = "A-100", name\name1\ = "Widget", qty = 12 }
    \item2\ = { sku = "B-200", name\name2\ = "Bracket", qty = 5 }
  ]
}`;
const propertySource = String.raw`group = { "" = "empty", "a*" = "literal", "😀" = "Unicode" }
value = <widget("hello")>
plain = { tag = "widget" }
reading@{"" = "unit"} = 42`;
const examples = {
  identity: {label: 'Child identities', source: inventory, address: "$.inventory.items.\\item1\\.\\name1\\"},
  reordered: {label: 'Reordered list', source: String.raw`items = [
  \item2\ = { name = "Bracket" }
  \item1\ = { name = "Widget" }
]`, address: "$.items.\\item1\\.name"},
  children: {label: 'Scope children', source: String.raw`group\a\ = { nested\b\ = "world" }`, scope: '$.group', address: "$.\\b\\"},
  root: {label: 'Scope root is excluded', source: String.raw`group\a\ = { nested\b\ = "world" }`, scope: '$.group', address: "$.\\a\\"},
  missing: {label: 'Missing identity', source: inventory, address: "$.inventory.items.\\missing\\"},
  budget: {label: 'Inspection limit', source: inventory, inspections: 1, address: "$.inventory.items.\\item1\\"},
  exact: {label: 'Exact path', source: inventory, address: '$.inventory.items[0].sku'},
  expansion: {label: 'List expansion', source: inventory, address: '$.inventory.items.*.sku'},
  attributes: {label: 'Attribute identity', source: String.raw`reading@{unit\unit1\ = "cm"}:number = 42`, address: "$.reading.@.\\unit1\\"},
  propertyKey: {label: 'Property: empty key', source: propertySource, address: '$.group.*&key("")', expectedPaths: ['$.group.[""]']},
  propertyLiteral: {label: 'Property: literal key', source: propertySource, address: '$.group.*&key("a*")', expectedPaths: ['$.group.["a*"]']},
  propertyUnicode: {label: 'Property: Unicode key', source: propertySource, address: '$.group.*&key("😀")', expectedPaths: ['$.group.["😀"]']},
  propertyTag: {label: 'Property: node tag', source: propertySource, address: '$.*&key("value")&tag("widget")', expectedPaths: ['$.value']},
  propertyHead: {label: 'Property: direct head', source: propertySource, address: '$.value[0]&headTag("widget")', expectedPaths: ['$.value[0]']},
  propertyRecursive: {label: 'Property: recursive containers', source: propertySource, address: '$.**&tag("widget")', expectedPaths: ['$.value']},
  propertyRecursiveHeads: {label: 'Property: recursive heads', source: propertySource, address: '$.**&headTag("widget")', expectedPaths: ['$.value[0]']},
  propertyWrongKind: {label: 'Property: heads are not containers', source: propertySource, address: '$.value[0]&tag("widget")', expectedPaths: []},
  propertyNoField: {label: 'Property: fields are not tags', source: propertySource, address: '$.plain&tag("widget")', expectedPaths: []},
  propertyRoot: {label: 'Property: root key hidden', source: propertySource, scope: '$.value', address: '$&key("value")', expectedPaths: []},
  propertyRootTag: {label: 'Property: root tag', source: propertySource, scope: '$.value', address: '$&tag("widget")', expectedPaths: ['$.value']},
  propertyAttribute: {label: 'Property: attribute space', source: propertySource, address: '$.reading.@.*&key("")', expectedPaths: ['$.reading.@.[""]']},
  propertyBudget: {label: 'Property: inspection limit', source: propertySource, propertyInspections: 1, address: '$.value&tag("widget")', expectedCode: 'SANSA_RESOLVE_PROPERTY_LIMIT_EXCEEDED'},
  propertyQuery: {label: 'Property Query: not admitted', source: propertySource, address: '$', view: 'query', query: 'from $.*&key("value")\nselect .', expectedCode: 'SANSA_RESOLVE_UNSUPPORTED_SELECTOR'},
  query: {label: 'Query', source: inventory, address: '$.inventory.items', view: 'query', query: 'from $.inventory.items.*\nwhere .qty >= 6\nselect .name'},
  queryIdentity: {label: 'Query child identities', source: inventory, address: '$.inventory.items', view: 'query', query: "from $.inventory.items.\\item1\\\nselect .\\name1\\"},
};
window.SansaPlaygroundExamples = Object.fromEntries(Object.entries(examples).map(([key, value]) => [key, {
  mode: 'transport', view: 'resolve', scope: '$', inspections: 10000, propertyInspections: 10000, query: '', addressKind: 'selector', ...value,
}]));
document.querySelector('[data-example-tabs]').innerHTML = Object.entries(examples).map(([key, value], i) =>
  `<button class="playground-example-tab${i === 0 ? ' is-active' : ''}" type="button" data-sansa-example-key="${key}" aria-pressed="${i === 0}">${value.label}</button>`).join('');
