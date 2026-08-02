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

1. Update `package.json`, `docs/capabilities.json`, and `CHANGELOG.md`.
2. Merge the release-prep PR into `main`.
3. Confirm CI passes on `main`.
4. Create tag `vX.Y.Z` from the checked `main` commit.
5. Publish a GitHub Release for `vX.Y.Z`.
6. Let `Publish npm` run from GitHub Actions.
7. Confirm the npm package page shows the expected version and provenance.
