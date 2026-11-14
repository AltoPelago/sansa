# Aeonic rational arithmetic

SANSA's unreleased JavaScript API implements the complete
`aeonic-rational-arithmetic-cts-v1-snapshot-0.2` capability. Select
`aeonic.operations.arithmetic.rational.v1` explicitly in context or operation
policy. Its six operations are `add`, `subtract`, `multiply`, `divide`,
`quantize` and `materialize`. Snapshot compatibility preserves the specification's
proposal lifecycle and does not publish a package.

```js
import {
  evaluateAeonicRationalArithmetic as evaluate,
  AEONIC_RATIONAL_ARITHMETIC_PROFILE as profile,
} from '@altopelago/sansa';
const number = value => ({ number: { category: 'finiteNumber', value } });
const context = { profile };
const third = evaluate({ operation: 'divide', input: {
  left: number('1'), right: number('3'), context,
} });
if (third.outcome === 'value') {
  // number: { category: 'exactRational', coefficient: '1', exponent: '0', denominator: '3' }
  const whole = evaluate({ operation: 'multiply', input: {
    left: third.value, right: number('3'), context,
  } });
  // whole is exact 1. A failed operation never supplies a value to chain.
}
```

All binary authored/derived pairings are supported. Derived rational values mean
`coefficient × 10^exponent / denominator`, using canonical integer text. The
positive denominator is reduced and coprime to ten; factors of two and five move
into the decimal part. One sixth is coefficient `5`, exponent `-1`, denominator
`3`. Finite results use the normalized `exactNumber` pair. Derived bundles require
`history: 'none-declared'` or `'approximation-declared'`; authored finite Number
bundles may omit history. These are internal mathematical values, not AEON
fraction literals. Authored Number spellings remain preserved at ingress.

Quantization requires a positive normalized finite increment and one explicit
mode: `half-even`, `half-away-from-zero`, `half-toward-zero`, `toward-zero`,
`away-from-zero`, `floor` or `ceiling`. The grid is integer multiples of that
increment through zero. Half-even is also known as bankers' rounding; it uses the
parity of the grid multiplier. No mode is supplied by the evaluator implicitly.

A changed quantized value reports `rounded-for-operands` and sets history to
`approximation-declared`. Unchanged quantization reports `exact-for-operands` and
preserves history. Subsequent exact calculations and cancellation to zero retain
any declared approximation. History is never inferred from spelling.

Materialization requires an explicit `integer`, `decimal` or `exponent` family
and preserves the value exactly. A fractional integer output or nonterminating
rational produces `unrepresentable_result`; quantize explicitly when desired.
Rational exponent materialization uses one leading mantissa digit, such as
`1.25e-1`. The separately pinned finite API retains its own rendering rules.
Calculated zero is unsigned; `zeroSign: 'negative'` selects negative-zero output.
Both zero/zero and nonzero/zero return `division_by_zero`. All diagnostics are
fail-closed and carry reason, stage and operation-local JSON pointer, without a
value. NaN, infinity, coercion, schema validation and Query expression syntax are
outside this capability.

## Ingress and capacities

`evaluateAeonicRationalArithmetic(request, options)` applies structured JSON byte
and depth admission. `evaluateAeonicRationalArithmeticText(requestText, options)`
keeps the original JSON text, including duplicate-key and byte distinctions.
Both are browser-compatible and have no Node Buffer dependency. Unsupported
native objects, nonfinite host numbers, nonscalar text and invalid trusted options
throw API errors rather than manufacturing operation diagnostics.

`options.resourceLimits` accepts named nonnegative safe integers:

| Limit | Default |
| --- | ---: |
| `maxRequestBytes` | 16,384 logical UTF-8 bytes |
| `maxRequestDepth` | 32 |
| `maxNumericCharacters` | 1,024 per operand or increment |
| `maxCoefficientDigits` | 512 |
| `maxDenominatorDigits` | 512 |
| `maxExponentMagnitude` | 1,000,000 |
| `maxWorkspaceDigits` | 4,096 |
| `maxOutputCharacters` | 1,024 |

`AEONIC_RATIONAL_ARITHMETIC_DEFAULT_RESOURCE_LIMITS` is frozen. Cancellation,
least-common-denominator admission, and compact on-grid/sub-unit shortcuts follow
the owning snapshot. Each operation gets its own limits; applications manage
whole-chain budgets. Selected maxima do not promise their Cartesian product or
machine-time/memory bounds. Structured JSON aliases count expanded bytes; cycles
fail closed. Native object-key enumeration occurs before child serialization;
getters/proxies/custom subclasses are not an untrusted-object sandbox. Outer CTS
transport and trusted executable limits remain separate.

