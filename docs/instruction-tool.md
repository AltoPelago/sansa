# SANSA Instruction Tool

The package includes an experimental instruction tool for exercising
SANSA.Instruction parse, lower, and plan behavior from the command line.
The browser Mutate Workbench also accepts Instruction source through its input
mode toggle.

```bash
npm run instruction -- --mode parse --instruction 'replace $.inventory.items[1].qty with :int32 10'
npm run instruction -- --mode lower --instruction $'from $.inventory.items.*\nwhere .sku == "B-200"\nreplace .qty with :int32, 10'
npm run instruction -- --mode plan --instruction $'from $.inventory.items.*\nwhere .sku == "B-200"\nreplace .qty with :int32, 10'
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

## Instruction Surface

This prototype accepts the conservative mutation verbs currently supported by
the SANSA.Mutate planner:

```text
create $.inventory.status with "active"
replace $.inventory.qty with :int32, 10
remove $.inventory.oldStatus
insert last in $.inventory.tags with "sale"
insert before $.inventory.tags[1] in $.inventory.tags with :string, "featured"
move $.inventory.tags[0] after $.inventory.tags[2] in $.inventory.tags
```

Instructions may also use `from` and `where` clauses to lower
candidate-relative targets into exact mutation requests:

```text
from $.inventory.items.*
where .sku == "C-300"
create status with "pending"
```

Values use the same type-first intent style as AEON-facing examples:

```text
create $.types.brand with :brandColor, #ff00aa
create $.types.color.@.selector with :sansa, $.inventory.items.*
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
layout.

This is not yet a full replacement for structured mutation-request JSON.
Instruction currently does not preserve separate mutation preconditions or
provenance fields, and it does not express heterogeneous multi-operation
requests as a single instruction. Use structured JSON for those cases until a
later instruction/vocabulary slice defines them.

## Diagnostics

Failures preserve the phase boundary:

- parse failures come from `parseInstruction(...)`;
- lower failures come from instruction lowering, candidate resolution, or
  candidate-relative target resolution;
- plan failures come from `planMutation(...)`.

For example, a missing candidate-relative target fails during lowering:

```bash
npm run instruction -- --mode lower --instruction $'from $.inventory.items.*\nreplace .missing with "x"'
```

JSON diagnostics are available with `--format json`.
