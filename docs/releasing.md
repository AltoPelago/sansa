# Releasing

SANSA publishes to npm from GitHub Actions using npm trusted publishing.

## npm setup

On npmjs.com, configure a trusted publisher for `@altopelago/sansa`:

- Publisher: GitHub Actions
- Organization or user: `AltoPelago`
- Repository: `sansa`
- Workflow filename: `publish-npm.yml`
- Environment name: `npm`
- Allowed action: `npm publish`

Trusted publishing requires no long-lived `NPM_TOKEN` secret. npm uses GitHub
OIDC from the release workflow and automatically generates provenance for public
packages published from public repositories.

## GitHub setup

Create a GitHub environment named `npm`. Add required reviewers to that
environment if release approval should be explicit before publishing.

The publish workflow runs when a GitHub Release is published. It verifies that
the release tag matches the package version, so `package.json` version `X.Y.Z`
must be released from tag `vX.Y.Z`.

## Release steps

1. Run `npm run version:set -- X.Y.Z` to update machine-owned release metadata.
2. Add the dated `X.Y.Z` release section and human-authored notes to
   `CHANGELOG.md`.
3. Run `npm run version:check`, the test suite, CTS, stress tests, and package
   dry-run.
4. Merge the release-prep PR into `main`.
5. Confirm CI passes on `main`.
6. Create tag `vX.Y.Z` from the checked `main` commit.
7. Publish a GitHub Release for `vX.Y.Z`.
8. Let `Publish npm` run from GitHub Actions.
9. Confirm the npm package page shows the expected version and provenance.

`version:set` updates `package.json` and `docs/capabilities.json` together.
`version:check` is enforced by CI and the publish workflow; it also requires a
matching dated changelog heading. Neither command commits, tags, or publishes.
