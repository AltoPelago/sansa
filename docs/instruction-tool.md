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
