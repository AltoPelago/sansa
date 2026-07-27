# Experimental SANSA Mutate Policy

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
mutation. Policies are supplied by a trusted consumer, host, AEOS profile,
application, or adapter boundary.

Policy authorizes or denies already planned intent. It must not silently rewrite
the plan, reinterpret runtime strings as SANSA Instruction source, or make
schema-invalid values valid. If a policy wants a different operation, the
consumer should request and plan that operation explicitly.

## Workbench Prototype

The Mutate Workbench includes an experimental JSON policy gate. When enabled,
the workbench runs mutation planning first, then evaluates the planned
operations against the policy. Denied plans are not applied.

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

`default` is either `"deny"` or `"allow"`. Rules are evaluated in order. A
matching rule with `"allow": false` denies the operation. A matching rule with
`"allow": true` allows it. If no rule matches, `default` decides.

## Rule Fields

The prototype supports these rule fields:

- `operations` or `operation`: allowed operation name or names.
- `target`: SANSA selector matched against `replace` and `remove` targets.
- `parent`: SANSA selector matched against `create` parents.
- `container`: SANSA selector matched against `insert` and `move` containers.
- `source`: SANSA selector matched against `move` sources.
- `names` or `name`: allowed create names.
- `datatypes` or `datatype`: allowed effective datatype.
- `kinds` or `kind`: allowed effective representation kind.
- `values` or `value`: allowed supplied value payload.

Address matchers are SANSA address expressions, so list/item matching uses
`.*`, not `[*]`.

For `replace`, effective datatype and kind fall back to the current target
binding metadata when the mutation request does not provide explicit hints. For
`create` and `insert`, they fall back to the supplied JSON value family.

## Diagnostics

Policy failures use workbench diagnostics with `phase: "policy"`:

```text
SANSA_MUTATE_POLICY_DENIED [policy] operation 0: Mutation policy has no allow rule for create
```

Invalid policy documents fail before authorization:

- `SANSA_MUTATE_POLICY_INVALID_JSON`
- `SANSA_MUTATE_POLICY_INVALID`
- `SANSA_MUTATE_POLICY_INVALID_ADDRESS`

The response may include `operationIndex` and `ruleIndex` to identify the
affected operation or rule.

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
