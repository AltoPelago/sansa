# Constrained child identity activation (candidate)

Read-only Query may activate a typed SANSA address containing child identity
selectors only through an explicit constrained policy. Parser support, ordinary
Query selection and trusted activation do not enable this feature automatically.

Given the AEON source:

```aeon
items = [\a\ = { name\n\ = "hello" }]
selector:sansa = $.items.\a\.\n\
```

Use the namespace adapter's explicit identity capability and this Query policy:

```javascript
const result = evaluateQuery('from $.selector\nselect path(.)', namespace, {
  addressActivation: {
    allowedRoots: ['$.items'],
    allowedSelectors: ['member', 'childIdentity'],
    maxAddressDepth: 4,
    maxBindings: 100,
  },
  resolve: { maxIdentityInspections: 1000, maxBindings: 100 },
});
```

The value is the original binding at `$.items[0].name`; the authored expression
is non-exact. A policy granting only `$.items[0]` fails **before** inspecting any
identity under `$.items`: permission for one child cannot authorise a sibling
scan from its parent. Missing identities still cost inspections. Ambiguity,
unsupported capability, invalid metadata or any limit/scope failure returns no
Query records.

## Scope and accounting

Before the first identity step, a structural prefix must be provably within an
allowed root. Identity steps never count as exact structural keys. Contextual
activation also requires `allowContextualRoot: true` and a canonical structural
path for the current binding. For identity activation, allowed roots denote
canonical binding paths in the exposed namespace; a rebased namespace root uses
its actual structural path rather than silently treating it as document `$`.

Each identity scan parent and candidate must expose an exact, unqualified,
absolute structural path inside the grant before identity metadata is read.
Every returned binding is checked again after resolution, including any
structural suffix following an identity. Missing, selector-like, qualified or
out-of-scope paths fail. Host adapters remain responsible for truthful paths,
namespace topology and snapshot consistency; textual paths do not establish
occurrence continuity or authorisation outside the host's grant.

This first slice rejects **all parent selectors and qualifiers** in an identity
activation, even with a parent capability. It also bounds caller-AST projection
and reparses it before policy decisions. Forged canonical/exact flags on an
address or policy root carry no authority. Existing structural activation remains
available under its existing policy.

Ordinary and activated identity reads share the Query invocation's existing
`resolve.maxIdentityInspections` budget (default 10,000), across all clauses,
candidates and repeated reads. New/reentrant Query calls have fresh private
counters. Logical inspections are distinct from adapter enumeration, allocation
and I/O cost. For identity activation, the stricter of the host Resolve and
activation binding ceilings applies. Result/depth/inspection limits are separate.

## Runtime/API scope

JavaScript/TypeScript calls the selector feature `childIdentity`; Rust adds
`ActivationSelector::ChildIdentity`. Rust callers with exhaustive matches must
handle the new enum variant. No public options field, session or serialized
payload is added. The existing native Pytonic Query API accepts
`activation_selectors=("member", "child_identity")` with
`activation_roots=("$.items",)`, using its existing default inspection budget.
Pure Python still has no Query evaluator, and no new WASM Query API is implied.

Trusted/default activation stays closed to identities. Historical failure codes
remain explicit: JavaScript reports policy-required or policy-denied for an
absent/non-allowing constrained policy; shared Rust retains its unsupported
selector guard for non-opted-in identity activation. Both perform zero identity
inspections in those cases.

Public Rust standalone expression evaluation and JavaScript mutation/Instruction
preconditions remain guarded even if passed a constrained identity feature.
Graph/reference/storage/AEOS selectors, SO and the deployed website/custom
matchers retain their separate admission work. AEON clone/pointer references
remain structural paths. Recursive/root-matching extensions are not introduced.

The source playground's existing trusted activation mode also stays closed;
this constrained policy is exercised through the library APIs. This development
candidate does not allocate release versions, promote spec/CTS contracts or make
an official release. Performance targets remain unchanged and JavaScript heap
qualification remains explicitly deferred/unqualified.
