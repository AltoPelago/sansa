# Host-token parsing cursor

Import `parseDotSelectorFromCursor`, `parsePositionSelectorFromCursor`,
`validatePositionIndex`, and the `SansaSelectorCursor` type from
`@altopelago/sansa/parsing/selector-cursor`. This supported subpath follows
package SemVer; it is not re-exported at the root.

The shared functions own selector-step grammar. The synchronous cursor owns
lexical decoding/trivia, offsets, token consumption, resource limits and native
diagnostics. Each parse consumes exactly one dot or positional selector and
returns its SANSA selector, or an optional member/position projection. All other
selector kinds retain their normal SANSA representation. Errors propagate from
the cursor; `fail` must throw. Cursors and projection callbacks are trusted host
code and are never retained after a call. No registry, session, cache or replay
protocol is involved.

`index` is the current host offset. `peekSyntax()` exposes actual punctuation,
not the decoded contents of a quoted token. `consume` must consume or throw;
`match` consumes only on a match. `matchRangeSeparator` handles `..`. Identifier
and quoted-payload methods return decoded text. A quoted member or attribute
name may be an empty string; it remains a present property selector, distinct
from the root or an omitted token. Identifier roles retain their own validity
rules, including the nonempty requirement for local-space names.
`parseOptionalPositionIndex` returns a validated index or null for an omitted
range endpoint, and must not consume the closing bracket. Hosts may adapt token
consumption internally while presenting these semantics.

Validate each original numeric token with
`validatePositionIndex(raw, maximum, fail)` before numeric conversion. The
default maximum is 999999. An explicitly configured maximum must already be a
nonnegative safe integer; host option validation is responsible for this
precondition. Spelling is unsigned decimal without leading zeroes (except `0`).
The helper invokes `fail(message, code)` for malformed/out-of-bound values; the
host supplies source spans. A host that permits a larger maximum must surface
SANSA_NON_PORTABLE_POSITION_INDEX when it has a warning channel. Native SANSA
retains its existing larger-bound/warning behavior.

This is a grammar/transport API, not a reference admission API. The host owns
root/namespace/endpoint constraints and permitted structural lowering. AEON
references use existing structural segments and document-root shorthands; they
exclude contextual roots, parent/recursive/expansion/range/local-space/qualifier
steps and identity selectors. Successful reference validation still requires
one existing permitted binding. A singleton result or caller `isExact` flag
does not authorize additional reference syntax. Future exact path steps need
engine-owned lowering and compatible host support.
