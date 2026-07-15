# SANSA

Shared SANSA address parser and model.

This package is the first implementation slice for SANSA Address. It parses and renders SANSA address expressions without resolving data, evaluating queries, or applying host-specific authorization.

## Current Scope

- root selectors: `$`, `?`
- member selectors: `.name`, `.["quoted.name"]`
- positional selectors: `[0]`
- attribute address-space selector: `.@`
- local address-space selector: `.<"namespace">`
- expansion selectors: `.*`, `.**`
- filters: `#type`, `%kind`
- name pattern selector: `.("pattern")`
- qualified address literals with top-level qualifier unions

Host implementations decide which qualifier surface they accept. This parser accepts the SANSA qualifier grammar and preserves it structurally.

The current API and AST contract is documented in [docs/api-contract.md](docs/api-contract.md).

## API

```js
import { parseAddress, renderAddress } from "@altopelago/sansa";

const result = parseAddress('$.inventory:csv[","]');

if (result.ok) {
  console.log(result.address.canonical);
  console.log(renderAddress(result.address));
}
```
