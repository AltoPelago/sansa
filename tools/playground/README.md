# Source playground

This is the AEON website's SANSA playground UI adapted to run inside this repo.
It keeps the source highlighter, Resolve/Query panels, example dialog and both
composers. [website-origin.json](website-origin.json) records the original revision
and asset digests. The website is not modified.

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
- **Query:** exercises the existing Query engine over the SDK namespace. The
  separate identity-in-Query example shows its explicit unsupported diagnostic.

Edits re-evaluate after a short debounce. Use **Run** or **Cmd/Ctrl+Enter** for an
immediate evaluation. Results show canonical structural paths and available IDs;
diagnostics show actual codes and identity/limit context. Invalid AEON source
does not produce partial resolved results.

The UI uses the real `resolveAddress` and `createAeonNamespace` APIs, replacing the
website's custom path matcher. This adds a developer playground adapter, not
production browser/AEOS/Query/activation/mutation/SO admission. Child identities
remain non-exact, recursive extensions are unchanged, and AEON clone/pointer
references remain structural paths. Pushing this source branch creates no npm,
crates.io or GitHub release.
