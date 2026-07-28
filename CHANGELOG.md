# Changelog

All notable changes to this package are documented here.

This project follows Semantic Versioning while it remains pre-1.0. Minor
versions may still include breaking changes when the SANSA specifications move.

## Unreleased

### Added

- Added explicit Shared AEON Value Semantics profile hooks for string comparison,
  ordering, and case mapping.
- Added `aeonValueSemanticsDefaultProfile`,
  `createIntlValueSemanticsProfile(...)`, and
  `createFrenchValueSemanticsProfile(...)`.
- Added `createNaturalAsciiValueSemanticsProfile(...)` and the
  `aeon.value.string.natural.ascii.v1` profile for deterministic numeric-region
  string ordering.
- Added Query `valueSemantics` evaluation option so consumers can select default
  or domain-specific string semantics.
- Added minimum structural equality and reference-form equality coverage to the
  standalone value-semantics helper.
- Added experimental SANSA.Mutate structured planning and host-adapter apply
  APIs for exact `create`, `replace`, `remove`, ordered `insert`, and
  same-container `move`.
- Added experimental SANSA.Mutate structured preconditions evaluated during
  planning with the SANSA.Query expression evaluator.
- Added default apply-time rechecking of preserved SANSA.Mutate preconditions
  before mutation hooks run.
- Added experimental SANSA.Mutate `maxOperations` and `maxPreconditions`
  budgets for planning and apply.
- Added explicit SANSA.Mutate apply report addresses for mutation role,
  affected binding, and resulting binding diagnostics.
- Added SANSA.Mutate plan-level `sourceProvenance` preservation for structured
  request envelopes.
- Added SANSA.Mutate plan-level portability warning preservation for locally
  accepted non-portable targets.
- Added explicit SANSA.Mutate adapter capability flags for operation support and
  stable/atomic apply capability advertisement.
- Added an experimental browser SANSA Mutate Workbench for structured JSON
  mutation requests against `.aeon` source fixtures.
- Added experimental SANSA.Instruction parsing, lowering, CLI tooling, and
  Mutate Workbench integration for conservative mutation verbs.
- Added SANSA.Instruction `append` source syntax as an alias for
  `insert last`.
- Added SANSA.Instruction `require` clauses that lower into structured
  SANSA.Mutate preconditions.
- Added experimental SANSA.Mutate target-surface validation for AEON,
  JSON-compatible, and custom representability checks.
- Added a workbench-only experimental SANSA.Mutate policy gate for trusted
  consumer authorization tests.

### Changed

- Updated `isValue(...)` to use the concrete-value basis: infinities and
  containers are values, while Missing, explicit null, explicit absence values,
  NaN, and Binding Sets are not.
- Kept default Query string ordering on deterministic Unicode scalar value
  order unless an explicit value-semantics profile is supplied.

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
