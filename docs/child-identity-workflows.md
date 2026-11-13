# Read-only identity workflows — candidate

These are unpublished workflow checks for the coordinated AEON/SANSA candidate.
They use four independently compiled documents, not a mutation or SO API:

| Snapshot | Selected value | Structural result |
| --- | --- | --- |
| [Original](../fixtures/child-identity-workflows/original.aeon) | Widget | `$.west.stock.items[0].name` |
| [Reordered](../fixtures/child-identity-workflows/reordered.aeon) | Widget | `$.west.stock.items[1].name` |
| [Moved and renamed subtree](../fixtures/child-identity-workflows/moved.aeon) | Widget | `$.east.renamed.items[1].name` |
| [ID-reusing replacement](../fixtures/child-identity-workflows/replacement.aeon) | Replacement | `$.east.renamed.items[1].name` |

For the original and reordered snapshots, resolve:

```sansa
$.west.\stock1\.items.\item1\.\name1\
```

For the moved snapshot the traversal starts at `$.east` instead. The `stock1`
identity selects the newly named `renamed` child. The old `$.west` route misses;
identity steps do not search the entire document.

Identity selectors remain **non-exact**. Results retain original binding handles
within a snapshot and concrete structural paths. A structural reference such as
`~west.stock.items[0].name` still targets position zero after reorder; it does not
follow `item1`. If that structural target is absent after a move, the reference
fails. Canonicalization and Titonic export preserve the authored reference
targets; they do not rewrite them to identities.

## Subtree roots and activation

Rebase the source playground to the snapshot's structural subtree path, such as
`$.east.renamed`. `$` selects that root and exposes its object representation.
Then `$.items.\item1\.\name1\` selects Widget. `$.\stock1\` misses because
child selection does not match the scope root itself. Rebasing to the list lets
`$.\item1\.\name1\` select the same binding, and `$` describes a list root.

Rebasing changes where traversal starts. It is not a new authorisation sandbox;
explicit parent traversal retains the host namespace's existing policy. A host
that requires confinement must enforce its scope/accessor policy. Constrained
`path(...)` activation separately proves canonical allowed roots before an
identity scan, then checks resolved paths. Moving a subtree does not extend an
old activation grant; a new structural root must be explicitly allowed.

## Empty projections, limits and replacement

```sansa
from $.west.stock.items.*
select .\name1\
```

Both items remain candidate records; the item with `name2` has an empty Binding
Set projection. Add `where exists(.\name1\)` to filter that record out. Reorder
changes candidate order and structural paths, not these projection semantics.

A whole Query shares its identity-inspection allowance across every step and
candidate. Exhaustion returns no partial result, and a new invocation starts
fresh. AEOS validation also uses fresh snapshot-local state: reusing a schema
across reorder sees the new target path; a moved subtree does not reuse a stale
successful expansion. Ambiguous siblings fail rather than silently choose one.

The replacement deliberately reuses `item1` and `name1`. A new lookup finds
Replacement at the same structural path, while a captured handle in the old
snapshot still denotes Widget. Neither an identity string nor equal result paths
prove occurrence continuity or authorise a stale write. Instruction, mutation,
AEON clone/pointer identity references, AEOS path fields and SO identity
sources/anchors/containers remain unadmitted.

## Reproduce the coordinated consumer checks

Run the dependency-free SANSA workflow tests:

```sh
node --test test/read-only-workflows.test.js
```

For real AEON consumers, build/install an explicitly selected candidate graph
and prepare a JSON manifest whose `core`, `canonical`, `aes`, `sdk`, `aeos` and
`titonic` fields contain the respective public module entry **file URLs**. `sdk`
is its `sansa` export. Run from that installed graph's consumer directory so the
workbench can discover the same Core/AES runtimes:

```sh
node /path/to/sansa/tools/workflows/verify-child-identities.mjs candidate-modules.json
```

The tool imports no guessed sibling implementation, installs nothing and makes
no mutation/ordering commit. Titonic retains its currently supported sibling
workspace packaging layout. Checks cover SDK Resolve/Query, constrained
activation, source/portable/Telex AEOS targets, Titonic selection/export,
AEON/Telex workbench results, source-playground projection, canonical replay,
reference targets, budgets and closed consumers. Separate Rust and installed
pure/native Python checks consume the same source vectors for their exposed
APIs. Pure Python has no Query evaluator; its Resolve projection supplies paths
and metadata, with values checked through the corresponding portable records.
Native Pytonic retains its existing Query and default inspection-budget API.

These workflow fixtures are local candidate regression material, not a promoted
CTS contract. Existing CTS, compatibility helpers and original target checks
remain unchanged. No new recursive selector, global index, public API, benchmark
or release claim follows. The original 1.15x latency/1.20x memory budgets remain
intact; retained JavaScript heap qualification stays deferred/unqualified.
