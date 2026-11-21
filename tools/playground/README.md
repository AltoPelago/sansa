# Source playground

This is the AEON website's SANSA playground UI adapted to run inside this repo.
It keeps the source highlighter, Resolve/Query panels, example dialog and both
composers. [website-origin.json](website-origin.json) records the original revision
and asset digests. The original extraction left the website unchanged; its later
identity-aware browser integration is maintained and verified separately.

## Run

```sh
npm run playground -- --aeon-root /absolute/path/to/aeon
```

Open **http://127.0.0.1:4174/tools/playground/**. Use `--port 4180` to choose another
port. A sibling AEON checkout is detected automatically; alternatively set
`SANSA_PLAYGROUND_AEON_ROOT`. The selected checkout must already have its TypeScript
packages built, including runtime, profiles, tonic and SDK. Use the normal AEON
workspace build (`pnpm --dir /path/to/aeon/implementations/typescript build`) when
needed. Its SANSA dependency must be compatible with this source checkout.

For child identities, use the matching AEON candidate whose SDK namespace exposes
the explicit identity accessor. An older SDK may correctly report unsupported
identity selection; the playground does not infer capability from binding fields.

There is no SANSA bundle, CDN, PHP dependency or release step. The browser imports
**`/src/index.js` directly**, including the shared selector cursor. AEON modules are
served from that checkout's `dist` directories, with an import map pointing every
SANSA import at this repo. Reload after editing SANSA source; rebuild the AEON
packages after editing their TypeScript. Responses are not cached. The server
binds to localhost and serves only playground assets, SANSA source and AEON build
modules. Documents are evaluated in the browser.

## Try

