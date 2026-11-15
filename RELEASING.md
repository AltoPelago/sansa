# Releasing SANSA

## Release stages

Publish `X.Y.Z-beta.N` while intended scope is landing. Publish `X.Y.Z-rc.N`
only after the selected scope is complete, normal repository checks pass and
release/migration notes describe the supported surfaces and limitations. Freeze
RC scope to stabilization fixes; use a new immutable version for each changed
candidate and rerun affected acceptance checks. Stable uses `X.Y.Z` after the
RC's registry consumers and downstream integrations pass.

Coordinate with the [shared 0.17.0 checklist](https://github.com/AltoPelago/roadmap/blob/main/aeon/work-in-progress/release-0.17.0-checklist.md).
SANSA keeps its own version; AEON's target does not require SANSA 0.17.0 or
matching beta/RC counters. Shared native version metadata is not evidence of
native feature delivery or publication.

## Preparation and publication

1. Select the exact source revision and scope. Reconcile the existing local
   `0.15.0-rc.1` preparation with registry availability before choosing the next
   beta. The version setter requires increasing SemVer precedence; preserve
   historical evidence and do not bypass that guard to relabel a candidate.
2. Use `npm run version:set -- X.Y.Z-beta.N` (or the accepted RC/stable version)
   for a normal forward version change. Add dated `CHANGELOG.md` notes and run
   `npm run version:check`, `npm test`, `npm run validate:cts-claims`,
   `npm run cts`, `npm run cts:query:experimental`, `npm run stress` and
   `npm pack --dry-run --json`. Complete the additional pinned CTS lanes in
   `.github/workflows/publish-npm.yml`; run native checks for affected native
   changes. Local success does not replace hosted workflow acceptance.
3. Review and merge the preparation through normal repository governance.
   The npm workflow triggers on a published GitHub Release and requires the
   tag `v<package version>`; a tag push alone does not trigger it. Mark beta/RC
   GitHub Releases as prereleases. Use the protected `npm` environment and
   existing trusted publisher. Publishing remains a separate release action.
4. The workflow selects `next` for both betas and RCs and `latest` for stable.
   Fetch and verify the exact registry artifact, exports and integrity in a
   clean consumer. Publish SANSA before dependent AEON packages; regenerate or
   confirm their locks against this artifact without weakening integrity checks.
5. Record artifact digests, exact dependencies, source and CTS revisions,
   runtimes, CI results, known limitations and downstream results in the shared
   checklist. Pin exact versions for acceptance instead of the moving `next`.
6. Stable publication requires its own version, notes and release workflow;
   repeat clean registry consumer checks for the final packages. Moving a
   dist-tag alone cannot remove a prerelease suffix.

Unfinished features may be documented in a beta, but required publication,
security, package and existing conformance checks are not optional.

## Shared browser highlighter candidate

The playground's AEON panel delegates to `@altopelago/aeon-highlight` from the
selected AEON source checkout. Build that checkout's highlight package alongside
its SDK/runtime before starting the SANSA playground. SANSA syntax highlighting
and runtime dependencies are unchanged. Root development archives are only for
the adapter tests; their hashes and producer commit are recorded in
`.candidate-packages/highlight.json`.

Local verification: 548 JavaScript tests pass, with 92 optional runtime skips.
The source playground resolves the chained identity example to its existing
structural binding in a browser. No new native-runtime qualification or performance
measurement is claimed. Compatibility and target-preservation checks and budgets
remain unchanged. Releases and deployment stay held.

Colour follow-up: numeric/radix literals use the shared `tok-number` role and
temporal values `tok-temporal`. Dark colours are cyan `#7dd3fc` / light yellow
`#f5e6a8`, with light-theme equivalents `#006b80` / `#806500`. SANSA address
literals share the symbol colour. The development highlighter archive is
repinned with SHA-256 provenance; parsers, target checks and budgets are unchanged.
Releases and deployment remain held.
