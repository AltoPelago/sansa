# Changelog

All notable changes to this package are documented here.

This project follows Semantic Versioning while it remains pre-1.0. Minor
versions may still include breaking changes when the SANSA specifications move.

## 0.9.0 - 2026-07-24

Initial public pre-1.0 release of `@altopelago/sansa`.

### Added

- SANSA Address parser and canonical renderer.
- SANSA Resolve over host-supplied namespace adapters.
- SANSA.Query parser and bounded evaluator.
- Shared AEON Value Semantics minimum consumer operations.
- Query CLI and browser workbench for technical testing.
- Host-neutral JSON fixture support for the Query tool.
- Optional AEON TypeScript Core integration for `.aeon` fixtures.
- CTS runners for value semantics, address parsing, resolve, and query.
- Address stress-test fixtures for legal and illegal SANSA cases.
- Capability metadata in `docs/capabilities.json`.

### Experimental

- Query `validation` policy.
- `SANSA.Transform` helpers: `objectFrom` and `fieldsFrom`.
- Browser Query workbench for technical exploration.

### Security

- Public release repository hardening docs: security policy, governance,
  contributing guide, and code of conduct.
- CI, dependency review, Dependabot, pinned GitHub Actions, and package
  dry-run verification.

### Notes

- SANSA is versioned independently from AEON.
- Query and transform surfaces are still expected to evolve before 1.0.
