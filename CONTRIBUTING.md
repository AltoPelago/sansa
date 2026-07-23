# Contributing

SANSA is public and readable, but this repository is not run as a standard
open-contribution project.

The governance model is described in [GOVERNANCE.md](./GOVERNANCE.md). The short
version is:

- implementation authority lives in this repo
- release and merge authority stay with the maintainer
- outside pull requests are not assumed to be part of the default workflow

## What is welcome

- clear bug reports
- reproducible address parsing, resolve, or query mismatches
- CTS gaps and parity findings
- documentation fixes
- forks, downstream tooling, and independent implementations

## Before opening a pull request

- do not assume an unsolicited PR will be merged
- prefer opening an issue first for non-trivial changes
- if the change touches parser behavior, resolver behavior, query evaluation,
  CTS, diagnostics, or security behavior, include the concrete failing case and
  expected outcome
- keep changes narrowly scoped and avoid bundling unrelated cleanup
- make sure tracked files do not introduce local filesystem paths into the
  public repo

## Development expectations

- run `npm test` for normal package changes
- run `npm run cts` for conformance-affecting changes
- run `npm run cts:query:experimental` when touching experimental Query or
  Transform behavior
- run `npm run stress` when changing address parsing or selector behavior
- keep parser, resolver, and diagnostic behavior deterministic
- avoid changing package metadata or release surfaces casually

## Good contribution shape

- a minimal repro
- the intended contract or authority surface
- focused code changes
- tests or CTS/corpus additions that lock the behavior in

## Security issues

Do not use normal public issues for suspected vulnerabilities. Follow
[SECURITY.md](./SECURITY.md) instead.
