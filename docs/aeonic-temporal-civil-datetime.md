# Aeonic civil date-time operations

The standalone JavaScript API implements immutable civil date-time snapshot 0.1.
Select `aeonic.operations.temporal.civil-datetime.v1` through policy or context;
operand shape never selects it automatically. Relations and Arithmetic are
independently complete capabilities. Existing Query temporal behavior is separate.

```js
import { evaluateAeonicCivilDateTime, AEONIC_TEMPORAL_CIVIL_DATETIME_PROFILE as profile } from '@altopelago/sansa';

const shifted = evaluateAeonicCivilDateTime({
  operation: 'shift',
  input: {
    value: { temporal: { category: 'civilDateTime', value: '2024-02T09:30' } },
    context: { profile },
    policy: { unit: 'month', count: '1' },
  },
});
// Exact daily minute intervals on March 1–29, preserving both origins/histories.
if (shifted.outcome === 'value') {
  const moved = evaluateAeonicCivilDateTime({
    operation: 'shiftClock',
    input: {
      value: shifted.value,
      context: { profile },
      amount: { number: { category: 'finiteNumber', value: '0.2' } },
    },
  });
}
```

`evaluateAeonicCivilDateTimeText(requestText, options)` accepts verbatim logical
JSON, retaining duplicate-key and raw-number evidence for validation. The native
API accepts JSON graphs; finite authored Number text and normalized exact-decimal
bundles can supply clock amounts, including results from numerical calculations.
Nonterminating rational amounts require explicit quantization first.

Authored values may have year/month/day date granularity and hour/minute/second
clock form. Hour and minute forms cover intervals with excluded upper endpoints;
second forms identify exact coordinates, including resource-bounded decimal
fractions. Reduced dates preserve all compatible dates. Seconds 60, timezone
suffixes, offsets and WTC contexts are outside this profile. Years are 0001–9999.

Derived `civilDateTimeSet` descriptors contain nonempty canonical `pieces`:
`{kind:'point', at:'2024-03-01T09:30:00'}` or
`{kind:'interval', start:..., end:..., includeStart:true, includeEnd:false}`.
Coordinates use canonical full unzoned date-time text, with trailing fractional
zeroes removed. Pieces are sorted without overlap, redundant points or mergeable
neighbors. A shared excluded boundary stays missing. The final excluded interval
end may be `{boundary:'endOfDomain'}`; it never admits year 10000 as a value.

Each derived bundle requires `originDateGranularity`, `originClockForm` and
`history: {clamping, approximation}`. Origins are descriptive and may be
`undeclared`; they do not widen coverage. History markers are independently
sticky. Current-operation clamping is separate, and every successful operation
is exact under its selected policy. Approximation history propagates from a
previously rounded clock amount without creating an uncertainty interval.

- `equal`, `compare` and `relate` return symbols. Chronology uses whole-set
  before/after/equal/indeterminate; exact set relations distinguish strict
  containment, overlap and disjointness, respecting excluded endpoints.
- `shift` uses a signed canonical whole-number `count` and explicit `unit`:
  day, month, year, EOM or EOY (`eom`/`eoy`). Calendar rules apply pointwise to
  dates while retaining clock subsets. A multi-unit shift clamps once.
- `shiftClock` adds exact signed finite-decimal civil-coordinate seconds. This
  ordinary civil clock has 24 hours per day and makes no elapsed-time claim.
- `step` requires complete coverage matching explicitly selected
  `dateGranularity` and `clockForm`, plus a whole-number `count`. Stepping the
  February month/minute form produces all of March; shifting February produces
  only March 1–29 in 2024.
- `materialize` requires both selectors and an exact extent match. It returns
  an authored representation with origins/history together. Partial March
  coverage cannot silently become a whole-March literal.

Diagnostics have no value. Preserve complete returned bundles for chaining;
saving only bare date-time text loses origins/history. Materialization never
implicitly approximates, widens or discards gaps.

Trusted options accept `resourceLimits` and `capabilities` (`relations` and/or
`arithmetic`). Malformed trusted configuration throws; logical request failures
return staged diagnostics. Default capacities are exported as
`AEONIC_TEMPORAL_CIVIL_DATETIME_DEFAULT_RESOURCE_LIMITS`. Admission separately
limits request bytes/depth, coordinate text, input/intermediate/output pieces,
work, fractional precision, counts, numeric dimensions, output text and result
bytes. Matching budgets guard complete-form eligibility checks. Each operation
has its own budget; applications manage entire chains.

Native support is for JSON caller data. Arbitrary accessors, proxies, custom
subclasses, eager key enumeration, outer STDIO framing and process/heap limits
remain host concerns. Selected capacity boundaries do not guarantee their
Cartesian product or a memory sandbox.

```sh
npm run cts:aeonic-datetime
npm run cts:aeonic-datetime -- --capability-set relations
npm run cts:aeonic-datetime -- --capability-set arithmetic
npm run cts:aeonic-datetime:capacity
node scripts/validate-cts-claims.mjs --claims conformance/aeonic-datetime-claims.json
```

For nonstandard checkout layouts, set `AEONITE_CTS_ROOT` to the CTS `cts/`
directory and `AEONITE_DATETIME_SPECS_ROOT` to the source repository, or use
`--cts-root`/`--specs-root`. The fallback source variable is `AEONITE_SPECS_ROOT`.
`--cts` explicitly overrides the manifest; it does not promote a mutable run
into the claimed snapshot. `PYTHON` chooses the shared runner interpreter.

CI pins specification `75b8dbd33ead7f5f9a90714981d80529a72ec339` and CTS
`7b1e229a08d86ab6fcc91e1724a4252339849e70`, verifies full and restricted
providers, and probes native capacities. The [claim](../conformance/aeonic-datetime-claims.json)
retains actual reports, limits and exact source/helper/implementation fingerprints.
The adapted engine originates at Aeonic
`a4b3391dc678d2cc441fe661cfa669bc969086b9` under MIT. Local imports/names and a
bounded scalar UTF-8 counter support browser workers; temporal semantics retain
the source behavior. Existing strict JSON/raw-number helpers are reused.

Run `npm run playground`, then open **Value operations → Civil date-times**.
Examples cover reduced precision, excluded endpoints, exact clock carry,
clamping gaps, complete-period stepping, materialization and both histories.
Descriptions follow edited JSON. Continuations copy full bundles and require
reviewing explicit policies before running. Worker input/output/time controls
are independent application limits. Query integration, Rust, timezone/WTC and
package publication remain separate.
