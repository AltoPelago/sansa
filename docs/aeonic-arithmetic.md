# Aeonic exact arithmetic

The unreleased JavaScript API implements the complete finite exact arithmetic
capability of `aeonic-arithmetic-cts-v1-snapshot-0.1`. Snapshot compatibility
does not publish a package or promote the specification's proposal lifecycle.

```js
import { evaluateAeonicArithmetic } from '@altopelago/sansa';

const number = value => ({ number: { category: 'finiteNumber', value } });
const sum = evaluateAeonicArithmetic({
  operation: 'add', input: { left: number('0.1'), right: number('0.2') },
});
if (sum.outcome === 'value') {
  // sum.value.number is { category: 'exactNumber', coefficient: '3', exponent: '-1' }
  const product = evaluateAeonicArithmetic({
    operation: 'multiply', input: { left: sum.value, right: number('10') },
  });
  if (product.outcome === 'value') {
    const output = evaluateAeonicArithmetic({
      operation: 'materialize',
      input: { value: product.value, policy: { family: 'decimal' } },
    });
    // Successful output.value.number is { category: 'finiteNumber', value: '3.0' }.
  }
}
```

`add`, `subtract` and `multiply` calculate exact normalized coefficient/exponent
text pairs. Materialization explicitly selects `integer`, `decimal` or
`exponent`; requesting an integer representation for a fractional value yields
`unrepresentable_result`. No rounding, automatic coercion, division, quantization,
infinity or NaN arithmetic is introduced. Authored Number spellings are preserved
at the operand boundary. All calculated zeros have one mathematical value;
materialization may explicitly select `zeroSign: 'negative'`.

Supply `history: 'approximation-declared'` when an input has declared prior
rounding/approximation. Arithmetic propagates the marker even through zero and
cancellation; it never infers history from spelling. Derived `exactNumber`
operands require explicit history, including `none-declared`. Every successful
result includes the reusable value/history bundle, current evaluation status
`exact-for-operands`, and complete effective policy. Saving a bare Number loses
the marker unless the application explicitly preserves that metadata.

Failures have `outcome: 'diagnostic'`, a reason, stage and JSON pointer, and no
value. Applications must check the outcome before chaining. Errors never
automatically produce null or other values. Recognized deferred domains return
`unsupported_domain`; unknown categories and malformed values fail validation.
The only supported semantic profile is `aeonic.operations.arithmetic.exact.v1`.
Policy/context overrides and unknown-field validation follow the frozen contract.

## Ingress and resource settings

`evaluateAeonicArithmetic(request, options)` accepts typed logical operands.
It checks graph depth/cycles without inventing JSON bytes for native input.
`evaluateAeonicArithmeticText(requestText, options)` accepts Unicode scalar JSON
text; byte/depth admission precedes JSON decoding and staged operand checks.
Duplicate decoded keys and non-JSON constants fail closed. Invalid host text
arguments and malformed trusted options throw `TypeError`.

The sole trusted option is `resourceLimits`, with named nonnegative safe integers:

| Limit | Default |
| --- | ---: |
| `maxRequestBytes` | 4,194,304 UTF-8 bytes at JSON ingress |
| `maxRequestDepth` | 32 nested containers |
| `maxNumericCharacters` | 65,536 scalars per operand's numerical text |
| `maxCoefficientDigits` | 65,536 digits, excluding a minus sign |
| `maxExponentMagnitude` | 1,000,000 |
| `maxWorkspaceDigits` | 131,072 |
| `maxOutputCharacters` | 65,536 emitted Number characters |

`AEONIC_ARITHMETIC_DEFAULT_RESOURCE_LIMITS` is frozen. Limits apply per operation;
applications manage whole-chain budgets. Compact exact-result and expanded output
capacities are distinct. These are explicit admission settings, not promises
about every Cartesian combination of maxima or host memory/time.

Native graph hardening is separate from logical JSON conformance. Cyclic graphs
fail closed; a reached depth/byte guard may preempt cycle detection. Structured
JSON ingress used by the CTS applies per-path depth and expanded JSON byte limits.
Bounded populated/sparse/shared graph and Unicode controls are implementation
evidence, not a guarantee about arbitrary getters, proxies or user iterators.
Portable UTF-8 counting avoids a whole-input encoding buffer; the public module
has no Node `Buffer` dependency.

## Conformance and provenance

Run the shared Python runner through SANSA's adapter:

```sh
python3 -m pip install -r ../../aeonite-org/aeonite-cts/runners/requirements-aeonic-operations.txt
npm test
npm run cts:aeonic-arithmetic
node scripts/validate-cts-claims.mjs --claims conformance/aeonic-arithmetic-claims.json
```

`AEONITE_CTS_ROOT` selects the CTS `cts` directory, `AEONITE_SPECS_ROOT` the
specification checkout, and `PYTHON` the runner executable. CLI flags `--cts-root`,
`--cts`, `--specs-root` and `--report` support explicit paths. The runtime itself
has no Python or private-package dependency. The default manifest is frozen
snapshot 0.1: 69 operation cases, two chains, 16 generated capacity boundaries,
one law group, 339 SUT executions and 366 arithmetic assertions. An explicit
mutable target cannot establish this snapshot claim.

The [claim](../conformance/aeonic-arithmetic-claims.json) and
[report](../conformance/results/aeonic-arithmetic-snapshot-0.1.json) are separate
from comparison and historical SANSA claims. CI pins specs commit
`be4597cba2909d9756297047ec5bf34ec6cf8eea` and CTS commit
`321022560b477f238c69d3853c89d3aa135def2a`, on Node 20, 22 and 24. The retained
report normalizes `cwd` to `.` without changing verdict, hashes or counts.
The TypeScript consumer fixture checks direct chaining, explicit materialization
and the absence of values on diagnostics with TypeScript 5.9.3.

The arithmetic boundary and trusted-token binding adapt the MIT-licensed Aeonic
implementation at `9433ce2d57200dec2efe50ed0c02bf6b74e636e9`. Adaptation adds
SANSA API names, reuses existing exact-number/JSON helpers, copies scalar-key
ordering locally, and replaces Node byte counting with bounded portable UTF-8
counting. Copyright (c) 2026 Patrik; see [LICENSE](../LICENSE).

The owning specification and CTS remain in `aeonite-org/aeonite-specs` and
`aeonite-org/aeonite-cts`. Query syntax, comparison domains, Rust arithmetic and
package publication are separate capabilities; this API does not imply them.
