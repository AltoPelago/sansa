# Civil date anchoring

`evaluateAeonicCivilAnchor` and `evaluateAeonicCivilAnchorText` implement the
complete `Aeonic.Operations.Temporal.CivilAnchor` capability against immutable
snapshot 0.1. Select `aeonic.operations.temporal.civil-anchor.v1` explicitly through
policy or a reusable context. These standalone JavaScript/TypeScript APIs do not
change Query temporal predicates or Rust behavior.

```js
import { evaluateAeonicCivilAnchor, evaluateAeonicCivilDateTime } from '@altopelago/sansa';

const anchored = evaluateAeonicCivilAnchor({
  operation: 'anchor',
  input: {
    anchor: { temporal: { category: 'civilDate', value: '2024-02-28' } },
    clock: {
      temporal: { category: 'civilClockSet', pieces: [
        { kind: 'point', at: { day: '1', time: '01:30:00' } },
      ] },
      originClockForm: 'second', history: 'approximation-declared',
    },
    context: { profile: 'aeonic.operations.temporal.civil-anchor.v1' },
  },
});
// anchored.value.temporal.pieces[0].at === '2024-02-29T01:30:00'
if (anchored.outcome === 'value') {
  const next = evaluateAeonicCivilDateTime({
    operation: 'shiftClock',
    input: {
      value: anchored.value,
      amount: { number: { category: 'finiteNumber', value: '0.2' } },
      context: { profile: 'aeonic.operations.temporal.civil-datetime.v1' },
    },
  });
  // Exact 2024-02-29T01:30:00.2 retains the declared approximation history.
}
```

The anchor accepts an authored full date or a canonical derived date bundle
covering exactly one day. Coverage determines eligibility; original granularity
is history. Valid month/year anchors return `incompatible_operand`. Clocks accept
authored hour/minute/second forms or canonical nonempty exact point/interval sets.
Signed relative-day carry, arbitrary admitted finite fractional precision,
endpoint membership and gaps are preserved. A 100-day continuous interval stays
one interval. The result is an existing complete `civilDateTimeSet` bundle for
direct chaining under the receiving operation's explicitly selected profile.

Date origin and clamping history come from the anchor; clock origin and declared
approximation history come from the clock. The current operation is exact for
policy and applies no new clamping. Years remain 0001–9999. An exact excluded end
at the start of year 10000 uses the existing end-of-domain marker. Any covered
coordinate outside the domain rejects the whole operation without a partial value.

The native entry accepts JSON-shaped data. The text entry preserves duplicate-key
and raw numerical evidence. Trusted options accept `resourceLimits` and only the
complete `capabilities: ['anchoring']` selection. Eleven independent allowances
match the frozen contract. Work is anchor-range count plus clock-piece count;
intermediate candidates and successful output pieces each count clock pieces.
Work/candidate guards precede single-day eligibility; result-domain checks precede
output limits. Malformed trusted limits throw harness errors. Logical failures
return diagnostic reason/stage/path and never create values.

The Value operations playground includes **Date anchoring**, authored and derived
examples, dynamic descriptions, and explicit **Anchor this clock**, **Use as
anchor date** and **Shift as date-time** actions. Each prepares a request for
review without running automatically. Complete bundles retain both histories and
origins. The browser worker runs this checkout's source API.

`npm run cts:aeonic-anchor` defaults to frozen snapshot 0.1; `--cts-root`,
`--specs-root` and `--report` follow the existing drivers. Environment overrides
are `AEONITE_CTS_ROOT` (the CTS `cts` directory), `AEONITE_ANCHOR_SPECS_ROOT` and
fallback `AEONITE_SPECS_ROOT`; `PYTHON` selects the runner interpreter. An explicit
`--cts` can select mutable next, whose reports cannot make a stable snapshot claim.

[Claim and evidence](../conformance/aeonic-anchor-claims.json) retain all 234 genuine
case executions and complete assertions. `npm run cts:aeonic-anchor:capacity`
separately runs 26 native admission probes isolating all eleven defaults with
recorded companions. Admitted controls can reach later eligibility/domain
diagnostics; this evidence does not imply all admitted inputs produce values.

The implementation adapts MIT-licensed Aeonic at
`4efb42be227c1b1cd458a53155cebd51ffcc0154`: local imports/public names and bounded
UTF-8 counting for browser workers are the adaptations. Previous engines,
selectors, defaults and Query predicates retain their meanings. Native graph
walks reject cycles and bound shared expansion by logical admission; eager key
inventory, accessors/proxies/subclasses, outer framing, browser preparation,
heap/disk, combined capacity and chain budgets remain separate host concerns.
Timezone/WTC, leap/UTC realization, elapsed-time authority and release publication
are outside this source implementation claim.
