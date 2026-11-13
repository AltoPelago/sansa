# Child identity editor and tooling candidate

The SANSA source playground highlights declared `\id\` occurrence metadata
and embedded SANSA literals separately from clone/pointer references. The
maintained AEON tooling candidate adds corresponding VS Code/Pulsar/Sublime
scopes, Tree-sitter/Neovim nodes/captures and web/Quick Look source highlighting.
Those lexical patterns are presentation aids, not a replacement for SANSA
parsing or consumer capability checks. Their lexical subset does not claim
complete SANSA grammar validation.

The AEON language-service candidate describes identity annotations and address
literals on hover using existing lexer tokens. Compiler and trusted-schema
diagnostics remain authoritative, and reference completion stays structural.
No global ID lookup, identity completion, rename, automatic reference rewriting,
new recursion or reference/mutation/SO admission is added.

Candidate extension bundling supports an explicitly selected built AEON
TypeScript graph and preserves import-only SANSA/cursor dependencies. Tooling,
AEON language-service, public example and website changes remain in retained
local candidates. SANSA source changes may be pushed; releases, extension
installation/marketplace publication and website deployment remain held.

Public candidate examples demonstrate direct-child chaining, structural paths
after reorder and explicit empty Query Binding Sets. Published examples keep
their existing dependency pins and do not gain support by implication.

Verification is local: grammar/corpus/highlighter and service/bundle/protocol
checks plus the existing compatibility/reference-target checks. It does not
replace editor-host/platform CI, independent review or final registry release
checks. The existing 1.15x latency/1.20x memory targets remain unchanged; no new
benchmark is run, and JavaScript retained-heap qualification stays deferred.
