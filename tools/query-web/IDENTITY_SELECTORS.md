# Child identities in the Query workbench (candidate)

Read-only Query sources and address expressions accept authored child identities:

```aeon
group\g\:object = { child\c\:string = "hello" }
```

```sansa
from $.\g\ select .\c\
```

The result retains `$.group.child`. This is child traversal, not a global ID
lookup. AEON identity queries project complete portable occurrence topology,
including distinct NodeLiteral/NodeHead IDs and explicit attribute spaces.
Ordinary queries and the default `namespaceFromAeonSource` helper retain their
existing native adapter behavior. The helper's opt-in `{identityAware: true}`
uses the same projection as identity-containing queries. An incompatible runtime
fails explicitly; identity-looking text inside a quoted string is not an opt-in.

Telex and the existing Film reader expose declared portable record identities.
The browser offers AEON, Telex and JSON inputs; no Film editor or writer is added.
JSON fixture `identity` fields remain opaque and do not grant structural identity
capability. Params authored as AEON expose declared IDs in the params local space
when used by an identity query. Existing local-space navigation remains in place.

The Identity inspections control maps to `budget.maxIdentityInspections` in the
existing workbench request, then to Query's `resolve.maxIdentityInspections`.
Default 10,000; nonnegative safe integers only. One query shares its counter
across clauses, candidates, repeated reads and params. Misses and absent IDs cost
inspections; failure discards all results. JSON output retains diagnostic limit,
observed and authored-identity context. Existing other budget fields keep their
previous behavior. A new request starts fresh.

Trusted `path(...)` activation, Instruction and mutation do not gain identity
admission. AEON reference targets and canonical storage/event paths stay
structural. There is no new recursive/root selector or global index.

Use a compatible installed AEON Core/AES package in the calling project, or the
existing `SANSA_AEON_CORE_MODULE` / `SANSA_AEON_AES_MODULE` overrides. The development
sibling layout also works. Run `npm run query:web` and open the printed localhost
URL. These are local candidate capabilities; official release, final dependency
pins, independent review and remaining platform checks are separate work. No new
performance qualification is claimed; retained JS heap remains deferred.
