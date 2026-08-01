# Experimental SANSA Mutate Policy Plan Filter

SANSA.Mutate describes requested changes. A mutation policy authorizes and
constrains those changes before a host adapter applies them.

This layer is intentionally outside the conservative Mutate core:

- SANSA Address identifies mutation targets.
- SANSA Resolve binds those targets to host-exposed bindings.
- SANSA Query and Instruction may help select or lower mutation intent.
- SANSA Mutate builds an exact-target mutation plan.
- Mutation Policy decides whether that plan is allowed.
- The host adapter applies allowed operations.

The document being mutated must not define the authority rules for its own
mutation. Policies are supplied by a trusted consumer, host, ASP layer,
application, or adapter boundary. An externally selected AEOS schema or
validator may determine whether the proposed state is legal, but it does not
authorize the mutation.

Policy authorizes or denies already planned intent. It must not silently rewrite
the plan, reinterpret runtime strings as SANSA Instruction source, or make
schema-invalid values valid. If a policy wants a different operation, the
consumer should request and plan that operation explicitly.

Unsupported policy fields are invalid rather than ignored. This keeps attempted
future behavior, such as `rewrite`, and claimed provenance, such as `by`, from
being mistaken for active authority.

## Workbench Prototype

The Mutate Workbench includes an experimental JSON policy plan filter advertised
as `sansa.mutate.policy.planFilter`. When enabled, the workbench runs mutation
planning first, then evaluates the planned operations against the policy. Denied
plans are not applied.

The browser example catalog includes policy-boundary examples for an allowed
quantity replacement, a default-deny create failure, and an explicit-deny SKU
replacement failure. Selecting one of those examples enables the Policy tab and
loads the policy JSON used by the test case.

In the current workbench pipeline, policy runs after Instruction parsing,
lowering, and SANSA.Mutate planning, and before target-surface validation or
apply. That ordering keeps policy decisions over exact planned operations while
still allowing a denied plan to avoid later target rendering work. Other
consumers may choose a different post-plan ordering for policy and
target-surface checks, but both checks remain outside Instruction source and
before apply.

The current prototype shape is deliberately small:

```json
{
  "default": "deny",
  "rules": [
    {
      "allow": true,
      "operations": ["replace"],
      "target": "$.inventory.items.*.qty",
      "datatypes": ["number", "int32"]
    },
    {
      "allow": true,
      "operations": ["create"],
      "parent": "$.inventory.items.*",
      "names": ["status"],
      "datatype": "string",
      "values": ["pending", "active"]
    }
  ]
}
```

`default` is either `"deny"` or `"allow"`. Each rule must explicitly declare
`"allow": true` or `"allow": false`. Rules are evaluated in order. A matching
rule with `"allow": false` denies the operation. A matching rule with
`"allow": true` allows it. If no rule matches, `default` decides.

## Rule Fields

The prototype supports these rule fields:

- `operations` or `operation`: allowed operation name or names.
- `target`: SANSA selector matched against `replace` and `remove` targets.
- `parent`: SANSA selector matched against `create` parents.
- `container`: SANSA selector matched against `insert` and `move` containers.
- `source`: SANSA selector matched against `move` sources.
- `anchor`: SANSA selector matched against `before` / `after` placement anchors.
- `names` or `name`: allowed create names.
- `datatypes` or `datatype`: allowed effective datatype.
- `kinds` or `kind`: allowed effective representation kind.
- `values` or `value`: allowed supplied value payload.

Address matchers are SANSA address expressions, so list/item matching uses
`.*`, not `[*]`.
They are parsed and resolved as addresses rather than compared as raw strings:
quoted member selectors such as `$.inventory.["display tags"]` and escaped
quoted selectors such as `$.inventory.["quote\"key"]` match the corresponding
planned canonical address roles after resolution.
An `anchor` matcher only matches operations whose placement has a resolved
`before` or `after` anchor. It does not match `first` or `last` placements.

For `replace`, effective datatype and kind fall back to the current target
binding metadata when the mutation request does not provide explicit hints. For
`create` and `insert`, they fall back to the supplied JSON value family.

## Diagnostics

Policy failures use workbench diagnostics with `phase: "policy"`:

```text
SANSA_MUTATE_POLICY_DENIED [policy] operation 0: Mutation policy has no allow rule for create
SANSA_MUTATE_POLICY_INVALID [policy] rule 0 (field by, scope rule): Mutation policy rule field 'by' is not supported
```

Invalid policy documents fail before authorization:

- `SANSA_MUTATE_POLICY_INVALID_JSON`
- `SANSA_MUTATE_POLICY_INVALID`
- `SANSA_MUTATE_POLICY_INVALID_ADDRESS`

The response may include `operationIndex` and `ruleIndex` to identify the
affected operation or rule. Invalid policy shape may also include
`policyField`, `policyScope`, and `policyAddress` so tools can highlight the
failing top-level field, rule field, matcher role, or unsupported matcher
address. Unsupported top-level policy fields and unsupported rule fields are
reported as invalid policy input.

The experimental `npm run cts:mutate` lane includes policy plan-filter cases for
allowed and denied rules, singular and plural matcher aliases, selector address
matchers, unsupported fields, invalid address matchers, and claimed provenance
that must not become policy authority.

## Open Design Questions

This prototype does not yet define the full policy language. Open questions
include:

- whether policy belongs in AEOS, a standalone SANSA profile, or both;
- whether rules should support reusable named schemas;
- how deep container-shape validation should be expressed;
- how reference following should be requested without mutating the referenced
  value;
- how profiles should define domain-specific datatype compatibility.

The current goal is to test the boundary: mutation plans are valid or invalid
according to SANSA.Mutate, then authorized or denied according to a trusted
policy layer.