- **Child identities:** chain `$.inventory.items.\item1\.\name1\` and inspect the
  actual structural result path.
- **Reordered list:** the identity still selects the same authored ID at index 1.
- **Scope children / Scope root is excluded:** `$` and `?` use the selected scope
  root; child selection cannot match that root's own identity. Scope root must be
  one existing absolute structural path.
- **Inspection limit:** a match is not returned early when the remaining sibling
  scan would exceed the limit. Missing/ambiguous/limit failures come from Resolve.
- **SANSA Composer:** offers both structural child steps and declared child IDs.
  **AEON Composer:** preserves ordinary binding/list/attribute identities while
  editing its supported source forms; use the source editor for other AEON forms.
- **Query:** exercises the Query engine over the SDK namespace. The
  identity-in-Query example selects through an identity chain and shows structural
  provenance. Its inspection limit is shared across the entire Query call.

Edits re-evaluate after a short debounce. Use **Run** or **Cmd/Ctrl+Enter** for an
immediate evaluation. Results show canonical structural paths and available IDs;
diagnostics show actual codes and identity/limit context. Invalid AEON source
does not produce partial resolved results.

The UI uses the real `resolveAddress` and `createAeonNamespace` APIs, replacing the
website's custom path matcher. This is a developer source adapter. The matching
website candidate now has separate SDK-backed Resolve/Query and AEOS composer
verification; deployment remains held. Trusted identity activation, mutation and
SO stay guarded. Query identity support
is explicitly integrated in the source evaluator. Child identities
remain non-exact, recursive extensions are unchanged, and AEON clone/pointer
references remain structural paths. Pushing this source branch creates no npm,
crates.io or GitHub release.

The source editor distinguishes structural identity annotations and embedded
SANSA address literals. Coloring is a lexical aid; actual parsers and consuming
APIs still determine validity and admission. See [tooling scope](../../docs/child-identity-tooling.md).

For complete original/reordered/moved/replacement examples, paste the linked
[source snapshots](../../fixtures/child-identity-workflows/README.md) into the
source editor and follow the [workflow guide](../../docs/child-identity-workflows.md).

## Value operations

Choose **Value operations** to open `arithmetic.html`. This linked page calls SANSA's
finite snapshot 0.1 and rational snapshot 0.2 text APIs, with eleven numerical examples,
verbatim logical JSON and a separate combined-output-policy editor. Exact thirds
can feed multiplication, explicit quantization or materialization; continuations
copy the real returned value/history bundle. Editing or changing capability
clears reusable values. Errors never supply partial values.

Each run uses a fresh browser module worker, terminated on completion, cancellation,
input changes or four-second timeout. Input plus output policy is limited to
256 KiB, policy to 16 KiB/depth 8, and result to 1 MiB. Engine defaults still apply
independently; these controls do not promise a general browser-memory sandbox.
No trusted resource settings or arbitrary code are accepted by the page. Arithmetic
imports this checkout's source and needs no document projection, external service
or Python execution. The shared launcher still loads the built AEON dependency
for its Resolve/Query page. [API and conformance details](../../docs/aeonic-rational-arithmetic.md).

The **Civil dates · snapshot 0.1** capability adds twelve civil-date examples.
It calls `evaluateAeonicTemporalText` directly, with explicit profile/calendar
policy in request JSON. Shift, step and materialize continuations copy the entire
returned date bundle, including precise ranges, origin and clamping history.
Symbolic outcomes and diagnostics cannot feed date continuations. Numerical
combined output policies are not offered in this lane. The live description
follows current request JSON; historical starting-point prose is labeled
separately. These controls share the same worker/time/input/output bounds above.
A containing month/year label never widens coverage. See the [civil-date API and
frozen claim](../../docs/aeonic-temporal-civil-date.md).

The **Civil date-times · snapshot 0.1** lane adds exact points/intervals,
excluded endpoints, reduced dates/clocks, calendar and civil-coordinate clock
shifts, complete-form stepping and exact materialization. Both origins and both
histories are displayed separately. Continuations copy the complete bundle;
step/materialize selectors are explicit, editable policies. No output-family
convenience mode is offered for temporal lanes. A containing display never widens
coverage, and clock shifts make no elapsed-time or timezone claim. Eleven
examples call the SANSA source API in a browser worker. Descriptions follow edited
requests; diagnostics retain no reusable value. See the
[date-time API and frozen evidence](../../docs/aeonic-temporal-civil-datetime.md).

## Property selectors (development)

Use the coordinated AEON #207 build (or a later build retaining that integration).
The property examples use the same `createAeonNamespace` metadata facet and
`resolveAddress` / `evaluateQuery` engines as the SDK;
this UI has no property parser, tag-field inference or alternate resolver.
`&key("...")` compares the literal incoming member/attribute key. Empty keys,
`*` in a key, and Unicode remain literal. Positions are not keys. A selected
scope root hides its incoming key but retains its intrinsic/direct-head tags;
`&tag("...")` matches node containers only. `&headTag("...")` matches heads only; neither treats an ordinary field named `tag` as metadata.

**Property inspections** is independent of identity inspections: default 10,000,
maximum 1,000,000, with zero permitted. The value goes to Resolve, or Query's
shared Resolve allowance, unchanged;
logical work includes candidates and yielded direct heads, including misses and
repeated occurrences. Construction, ancestry and other navigation have separate
costs. Budget failures show the real property/budget/limit/observed fields and
return no partial results. Parser limit diagnostics retain limitKind too.

**Property Query: current row** selects the row's tagged container using `.`.
**Property Query: scope root** uses `?` to establish the row as a scope root,
whose incoming key is hidden: the Query retains one candidate with an empty
Binding Set. Direct read-only property Query is admitted. Portable AEOS validation
has separate explicit owning APIs; this UI does not turn its other policy or
mutation paths into that profile. Structural references and stored-address
activation remain closed. The [support matrix](../../docs/property-selector-support.md)
distinguishes this SDK-backed UI from the incapable legacy Query Workbench. The SANSA Composer accepts manually entered property suffixes through
the real parser; automatic property suggestions are not supplied yet.

Run the explicit cross-repository integration check after building AEON:

```sh
node tools/workflows/verify-property-playground.mjs /absolute/path/to/built/aeon
# Or verify explicitly installed candidate packages:
node tools/workflows/verify-property-playground.mjs /absolute/path/to/consumer --installed
```

It checks all 15 property examples as text and parsed AST, scope roots, original
candidate and selected binding handles, direct heads, inspection diagnostics,
Query selection and empty Binding Sets. No
installation, index, mutation or release is performed. Official releases,
deployment, stable profile promotion and final performance qualification remain
held; the 1.15x latency / 1.20x memory budgets are unchanged.

Results label their actual representation kind. Use the recursive container/head
examples to compare `&tag` and `&headTag`; add `.*` explicitly to visit head children.

Date anchoring uses frozen snapshot 0.1. Select **Date anchoring** in Value
operations, edit either authored or derived input in the request JSON, and run.
Clock/date results offer explicit anchoring actions; anchored results offer
**Shift as date-time**. Continuations preserve complete bundles and prepare an
explicit receiving profile for review without automatically executing.
