# Conformance Claims

This directory records the CTS snapshots claimed by the standalone SANSA
implementation package.

`cts-claims.json` is machine-readable implementation metadata. It identifies the
exact CTS snapshot ids that the package claims, plus the local command used to
run each lane.

Validate the claim file against the sibling CTS checkout with:

```bash
npm run validate:cts-claims
```

Claims marked `experimental` are implemented prototype or proposal-stage slices.
They are useful for tracking progress, but they are not part of the default
stable SANSA conformance claim while those specification surfaces remain
proposal-stage.
