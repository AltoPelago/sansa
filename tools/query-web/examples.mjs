export const queryExampleGroups = [
  {
    label: 'Resolution',
    examples: [
      {
        name: 'directExpansion',
        label: 'Direct expansion',
        query: lines(
          'from $.inventory.items',
          'select .*',
        ),
        expected: {
          ok: true,
          count: 1,
          includes: '$.inventory.items[2]',
        },
      },
      {
        name: 'descendantStrings',
        label: 'Descendant #string',
        query: lines(
          'from $',
          'select $.inventory.items.**#string',
        ),
        expected: {
          ok: true,
          count: 1,
          includes: '$.inventory.items[0].roles[0] = "admin"',
        },
      },
      {
        name: 'descendantNumbers',
        label: 'Descendant %number',
        query: lines(
          'from $',
          'select $.inventory.items.**%number',
        ),
        expected: {
          ok: true,
          count: 1,
          includes: '$.inventory.items[2].qty = 8',
        },
      },
      {
        name: 'namePattern',
        label: 'Name pattern',
        query: lines(
          'from $.inventory.items.*',
          'select .("s*")',
        ),
        expected: {
          ok: true,
          count: 4,
          includes: '$.inventory.items[1].sku = "B-200"',
        },
      },
    ],
  },
  {
    label: 'Attributes',
    examples: [
      {
        name: 'itemAttributes',
        label: 'Item attributes',
        query: lines(
          'from $.inventory.items.*',
          'where .@.lane == "primary"',
          'select { sku = .sku lane = .@.lane }',
        ),
        expected: {
          ok: true,
          count: 2,
          includes: '$.inventory.items[0] = {"sku":"A-100","lane":"primary"}',
        },
      },
      {
        name: 'fieldAttributes',
        label: 'Field attributes',
        query: lines(
          'from $.inventory.items.*',
          'where .sku.@.origin == "catalog"',
          'select { sku = .sku origin = .sku.@.origin }',
        ),
        expected: {
          ok: true,
          count: 3,
          includes: '$.inventory.items[3] = {"sku":"D-250","origin":"catalog"}',
        },
      },
    ],
  },
  {
    label: 'Predicates',
    examples: [
      {
        name: 'skuFilter',
        label: 'SKU contains B',
        query: lines(
          'from $.inventory.items.*',
          'where contains(.sku, "B")',
          'select .sku',
        ),
        expected: {
          ok: true,
          count: 1,
          includes: '$.inventory.items[1].sku = "B-200"',
        },
      },
      {
        name: 'adminRoles',
        label: 'Any admin role',
        query: lines(
          'from $.inventory.items.*',
          'where any(.roles.* == "admin")',
          'select { sku = .sku name = .name }',
        ),
        expected: {
          ok: true,
          count: 2,
          includes: '$.inventory.items[3] = {"sku":"D-250","name":"Driver"}',
        },
      },
      {
        name: 'roleMembership',
        label: 'Role membership',
        query: lines(
          'from $.inventory.items.*',
          'where "admin" in .roles.*',
          'select { sku = .sku name = .name }',
        ),
        expected: {
          ok: true,
          count: 2,
          includes: '$.inventory.items[3] = {"sku":"D-250","name":"Driver"}',
        },
      },
      {
        name: 'emptyRoles',
        label: 'Empty roles',
        query: lines(
          'from $.inventory.items.*',
          'where exists(.roles) and absent(.roles.*)',
          'select { sku = .sku name = .name }',
        ),
        expected: {
          ok: true,
          count: 1,
          includes: '$.inventory.items[2] = {"sku":"C-300","name":"Coupler"}',
        },
      },
      {
        name: 'numericIdGuard',
        label: 'Numeric id guard',
        query: lines(
          'from $.inventory.items.*',
          'where exists(.id#number) and .id > 2',
          'select { sku = .sku name = .name }',
        ),
        expected: {
          ok: true,
          count: 1,
          includes: '$.inventory.items[3] = {"sku":"D-250","name":"Driver"}',
        },
      },
      {
        name: 'nullReason',
        label: 'Null reason',
        query: lines(
          'from $.inventory.items.*',
          'where exists(.status) and isNullReason(.status, "notSet")',
          'select { sku = .sku name = .name }',
        ),
        expected: {
          ok: true,
          count: 1,
          includes: '$.inventory.items[0] = {"sku":"A-100","name":"Adapter"}',
        },
      },
      {
        name: 'numericSpecials',
        label: 'NaN or infinity',
        query: lines(
          'from $.inventory.items.*',
          'where (exists(.metric) and isNaN(.metric)) or (exists(.ceiling) and isInfinity(.ceiling))',
          'select { sku = .sku name = .name }',
        ),
        expected: {
          ok: true,
          count: 2,
          includes: '$.inventory.items[3] = {"sku":"D-250","name":"Driver"}',
        },
      },
      {
        name: 'missingStatus',
        label: 'Missing status',
        query: lines(
          'from $.inventory.items.*',
          'where not exists(.status)',
          'select { sku = .sku name = .name }',
        ),
        expected: {
          ok: true,
          count: 1,
          includes: '$.inventory.items[2] = {"sku":"C-300","name":"Coupler"}',
        },
      },
    ],
  },
  {
    label: 'Functions',
    examples: [
      {
        name: 'categoryLookup',
        label: 'Category lookup',
        query: lines(
          'from $.inventory.items.*',
          'where .qty >= 4',
          'select { sku = .sku category = lookup($.inventory.categoryLabels, .category) }',
        ),
        expected: {
          ok: true,
          count: 3,
          includes: '$.inventory.items[3] = {"sku":"D-250","category":"Tooling"}',
        },
      },
    ],
  },
  {
    label: 'Pipeline',
    examples: [
      {
        name: 'inactiveOrder',
        label: 'Inactive ordered by quantity',
        query: lines(
          'from $.inventory.items.*',
          'where .active == false',
          'order by .qty desc, .sku asc',
          'select { sku = .sku qty = .qty }',
        ),
        expected: {
          ok: true,
          count: 2,
          includes: '$.inventory.items[3] = {"sku":"D-250","qty":4}',
        },
      },
      {
        name: 'parseProjection',
        label: 'Projection parse check',
        query: lines(
          'from $.inventory.items.*',
          'where .qty >= 2',
          'select { sku = .sku active = .active }',
        ),
        expected: {
          ok: true,
          count: 3,
          includes: '$.inventory.items[1] = {"sku":"B-200","active":true}',
        },
      },
    ],
  },
  {
    label: 'Diagnostics',
    examples: [
      {
        name: 'diagnosticWhere',
        label: 'Where scalar error',
        query: lines(
          'from $.inventory.items.*',
          'where .sku',
          'select .sku',
        ),
        expected: {
          ok: false,
          code: 'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN',
          includes: 'SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN [where] at $.inventory.items[0]',
        },
      },
    ],
  },
];

export const queryExamples = Object.fromEntries(
  queryExampleGroups.flatMap((group) => group.examples.map((example) => [example.name, example])),
);

export function firstQueryExampleName() {
  return queryExampleGroups[0]?.examples[0]?.name ?? '';
}

function lines(...entries) {
  return entries.join('\n');
}
