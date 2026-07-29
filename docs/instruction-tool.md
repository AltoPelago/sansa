# SANSA Instruction Tool

The package includes an experimental instruction tool for exercising
SANSA.Instruction parse, lower, and plan behavior from the command line.
The browser Mutate Workbench also accepts Instruction source through its input
mode toggle.

```bash
npm run instruction -- --mode parse --instruction 'replace $.inventory.items[1].qty with :int32 10'
npm run instruction -- --mode lower --instruction $'from $.inventory.items.*\nwhere .sku == "B-200"\nreplace .qty with :int32, 10'
npm run instruction -- --mode plan --instruction $'from $.inventory.items.*\nwhere .sku == "B-200"\nreplace .qty with :int32, 10'
npm run instruction -- --mode plan --target json --instruction 'create $.types.selectorCliProbe with :sansa, $.inventory.items.*'
npm run instruction -- --format json --mode plan --instruction-file instruction.sansai
```

The default fixture is [../fixtures/query-inventory.json](../fixtures/query-inventory.json),
the same host-neutral namespace fixture used by the Query CLI. Use
`--fixture <path>` to test against another JSON or AEON fixture, and
`--fixture-kind json|aeon` when the extension is ambiguous.

`.aeon` fixture support is optional and uses the same AEON TypeScript Core
runtime discovery path as the Query tool. JSON fixtures expose bindings with
`address`, `children`, optional `attributeSpace` or `attributes`, optional
`localSpaces`, and scalar values through `value` or `scalar`.

## Modes

`parse` validates instruction source and prints its canonical form.

```bash
npm run instruction -- --mode parse --instruction 'replace $.inventory.items[1].qty with :int32 10'
```

Text output:

```text
replace $.inventory.items[1].qty with :int32, 10
```

`lower` resolves query-shaped candidate clauses and emits structured
SANSA.Mutate request operations. It does not call the mutate planner.

```bash
npm run instruction -- --mode lower --instruction $'from $.inventory.items.*\nwhere .sku == "B-200"\nreplace .qty with :int32, 10'
```

Text output:

```text
replace $.inventory.items[1].qty = 10 (datatype:int32, kind:number)
```

`plan` lowers the instruction and then calls `planMutation(...)`. This is the
best CLI mode for checking whether an instruction can become a conservative
mutation plan.

```bash
npm run instruction -- --mode plan --instruction $'from $.inventory.items.*\nwhere .sku == "B-200"\nreplace .qty with :int32, 10'
```

Text output includes the lowered operation and the planned operation summary.
JSON output includes a sanitized plan summary instead of live binding objects.

`plan` mode may also validate the resulting plan against a target surface:

```bash
npm run instruction -- --mode plan --target aeon --instruction $'from $.inventory.items.*\nwhere .sku == "B-200"\nreplace .qty with :int32, 10'
npm run instruction -- --mode plan --target json --instruction 'create $.types.selectorCliProbe with :sansa, $.inventory.items.*'
```

The target check runs after planning by calling
`validateMutationPlanTarget(plan, target)`. It does not change instruction
parsing, lowering, or mutation planning.

## Phase Model

Instruction tooling keeps the conservative mutation phases visible:

```text
Instruction Source
  -> Parsed Instruction
  -> Lowered Structured Operations
  -> Mutation Plan
  -> Consumer Policy / Authorization
  -> Target Surface Check
  -> Preview / Apply
```

The command-line tool stops at parse, lower, or plan unless `--target` is
provided. The browser Mutate Workbench can additionally run its experimental
policy plan filter after planning and before target-surface validation. Policy
and target-surface checks are post-plan consumer checks; neither one is encoded
by the Instruction source.

## Instruction Surface

This prototype accepts the conservative mutation verbs currently supported by
the SANSA.Mutate planner, plus source-level aliases that lower to those verbs:

```text
create $.inventory.status with "active"
create "display name" with "Adapter"
replace $.inventory.qty with :int32, 10
remove $.inventory.oldStatus
insert last in $.inventory.tags with "sale"
append $.inventory.tags with "sale"
insert before $.inventory.tags[1] in $.inventory.tags with :string, "featured"
move $.inventory.tags[0] after $.inventory.tags[2] in $.inventory.tags
```

`append <container> with <value>` and `append in <container> with <value>` are
source-level aliases for `insert last in <container> with <value>`. They lower
to an ordinary SANSA.Mutate `insert` operation with `placement: "last"`.

Instructions may also use `from` and `where` clauses to lower
candidate-relative targets into exact mutation requests:

```text
because "manual correction"
by "Bob"
from $.inventory.items.*
where .sku == "C-300"
create status with "pending"
```

`where` selects candidate bindings. `require` preserves a Mutate precondition
that must hold during planning and, by default, again before apply:

```text
from $.inventory.items.*
where .sku == "A-100"
require .qty == 1
require .status == "open"
replace .qty with :int32, 10
```

