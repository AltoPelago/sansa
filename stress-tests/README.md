# SANSA Stress Tests

Stress tests are implementation-owned hardening inputs. They are broader than CTS and can grow quickly as new parser combinations are discovered.

The initial address stress surface uses two `---`-separated case files:

- `address/valid.sansa-cases`
- `address/invalid.sansa-cases`

Each non-empty case is parsed as a single SANSA address expression. Comments may appear on their own lines with `//`.

Run:

```bash
npm run stress
```

Valid cases must parse. Invalid cases must fail closed.

