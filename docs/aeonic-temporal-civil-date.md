# Aeonic civil-date operations

Unreleased JavaScript APIs consume immutable civil-date snapshot 0.1. Relations
(`equal`, `compare`, `relate`) and Calendar (`shift`, `step`, `materialize`) are
independently complete capabilities sharing exact date bundles. Select
`aeonic.operations.temporal.civil-date.v1` explicitly through context or policy.
Dates use the proleptic Gregorian calendar within years 0001–9999.

```js
import {
  evaluateAeonicTemporal as evaluate,
  AEONIC_TEMPORAL_CIVIL_DATE_PROFILE as profile,
} from '@altopelago/sansa';
const context = { profile };
const first = evaluate({ operation: 'shift', input: {
  value: { temporal: { category: 'civilDate', value: '2024-02' } },
  context, policy: { unit: 'month', count: '1' },
} });
if (first.outcome === 'value') {
  // Precise coverage is March 1–29; the complete bundle carries origin/history.
  const second = evaluate({ operation: 'shift', input: {
    value: first.value, context, policy: { unit: 'month', count: '1' },
  } });
  // Exact coverage is April 1–29, without silently adding March 30–31.
}
```

`evaluateAeonicTemporal(request, options)` admits structured JSON with logical
byte/depth bounds. `evaluateAeonicTemporalText(text, options)` takes verbatim
scalar JSON, retaining duplicate keys and malformed numeric token widths for
staged validation. Authored dates are `YYYY-`, `YYYY-MM`, or `YYYY-MM-DD`.

An authored bundle has `temporal: {category: 'civilDate', value: '2024-03'}`;
its optional origin defaults to authored granularity and history to
`none-declared`. Derived bundles require both `originGranularity` (day/month/year/
undeclared) and `history` (none-declared/clamping-declared):

```js
const dates = {
  temporal: { category: 'civilDateSet', ranges: [
    { start: '2024-03-01', end: '2024-03-29' },
  ] },
  originGranularity: 'month', history: 'none-declared',
};
```

Derived ranges must be nonempty, sorted, inclusive full-date ranges, disjoint
and nonadjacent. Their precise coverage is authoritative for chaining. Origin
is descriptive; it does not turn a partial range into a whole period.

## Explicit operations

- `shift` requires `unit` (day/month/year/eom/eoy) and canonical signed whole-number
  text `count`. Ordinary month/year shifts preserve the day where possible and
  clamp once at the target. EOM/EOY preserve distance from period end and clamp
  at the target period's start. One two-month shift can differ from two one-month
  shifts. Current clamping is separate from sticky prior clamping history.
- `step` requires `granularity` (day/month/year) and `count`. Input must exactly
  cover one complete selected period. Stepping February as a month gives all of
  March; a derived March 1–29 cannot step as a month.
- `materialize` requires `granularity` and succeeds only for one complete matching
  day/month/year. It returns an authored-date descriptor together with origin
  and history. A containing-period display cannot substitute for exact output.
- `equal` compares exact covered date sets and returns `|equal|` or `|notEqual|`.
- `compare` returns `|before|` or `|after|` only when all dates of one set precede
  all dates of the other, `|equal|` for identical sets, and `|indeterminate|`
  otherwise. It supplies no total sorting order.
- `relate` returns `|equal|`, `|contains|`, `|containedBy|`, `|overlaps|`, or
  `|disjoint|`; containment is strict. A year contains one of its days but the
  two sets are not equal. Relation results are symbols and cannot feed date
  operations. Relation metadata retains separate left/right histories.

Diagnostics contain no value. Configuration/operand/availability and resource
precedence follow the frozen contract. Domain overflow rejects the entire result,
including when only part of the source set would remain in range. No automatic
null value, Boolean predicate, rounding or lossy materialization is introduced.

## Limits and verification

Trusted `options.resourceLimits` selects nonnegative safe integers for eight
independent per-operation dimensions: request bytes/depth, input ranges, count
characters, output ranges, calendar work, emitted text and successful-envelope
bytes. `options.capabilities` may restrict the provider to `['relations']` or
`['calendar']`; its default exposes both. Claim selection and provider capability
are distinct. Limits never return partial or widened values.

```sh
npm run cts:aeonic-temporal
npm run cts:aeonic-temporal -- --capability-set relations
npm run cts:aeonic-temporal -- --capability-set calendar
npm run cts:aeonic-temporal:capacity
node scripts/validate-cts-claims.mjs --claims conformance/aeonic-temporal-claims.json
```

Set `AEONITE_CTS_ROOT` to the CTS `cts/` directory and
`AEONITE_TEMPORAL_SPECS_ROOT` (or `AEONITE_SPECS_ROOT`) to the specs repository;
explicit driver flags take precedence. `PYTHON` selects the Python 3.9+ shared
runner executable. The driver selects frozen snapshot 0.1 explicitly. `--cts`
may select a different manifest for investigation; such a run does not replace
the claimed snapshot. The [claim](../conformance/aeonic-temporal-claims.json)
pins exact specification/CTS/implementation fingerprints and actual reports.
Combined execution passes 296 calls/310 assertions; independently restricted
Relations passes 171/185 and Calendar 125/125. All 18 independent default-capacity
probes pass. Selected dimensions/companions do not promise their Cartesian
product, whole-chain budgets or machine-time/heap limits. Native getters/proxies,
key enumeration and complete STDIO framing remain separate host boundaries.

## Playground and ownership

Open **Arithmetic & civil dates** from `npm run playground`, then choose
**Civil dates · snapshot 0.1**. Twelve examples run the local source API in a
browser worker. Continuations copy complete date bundles and require explicit
shift/step/materialization. The live description follows edited request JSON;
starting-example prose remains separately labeled. Symbols and diagnostics have
no date continuation. Numerical convenience output policies are unavailable
for temporal operations. Existing worker input/output/time guards still apply.

The engine, CTS adapter, default-capacity probes and starting examples adapt
MIT-licensed Aeonic commit `627219ac90fdd09d17bfd0a3c25db717305d1d0f`. Imports and
public names follow SANSA conventions; bounded UTF-8 counting replaces Node
Buffer calls so the engine runs in browser workers. Existing strict JSON/token
helpers are reused. Normative source and CTS ownership remain in `aeonite-org`.
Query's older temporal completion-set APIs, Rust, clocks/timezones/WTC/database
resolution and package publication retain their separate capability boundaries.
