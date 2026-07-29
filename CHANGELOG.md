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
- Added SANSA.Instruction `because` and `by` clauses that preserve inert
  source-level claimed provenance.
- Added SANSA.Instruction CTS coverage for quoted create member names,
  attribute-space create destinations, candidate-relative remove/append/move,
  repeated require preconditions, target-surface datatype rejection, and illegal
  positional create destinations.
- Added SANSA.Instruction negative CTS coverage for candidate-relative lowering
  misses and downstream Mutate planning failures for non-ordered containers,
  invalid anchors, and cross-container or self-anchored moves.
- Added SANSA.Instruction parse/value CTS coverage for comments, complex
  datatype intent, malformed container literals, invalid quoted create
  destinations, nested datatype unions, and literal-only value payloads.
- Added Mutate Workbench diagnostic examples for duplicate object fields,
  literal-only value failures, invalid create member names, and JSON tuple
  target rejection.
- Added experimental SANSA.Mutate target-surface validation for AEON,
  JSON-compatible, and custom representability checks.
- Added a workbench-only experimental SANSA.Mutate policy plan filter for
  trusted consumer authorization tests.

### Changed

- Updated `isValue(...)` to use the concrete-value basis: infinities and
  containers are values, while Missing, explicit null, explicit absence values,
  NaN, and Binding Sets are not.
- Kept default Query string ordering on deterministic Unicode scalar value
  order unless an explicit value-semantics profile is supplied.
- Updated TypeScript declarations for SANSA.Instruction values to include
  object, list, tuple, node, SANSA address, and reference literal payloads.
- Rejected duplicate object field names in SANSA.Instruction object value
  literals instead of silently keeping the last value.
- Updated Mutate Workbench error responses so instruction parse failures expose
  their parse phase and nested cause diagnostics in text mode.
- Clarified Instruction and Mutate documentation around parse, lower, plan,
  policy, target-surface, and apply phase boundaries.
- Added Instruction coverage for repeated same-verb mutation rejection and
  direct `require` precondition planning failures.
- Clarified Instruction ordered placement vocabulary and added coverage for
  append canonicalization plus direct `insert after` and `move last` forms.
- Clarified Instruction value-intent boundaries for typed scalars, typed
  containers, nested container literals, and target-neutral lowering.
- Clarified Instruction target-surface behavior for AEON and JSON, including
  JSON-compatible containers and parameterized datatype rejection.
- Improved target-surface diagnostics so CLI and Workbench text output expose
  target format, rejected datatype, and rejected value path when available.

### Security

- Require explicit trusted or constrained activation authority before Query
  `path(...)` resolves a structured SANSA Address Literal, with parsed
  structural-root checks, selector capability restrictions, contextual and
  parent containment checks, and dynamic binding bounds.

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
