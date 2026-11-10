# Conformance Claims

`aeonic-comparison-claims.json` separately records the unreleased JavaScript
Aeonic comparison baseline against frozen snapshot 0.1. Run
`npm run cts:aeonic-comparison` and validate its claim with
`node scripts/validate-cts-claims.mjs --claims conformance/aeonic-comparison-claims.json`.
The retained report is under `results/`; this claim does not include declared
symbol order, Query integration, the Rust runtime, or a published package release.
The owning specification remains proposal-stage despite the compatibility freeze.

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
