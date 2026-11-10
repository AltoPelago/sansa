# Aeonic comparison baseline

The JavaScript package exposes `evaluateAeonicComparison` and
`evaluateAeonicComparisonText` as separate, proposal-stage entry points for
Aeonic Operations comparison snapshot 0.1. The snapshot fixes compatibility;
it does not promote the specification lifecycle or release a package version.

```js
import { evaluateAeonicComparison } from '@altopelago/sansa';

const result = evaluateAeonicComparison({
  operation: 'compare',
  input: {
    left: { category: 'finiteNumber', value: '9007199254740992' },
    right: { category: 'finiteNumber', value: '9007199254740993' },
  },
});
// result.value = { category: 'symbol', value: 'less' }
```

`equal` returns `equal`/`notEqual`; `compare` returns `less`/`equal`/`greater`.
Both return symbol descriptors with effective-policy metadata. Numerical text
is exact: `1`, `1.0` and `1e0` compare equal, as do signed zeros, while the
caller's representations remain intact. Strings and symbols independently use
Unicode scalar ordering. Booleans order `false < true`. Mixed domains return
`incompatible_comparison`, with no implicit cross-domain coercion.

Failures return a diagnostic reason, stage and JSON pointer, with no `value`.
Recognized deferred domains are rejected without interpreting opaque payloads.
Native numerical payloads, Boolean text, missing string payloads, empty symbols
and unpaired surrogates are invalid. Errors are never automatically recovered
into null or other values.

The historical `evaluateValueSemanticsOperation`, `aeon.value.*` profiles and
Query behavior retain their semantics. The historical minimum profile still
rejects Boolean/symbol ordering, and its equality result remains a Boolean.
This API does not change Query predicates or introduce arithmetic/temporal
operations. Its conformance applies to JavaScript, not the Rust runtime.

## Policy and context

The available profiles are `aeonic.operations.comparison.baseline.v1` and
`aeonic.operations.string.codepoint.v1`. Configuration belongs under
`input.policy` or `input.context`; operation policy overrides context settings.
String selection (`strings: { profile }`) and symbol selection
(`symbols: { mode: 'string-profile', profile }`) are independent.

Unknown fields and malformed declaration shapes produce `invalid_policy`.
Declared symbol order is unavailable. A selected valid declared-order setting
produces `unsupported_profile` at stage 3, before operand validation. Its shape
is still validated, including empty declarations, duplicate identities and
declaration budgets. Overridden settings are shape-checked but not resolved as
active profiles. No trusted option enables declared-order execution.

## Ingress and trusted limits

`evaluateAeonicComparison(request, options)` accepts typed logical operands and
checks structural depth without serializing the request or inventing a JSON
byte count. `evaluateAeonicComparisonText(requestText, options)` accepts exact
Unicode JSON text: UTF-8 byte/depth admission precedes decoding, and malformed
JSON or duplicate decoded keys produce stage-2 diagnostics.

Non-scalar text arguments and malformed trusted options throw a host `TypeError`;
they do not produce operation values. The sole trusted option is
`resourceLimits`, whose named limits must be nonnegative safe integers:

| Limit | Default |
|---|---:|
| `maxRequestBytes` | 4,194,304 UTF-8 bytes at JSON ingress |
| `maxRequestDepth` | 32 containers |
| `maxNumericCharacters` | 65,536 ASCII characters per operand |
| `maxStringScalars` | 65,536 decoded scalars per operand |
| `maxSymbolScalars` | 65,536 decoded scalars per operand |
| `maxDeclarations` | 64 named declarations |
| `maxDeclaredSymbols` | 1,024 symbols per declaration |

`AEONIC_COMPARISON_DEFAULT_RESOURCE_LIMITS` exports immutable defaults. These
are independent capacities; operation policy does not alter trusted limits.

## Conformance

Install the shared Python runner requirements from the sibling CTS checkout:

```sh
python3 -m pip install -r ../../aeonite-org/aeonite-cts/runners/requirements-aeonic-operations.txt
npm test
npm run cts:aeonic-comparison
node scripts/validate-cts-claims.mjs --claims conformance/aeonic-comparison-claims.json
```

The default target is immutable `aeonic-operations-cts-v1-snapshot-0.1`, with the
baseline capability set: 124 operation cases, four ordering groups, 16 generated
boundaries, 406 invocations and 896 ordering assertions. The selection includes
mandatory diagnostics for unavailable optional profiles. Both invocation modes
use the same adapter; declared-order execution is not claimed.

`AEONITE_CTS_ROOT` points to the CTS `cts` directory; `AEONITE_SPECS_ROOT` points
to the specification repository. `PYTHON` selects an executable with runner
dependencies installed. CLI flags `--cts-root`, `--cts`, `--specs-root` and
`--report` support other locations. The runtime has no Python or private package
dependency.

The [comparison claim](../conformance/aeonic-comparison-claims.json) and
[retained report](../conformance/results/aeonic-comparison-snapshot-0.1.json) are
separate from historical SANSA claims. CI pins specification commit
`8322fecd90d941bf1a5eced2d983b8354e0aa1f9` and CTS commit
`127c6abe047ef74f54d2c966d191c6f744b13f91`, on Node 20, 22 and 24. The retained
report normalizes `cwd` to `.`; normative hashes, verdict and counts are unchanged.
Implementation fingerprints identify the tested source of this unreleased API.

## Provenance

The boundary and JSON helper adapt the MIT-licensed Aeonic implementation at
commit `fefc72be3fc10db24a279862d7194507c36ec94a`. The adaptation removes
declared-order execution, closes trusted options, names SANSA entry points and
uses `TextEncoder` for portable UTF-8 admission. Exact decimal comparison was
originally adapted from SANSA commit `4f05ea935a684ada91a8cd6f8f75367730c1430f`;
the historical implementation remains intact. Copyright (c) 2026 Patrik;
see [LICENSE](../LICENSE).

The owning contract and CTS remain in `aeonite-org/aeonite-specs` and
`aeonite-org/aeonite-cts`. No frozen expectation or source artifact was changed.