For candidate-relative instructions, each surviving candidate receives a
candidate-scoped precondition target. This keeps filtering and fail-closed
mutation guards separate.

One Instruction contains one declared mutation intent. That intent may lower to
multiple exact operations when a candidate selector matches multiple bindings,
but repeated source-level mutation clauses are rejected rather than treated as a
batch syntax. Use structured mutation-request JSON for heterogeneous or
unrelated multi-operation batches.

`because` and `by` are optional source-provenance clauses. They are preserved as
inert metadata on the lowered instruction and plan source:

```text
because "manual correction"
by "Bob"
from $.inventory.items.*
where .sku == "A-100"
replace .qty with :int32, 10
```

`because` is a human-readable reason. `by` is claimed attribution. Neither
clause provides authorization, authentication, approval, signature material, or
audit proof. Real actor identity, delegation, policy checks, and audit evidence
belong to the host envelope or mutation adapter.

Values use the same type-first intent style as AEON-facing examples:

```text
create $.types.brand with :brandColor, #ff00aa
create $.types.color.@.selector with :sansa, $.inventory.items.*
create $.types.@.selector with :sansa, $.inventory.items.*
create $.types.absentCopy with :null<string>, !notApplicable
create $.cloneCopy with :number, ~target
```

The optional comma after a datatype annotation is accepted for readability:
`:int32 10` and `:int32, 10` are equivalent.

Instruction values also include a conservative container-literal slice for
testing structured mutation payloads:

```text
create $.types.settings with :object, { enabled = true }
create $.types.aliases with :list<string>, ["adapter", "driver"]
create $.types.pairing with :tuple, ("sku", 7)
create $.types.badge with :node, <badge("new", 3)>
insert before $.inventory.items[1] in $.inventory.items with :object, { sku = "B-150" name = "Brace" qty = 4 category = "hardware" }
```

List, tuple, and node-child values use commas between items in this prototype.
Object fields use AEON-like `name = value` fields and may be separated by
layout or commas. Duplicate object field names are rejected so instruction
authoring never silently applies last-value-wins behavior:

```text
create $.types.settings with :object, { enabled = true, status = false }
```

Instruction values are literal payloads. Query expressions such as
`lower("A")`, membership expressions, and candidate-relative value expressions
are not accepted as replacement or create payloads in this conservative slice.

Instruction parsing and lowering are target-neutral. A target format can reject
value intent that SANSA can express. For example, `:string<null>` is valid
Instruction datatype intent, but the current AEON workbench target rejects it
because AEON only allows generic parameters on specific datatype families:

```text
create $.types.textProbe with :string<null>, ""
```

The browser Mutate Workbench exposes this as a separate target-surface phase.
The default target is AEON. JSON target mode is stricter and accepts only
JSON-compatible object/list/string/number/boolean/null values while rejecting
AEON-only features such as attributes, typed SANSA values, parameterized
datatypes, tuples, nodes, references, NaN, and Infinity.

Examples that lower successfully but fail JSON target-surface validation:

```text
create $.inventory.pair with :tuple, ("sku", 7)
create $.inventory.badge with :node, <badge("new", 3)>
create $.inventory.copy with :number, ~target
```

Quoted create member names are accepted for member names that cannot be written
as bare identifiers. Attribute creation uses ordinary SANSA attribute-space
addressing (`.@.`) and lowers to a create operation whose parent is the
attribute space.

This is not yet a full replacement for structured mutation-request JSON.
Instruction preserves source-level claimed provenance, but it does not express
heterogeneous multi-operation requests as a single instruction. Use structured
JSON for those cases until a later instruction/vocabulary slice defines them.

The Mutate Workbench labels examples that only exist on one input surface as
`structured-only` or `instruction-only` so this boundary is visible while
testing. The workbench also includes instruction-only diagnostic examples for
duplicate object fields, literal-only value failures, invalid create member
names, and target-surface rejection.

## Diagnostics

Failures preserve the phase boundary:

- parse failures come from `parseInstruction(...)`;
- lower failures come from instruction lowering, candidate resolution, or
  candidate-relative target resolution;
- plan failures come from `planMutation(...)`;
- policy failures come from a trusted consumer or workbench policy layer;
- target-surface failures come from a target renderer/adapter deciding that the
  planned value cannot be represented by that target.

Candidate-relative misses are lowering failures. Structural mutation legality,
such as inserting into a non-ordered container or moving across containers,
remains a Mutate planning failure after lowering has produced exact addresses.

For example, a missing candidate-relative target fails during lowering:

```bash
npm run instruction -- --mode lower --instruction $'from $.inventory.items.*\nreplace .missing with "x"'
```

Workbench text diagnostics include nested parse causes when available, so an
instruction parse wrapper can still expose the concrete source error such as
`SANSA_INSTRUCTION_DUPLICATE_OBJECT_FIELD`.

JSON diagnostics are available with `--format json`.
