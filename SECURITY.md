# Security Policy

SANSA includes parsing, address resolution, query evaluation, fixture adapters,
and development tools. Security-sensitive reports should be handled privately
where possible.

## Reporting a vulnerability

- do not open a public GitHub issue for a suspected vulnerability
- prefer GitHub private vulnerability reporting for this repository when it is
  available
- include a minimal reproduction, affected surface, expected impact, and any
  known workarounds

## Good report content

- affected package surface, API, command, or tool
- exact input, address, query, or fixture that triggers the issue
- whether the issue affects parsing, resolution, query evaluation, fixture
  loading, optional AEON runtime integration, or trust boundaries
- whether the behavior is spec, CTS, or implementation specific

## Scope examples

Security-relevant reports may include:

- trust-boundary violations
- unsafe address resolution behavior
- selector or query behavior that escapes an intended host boundary
- parser or evaluator denial-of-service vectors such as pathological inputs or
  unbounded work
- fixture loading or workbench behavior that exposes unintended local data

## Disclosure

Please allow time for triage and mitigation before public disclosure. Once a
fix or mitigation exists, public documentation can follow in the normal repo
history.
