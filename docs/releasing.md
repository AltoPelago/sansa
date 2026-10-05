# Releasing

SANSA publishes its JavaScript package to npm and its host-neutral Rust runtime
to crates.io from GitHub Actions using trusted publishing.

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

Create GitHub environments named `npm` and `crates-io`. Add required reviewers
to either environment if release approval should be explicit before publishing.

The publish workflow runs when a GitHub Release is published. It verifies that
the release tag matches the package version, so `package.json` version `X.Y.Z`
must be released from tag `vX.Y.Z`.

## crates.io setup

crates.io does not allow a trusted publisher to create a crate. Bootstrap the
initial release with a conventional crates.io API token, then configure a
trusted publisher for `altopelago-sansa-runtime`:

- GitHub organization or user: `AltoPelago`
- Repository: `sansa`
- Workflow filename: `rust-publish.yml`
- Environment name: `crates-io`

The Rust workflow uses a separate signed annotated `rust/vX.Y.Z` tag. It checks
that the tag resolves to `main`, matches the shared project version, passes all
implemented stable Rust CTS lanes, and produces a package that builds before
requesting a short-lived crates.io token through GitHub OIDC. A clean consumer
then installs and exercises the exact published version.

### Initial crates.io bootstrap

For the initial `0.12.0` publication only:

1. Merge the reviewed Rust-publication PR and confirm CI passes on `main`.
2. Create the narrowest short-lived crates.io API token that permits publishing
   a new crate.
3. From a clean checkout of that `main` commit, run `cargo login`, enter the
   token when prompted, and then run:

   ```sh
   cargo publish --locked --manifest-path implementations/rust/crates/sansa-runtime/Cargo.toml
   ```

4. Run `cargo logout` and revoke the bootstrap token on crates.io.
5. Configure the trusted publisher above now that the crate exists.
6. Create and push the signed annotated `rust/v0.12.0` tag from the same
   reviewed commit. The workflow verifies the existing exact release, skips a
   duplicate upload, and runs the clean-registry smoke test.

Do not retain the bootstrap token as a GitHub secret. Subsequent Rust releases
are published by the workflow using short-lived OIDC credentials.

## Release steps

1. Run `npm run version:set -- X.Y.Z` to update machine-owned npm,
   capability, and Rust release metadata atomically.
2. Update `conformance/cts-claims.json` so `implementation_version` matches the
   package release, and confirm every claimed immutable CTS snapshot id remains
   authoritative for the release.
3. Add the dated `X.Y.Z` release section and human-authored notes to
   `CHANGELOG.md`.
4. Run `npm run version:check`, the test suite, CTS, stress tests, and package
   dry-run.
5. Merge the release-prep PR into `main`.
6. Confirm CI passes on `main`.
7. Create tag `vX.Y.Z` from the checked `main` commit.
8. Publish a GitHub Release for `vX.Y.Z` and let `Publish npm` complete.
9. Create a signed annotated `rust/vX.Y.Z` tag from the same checked `main`
   commit and push it.
10. Let `Rust Publish` complete, including its clean-registry smoke test.
11. Confirm both registry pages show the expected version and provenance.

For the initial Rust-only 0.12.0 publication, follow the bootstrap procedure
above; the existing npm `v0.12.0` tag and artifact remain unchanged. From the
next coordinated version onward, create both tags from the same checked commit.

`version:set` updates `package.json`, `docs/capabilities.json`, and
`implementations/rust/Cargo.toml` together.
`version:check` is enforced by CI and the publish workflow; it also requires a
matching dated changelog heading. The setter accepts valid SemVer without a
leading `v`, permits an exact idempotent rerun, and otherwise requires the new
version to have higher SemVer precedence. Neither command commits, tags, or
publishes.
Updates use staged files, backups, and atomic renames. If a process is
interrupted, both `version:set` and `version:check` fail closed until
`npm run version:recover` either restores the original release set or finishes
cleanup for a committed set. Run recovery only after confirming no other
version command is active.