## Calculate and materialize together

```js
import { evaluateAeonicRationalArithmeticAndMaterialize } from '@altopelago/sansa';
const rounded = evaluateAeonicRationalArithmeticAndMaterialize({
  operation: 'divide', input: { left: number('1'), right: number('3'), context },
}, {
  family: 'decimal',
  quantize: {
    increment: { category: 'exactNumber', coefficient: '1', exponent: '-2' },
    rounding: 'half-even',
  },
});
// rounded.value.number.value === '0.33'; history === 'approximation-declared'.
```

The four convenience exports are `evaluateAeonicArithmeticAndMaterialize`,
`evaluateAeonicArithmeticAndMaterializeText`,
`evaluateAeonicRationalArithmeticAndMaterialize` and
`evaluateAeonicRationalArithmeticAndMaterializeText`. They compose the owning
finite/rational operations. A missing output object/own family is a `TypeError`.
Other output validation belongs to the operation reached. Rational quantization
runs only when its explicit `quantize` policy is present; finite output policies
reject that field. Profile defaults are not changed or retried after failure.

Success returns the final Number/history bundle and `metadata.steps`, each with
`step` and the original operation metadata. For rounded thirds the evaluations
are exact, rounded, exact. Failure stops immediately, adds `step` (calculation,
quantization or materialization) to the original diagnostic, and exposes no
partial value or successful-step metadata. Diagnostic stages/paths refer to that
step's logical request. Text variants forward the first calculation unchanged;
later requests use the native APIs, under the same options independently. The
finite native API has depth/operand/workspace guards rather than invented JSON
byte accounting. This application composition is separate from the closed frozen
operation result contract. Saving only a Number discards separate history unless
the application explicitly preserves it.

## Playground, conformance and provenance

Open the [arithmetic playground](../tools/playground/arithmetic.html) through
`npm run playground -- --aeon-root /path/to/built/aeon`, then choose **Arithmetic**.
Its eleven examples call SANSA's source text APIs in a fresh browser worker.
Continuations copy actual returned bundles; changing inputs or failures clears
reuse. Combined output configuration is a separate JSON editor. Original request
text and raw numerical policy tokens reach owning validation. The page bounds
request plus policy to 256 KiB, policy to 16 KiB/depth 8, results to 1 MiB and runs
to four seconds. Worker cancellation/timeouts are playground errors with no value,
not portable operation diagnostics. No trusted engine limit increases are exposed.
The launcher uses the existing built AEON checkout for Resolve/Query; arithmetic
itself imports only SANSA source. No Python runs in the browser.

Install the existing shared runner requirements, then use:

```sh
npm test
npm run cts:aeonic-rational-arithmetic
npm run cts:aeonic-rational-arithmetic:capacity
node scripts/validate-cts-claims.mjs --claims conformance/aeonic-rational-arithmetic-claims.json
```

The [claim](../conformance/aeonic-rational-arithmetic-claims.json) records the full
frozen target, explicit selected map, actual report and independent default-capacity
probes. The driver uses `AEONITE_CTS_ROOT` (CTS `cts` directory),
`AEONITE_SPECS_ROOT`, `PYTHON`, and unique `--cts-root`, `--cts`, `--specs-root`,
`--report` arguments. An explicitly selected mutable manifest cannot establish
this snapshot claim. CI pins specs `d4801c7e4814af1ef6e51951c0af3f3d429f04fb`
and CTS `2ee51c88ad944a0f1c0951d5e39b298561c00c35` on Node 20, 22 and 24,
with TypeScript 5.9.3 consumer checks. Comparison/finite snapshots retain separate
claims. Rust, historical Query semantics and package publication remain separate.

The MIT-licensed rational implementation, token-preserving binding and convenience
composition adapt Aeonic commit `64347f19181041f86135e958da5a16ecc4b60b57`.
Copyright (c) 2026 Patrik; see [LICENSE](../LICENSE). Adaptation renames the SANSA
entry points, reuses existing exact-number/strict-JSON/trusted-binding helpers,
copies scalar-key ordering locally and replaces Node byte counting with bounded
portable UTF-8 counting. Numerical recipes and frozen contract bytes remain in
the owning specification/CTS repositories.
