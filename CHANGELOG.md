# Changelog

All notable changes to this package are documented here.

This project follows Semantic Versioning while it remains pre-1.0. Minor
versions may still include breaking changes when the SANSA specifications move.

## Unreleased

## 0.10.1 - 2026-09-11

### Added

- Added direct complete `telex.aes` input to the Query CLI and browser
  workbench. The adapter preserves portable paths, record order, structural
  identities, datatype components, flat attributes, and expanded node heads
  without reconstructing the AEON parser AST.
- Added a conservative Telex target surface and Mutate Workbench source mode.
  Exact scalar replacement now re-emits complete Telex while retaining event
  order, paths, identities, datatype components, and flat attributes. Changed
  events discard stale origin/span coordinates; structural rewrites fail closed
  pending a portable path-rewrite contract. The Instruction CLI can select the
  same representability surface with `--target telex` or `--target telex.aes`.
- Preserved structural identity as opaque binding metadata throughout SANSA
  resolution without using identity to construct or compare addresses.

### Fixed

- Accepted exact normative representation names such as `NodeLiteral` and
  `NodeHead` in `%kind` filters while retaining existing lower-first matching
  for compatible host namespaces.
- Kept representation-kind filters on the ordinary identifier grammar and
  rejected the obsolete hyphenated `%node-head` spelling.
- Aligned portable AES node-navigation fixtures with the explicit
  `NodeLiteral` → `NodeHead` → content hierarchy.

## 0.10.0 - 2026-09-01

### Breaking

- Renamed the AEON temporal literal family from `zrut` to `wtc` across query,
  instruction, mutation, workbench, fixture, declaration, and documentation
  surfaces.
- Changed qualifier datatype clarifiers to one bracketed list. String
  clarifiers must now be quoted, multiple values use comma separation inside
  the same brackets, and numeric clarifiers such as `radix[16]` are represented
  as numbers. Repeated clarifier lists and unquoted string clarifiers are
  rejected.

### Added

- Added experimental `traverseGraph(...)` and `traverseGraphSequence(...)`
  APIs for declared, directed relationship traversal with ordered path
  provenance.
- Added experimental graph capability metadata covering schema-version
  applicability, semantic-type constraints, edge cardinality, cycle policy,
  authorization hooks, and explicit traversal budgets.

### Changed

- Updated address, instruction, mutation, query, fixture, stress, and API
  contract surfaces to use the unified AEON datatype clarifier grammar.

### Security

- Graph traversal requires explicit budgets and applies an independent
  authorization decision to every traversal step without granting authority to
  composed Query reads.

## 0.9.1 - 2026-08-02

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
- Added SANSA.Instruction CTS coverage for quoted address-member create
  destinations, selector-as-create-destination rejection, typed replace values,
  date values, and SANSA selector values.
- Added Mutate Workbench diagnostic examples for duplicate object fields,
  literal-only value failures, invalid create member names, lower-phase target
  misses, lower-phase anchor misses, and JSON tuple target rejection.
- Added Mutate Workbench policy-boundary examples for allowed operations,
  default-deny failures, and explicit-deny failures.
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
- Improved experimental policy diagnostics so Workbench and CTS output can
  identify the affected rule, policy field, policy scope, and invalid matcher
  address when available.
- Expanded Instruction/Mutate target-surface coverage for type-first values on
  ordered inserts and AEON parameterized container datatype families.
- Moved Mutate Workbench examples into a shared catalog module so UI rendering
  and runtime tests use the same grouped example source.
- Added declared Mutate Workbench catalog expectations and runtime coverage for
  every structured and Instruction example variant.
- Added operation-count and selected text-snippet assertions for representative
  successful Mutate Workbench catalog examples.
- Updated the Mutate Workbench status chip and catalog metadata so parse,
  lower, plan, policy, target, and apply phases remain visible in the UI and
  tests.

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
