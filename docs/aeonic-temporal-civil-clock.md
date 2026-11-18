# Aeonic standalone civil clocks

The unreleased JavaScript/TypeScript API implements immutable civil-clock
snapshot 0.1. Select `aeonic.operations.temporal.civil-clock.v1` explicitly through
policy or context. Relations (`equal`, `compare`, `relate`) and Arithmetic
(`shiftClock`, `step`, `materialize`) are independently complete capabilities.

```js
import { evaluateAeonicCivilClock, AEONIC_TEMPORAL_CIVIL_CLOCK_PROFILE as profile }
  from '@altopelago/sansa';

const moved = evaluateAeonicCivilClock({ operation: 'shiftClock', input: {
  context: { profile },
  value: { temporal: { category: 'civilClock', value: '23:30:00' } },
  amount: { number: { category: 'finiteNumber', value: '7200' } },
} });
// moved.value.temporal.pieces[0].at: { day: '1', time: '01:30:00' }

if (moved.outcome === 'value') {
  const output = evaluateAeonicCivilClock({ operation: 'materialize', input: {
    context: { profile }, value: moved.value, policy: { clockForm: 'second' },
  } });
  // unrepresentable_result: a bare clock cannot discard day +1.
}
```

Reuse the entire returned `value` bundle for chaining. Authored `HH:`, `HH:MM`
and `HH:MM:SS[.fraction]` have reference day `0`, with no calendar date. Hour and
minute forms cover complete half-open intervals; second forms identify exact
coordinates. Relative days participate in equality, so day +1 at 01:30 differs
from authored day-zero 01:30. Negative coordinates use mathematical floor:
midnight minus 0.5 seconds is day -1 at 23:59:59.5.

Derived bundles contain `temporal: {category:'civilClockSet', pieces:[...]}`,
`originClockForm` and `history`. A point is `{kind:'point', at:{day:'1',
time:'01:30:00'}}`; an interval has `start`, `end`, `includeStart` and `includeEnd`.
Coordinates use canonical integer day text and full clock text, trimming trailing
fractional zeroes. Nonempty sets must be sorted without overlaps, redundant
points or mergeable neighbors. Gaps and excluded boundaries stay exact; a single
interval can span days without enumerating them.

`shiftClock` accepts exact finite-decimal seconds as an authored Number or a
normalized derived decimal bundle. Nonterminating rational amounts require
explicit quantization first. `step` requires an entire selected hour/minute/second
form and a canonical signed integer-text `count`. `materialize` requires an
explicit `clockForm`, exact coverage and a starting day of zero; the last hour
can end at excluded day +1 midnight. Neither operation wraps away carry.

Relations return symbols for exact equality, whole-set chronology or set
containment/overlap/disjointness. Clock-origin metadata is descriptive; history
is a sticky `none-declared` or `approximation-declared` marker. Previously rounded
amounts propagate that marker even when the current shift is exact or zero.
No clamping field or measurement interval is inferred. Diagnostics produce no
value; bare clock text cannot preserve separate origin/history metadata.

`evaluateAeonicCivilClockText` takes verbatim logical JSON, retaining duplicate-key
and raw-number evidence. The native API takes JSON caller data. Trusted options
contain `resourceLimits` and/or `capabilities` (`relations`, `arithmetic` or both).
Malformed trusted options throw host errors; logical failures return staged
diagnostics. The exported `AEONIC_TEMPORAL_CIVIL_CLOCK_DEFAULT_RESOURCE_LIMITS`
contains all sixteen defaults. Separate limits cover request bytes/depth, text,
input/intermediate/output pieces, work, precision, day digits, numerical dimensions,
output characters and successful result bytes. Limits never trigger rounding,
clipping, partial values or automatic error-to-value conversion.

Native JSON graph admission bounds shared-subtree unfolding and rejects cycles.
Arbitrary accessors/proxies/subclasses, eager key enumeration, outer STDIO
framing, OS heap/process/disk and whole-chain budgets remain host concerns.
The 34 isolated native-default capacity probes use recorded companion limits;
they do not guarantee their Cartesian product or a general memory sandbox.

```sh
npm run cts:aeonic-clock
npm run cts:aeonic-clock -- --capability-set relations
npm run cts:aeonic-clock -- --capability-set arithmetic
npm run cts:aeonic-clock:capacity
```

Matching CTS/specification roots and Python JSON Schema dependencies are required.
`AEONITE_CTS_ROOT` points to the CTS `cts/` directory;
`AEONITE_CLOCK_SPECS_ROOT` (or the generic `AEONITE_SPECS_ROOT`) selects specs.
The driver also accepts `--cts-root`, `--specs-root`, `--cts` and `--report`.
Selecting one capability also restricts the provider to that complete group.
Current pins/reports are in `conformance/aeonic-clock-claims.json`.

The **Civil clocks** value-playground lane runs the actual source API in a browser
worker. Nine examples cover carry/borrow, cross-midnight intervals, stepping,
materialization, day-sensitive equality, containment and approximation history.
Descriptions follow edited inputs. Continuations clone the complete bundle;
symbols and diagnostics cannot be reused as clocks. A 256 KiB input limit,
4-second timeout and 1 MiB result limit are application controls separate from
semantic operation allowances. Browser preparation/display and worker termination
are application concerns, not whole-process memory guarantees.

Adapted from the MIT-licensed Aeonic engine at
`8cb31dd3beb44d758ed27c02600b5b4c858fc2a1`, with local imports, SANSA public names
and a bounded scalar UTF-8 counter for browser compatibility. This adds no Query
invocation, Rust port, date anchoring, timezone/WTC/leap resolution, elapsed-time
authority, package release or website deployment. Existing temporal/numerical
profiles keep their meanings and defaults.
