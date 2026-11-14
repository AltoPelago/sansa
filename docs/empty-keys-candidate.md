# Empty property keys — development integration

Quoted empty member and attribute names are ordinary property names. `$` is the
scope root; `$.[""]` selects its empty-named child; `$.[" "]` selects a different
child. An absent name, an empty Binding Set and an empty value are distinct.
Duplicate names remain duplicates, including two empty names under one parent.

Resolve and admitted Query consumers retain original bindings and structural
result paths. A declared child identity may select an empty-named child as an
alias; it does not change that child's canonical structural path. This does not
admit identity selectors into mutation, activated address values or AEON
references. Those consumers retain their existing separate admission policies.

Mutation creation accepts a present string name whose value is empty. Missing,
null and nonstring names remain invalid. Workbench structural create, replace
and remove operations retain the ordinary target-preservation requirements.
Empty identities, local-space names, datatype names and node tags are outside
the ordinary-property amendment and retain their existing restrictions.

Unicode name matching, exact identity and casing policies remain unchanged.
Name-pattern wildcards count code points, including line terminators; exact
names are not normalized or case folded. See [Unicode hardening](unicode-hardening.md).

The amendment is exercised through explicitly selected mutable CTS targets.
Historical rejection suites remain intact; their superseded empty-key cases
are excluded only by the evolving authority manifests and replaced with positive
and retained negative cases. Development results do not establish a released
immutable CTS claim. Package version allocation, final registry artifacts and
release acceptance remain separate. Official releases and deployment stay held.
