const inventory = String.raw`inventory:object = {
  items:list<object> = [
    \item1\ = { sku = "A-100", name\name1\ = "Widget", qty = 12 }
    \item2\ = { sku = "B-200", name\name2\ = "Bracket", qty = 5 }
  ]
}`;
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
  query: {label: 'Query', source: inventory, address: '$.inventory.items', view: 'query', query: 'from $.inventory.items.*\nwhere .qty >= 6\nselect .name'},
  queryIdentity: {label: 'Query identity remains closed', source: inventory, address: '$.inventory.items', view: 'query', query: String.raw`from $.inventory.items.\item1\
select .name`},
};
window.SansaPlaygroundExamples = Object.fromEntries(Object.entries(examples).map(([key, value]) => [key, {
  mode: 'transport', view: 'resolve', scope: '$', inspections: 10000, query: '', addressKind: 'selector', ...value,
}]));
document.querySelector('[data-example-tabs]').innerHTML = Object.entries(examples).map(([key, value], i) =>
  `<button class="playground-example-tab${i === 0 ? ' is-active' : ''}" type="button" data-sansa-example-key="${key}" aria-pressed="${i === 0}">${value.label}</button>`).join('');
