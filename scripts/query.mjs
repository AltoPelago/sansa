#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateQuery, parseQuery } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const defaultFixturePath = resolve(root, 'fixtures', 'query-inventory.json');
const QUERY_VALUE_METADATA_PROPERTY = '__sansaQueryValueMetadata';
const QUERY_OBJECT_FIELD_METADATA_PROPERTY = '__sansaObjectFieldMetadata';

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const querySource = readQuerySource(args);
if (!querySource.trim()) {
  console.error('SANSA Query tool error: expected query source via --query, --query-file, or stdin.');
  process.exit(2);
}

const fixturePath = resolve(args.fixture ?? defaultFixturePath);
const fixture = readJson(fixturePath);
const namespace = buildNamespace(fixture);
const paramsBinding = readParamsBinding(args);
if (paramsBinding) {
  mountParamsLocalSpace(namespace.root, paramsBinding);
}
const mode = args.mode ?? 'evaluate';
const format = args.format ?? 'text';

if (!['evaluate', 'parse'].includes(mode)) {
  console.error(`SANSA Query tool error: unsupported --mode '${mode}'. Expected 'evaluate' or 'parse'.`);
  process.exit(2);
}
if (!['text', 'json'].includes(format)) {
  console.error(`SANSA Query tool error: unsupported --format '${format}'. Expected 'text' or 'json'.`);
  process.exit(2);
}

const result = mode === 'parse'
  ? parseQuery(querySource)
  : evaluateQuery(querySource, namespace);

if (format === 'json') {
  console.log(JSON.stringify(formatJsonResult(result, mode, fixturePath), null, 2));
} else {
  printTextResult(result, mode, fixturePath);
}

process.exit(result.ok ? 0 : 1);

function parseArgs(raw) {
  const output = {};
  for (let index = 0; index < raw.length; index += 1) {
    const arg = raw[index];
    if (arg === '--help' || arg === '-h') {
      output.help = true;
    } else if (arg === '--query' || arg === '-q') {
      output.query = requireValue(raw, ++index, arg);
    } else if (arg === '--query-file') {
      output.queryFile = requireValue(raw, ++index, arg);
    } else if (arg === '--fixture' || arg === '-f') {
      output.fixture = requireValue(raw, ++index, arg);
    } else if (arg === '--params') {
      output.params = requireValue(raw, ++index, arg);
    } else if (arg === '--params-file') {
      output.paramsFile = requireValue(raw, ++index, arg);
    } else if (arg === '--format') {
      output.format = requireValue(raw, ++index, arg);
    } else if (arg === '--mode') {
      output.mode = requireValue(raw, ++index, arg);
    } else {
      console.error(`SANSA Query tool error: unknown argument '${arg}'.`);
      process.exit(2);
    }
  }
  return output;
}

function requireValue(raw, index, flag) {
  const value = raw[index];
  if (!value || value.startsWith('--')) {
    console.error(`SANSA Query tool error: ${flag} expects a value.`);
    process.exit(2);
  }
  return value;
}

function readQuerySource(options) {
  if (typeof options.query === 'string') return options.query;
  if (typeof options.queryFile === 'string') return readFileSync(resolve(options.queryFile), 'utf8');
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8');
  return '';
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`SANSA Query tool error: could not read fixture '${path}': ${error.message}`);
    process.exit(2);
  }
}

function readParamsBinding(options) {
  if (typeof options.params === 'string' && typeof options.paramsFile === 'string') {
    console.error('SANSA Query tool error: use either --params or --params-file, not both.');
    process.exit(2);
  }
  try {
    const source = typeof options.params === 'string'
      ? options.params
      : typeof options.paramsFile === 'string'
        ? readFileSync(resolve(options.paramsFile), 'utf8')
        : undefined;
    if (source === undefined) return undefined;
    return normalizeParamsPayload(JSON.parse(source));
  } catch (error) {
    const origin = typeof options.paramsFile === 'string'
      ? ` from '${resolve(options.paramsFile)}'`
      : '';
    console.error(`SANSA Query tool error: could not read params${origin}: ${error.message}`);
    process.exit(2);
  }
}

function normalizeParamsPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('expected a JSON object.');
  }
  if (Array.isArray(payload.children)) {
    return normalizeFixtureBinding(payload, '$.<"params">');
  }
  return {
    address: '$.<"params">',
    representationKind: 'object',
    children: Object.entries(payload).map(([name, value]) => normalizeParamEntry(name, value)),
  };
}

function normalizeParamEntry(name, value) {
  const address = `$.<"params">.${renderParamMember(name)}`;
  if (isSansaAddressLiteralValue(value)) {
    return {
      name,
      address,
      semanticType: 'sansa',
      representationKind: 'sansa',
      value,
    };
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && isFixtureBindingShape(value)) {
    return normalizeFixtureBinding({ ...value, name: value.name ?? name }, address);
  }
  return {
    name,
    address,
    semanticType: semanticTypeForParamValue(value),
    representationKind: representationKindForParamValue(value),
    value,
  };
}

function normalizeFixtureBinding(binding, fallbackAddress) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new Error('expected params binding objects.');
  }
  const normalized = {
    ...binding,
    address: binding.address ?? fallbackAddress,
  };
  if (Array.isArray(binding.children)) {
    normalized.children = binding.children.map((child, index) => {
      const childAddress = child && typeof child === 'object' && typeof child.name === 'string'
        ? `${normalized.address}.${renderParamMember(child.name)}`
        : child && typeof child === 'object' && Number.isInteger(child.index)
          ? `${normalized.address}[${child.index}]`
          : `${normalized.address}[${index}]`;
      const explicitAddress = child && typeof child === 'object' && !Array.isArray(child)
        ? child.address
        : undefined;
      return normalizeFixtureBinding(child, explicitAddress ?? childAddress);
    });
  }
  return normalized;
}

function isFixtureBindingShape(value) {
  return (
    Object.hasOwn(value, 'value') ||
    Object.hasOwn(value, 'scalar') ||
    Object.hasOwn(value, 'children') ||
    Object.hasOwn(value, 'attributeSpace') ||
    Object.hasOwn(value, 'attributes') ||
    Object.hasOwn(value, 'localSpaces') ||
    Object.hasOwn(value, 'semanticType') ||
    Object.hasOwn(value, 'representationKind')
  );
}

function isSansaAddressLiteralValue(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.type === 'SansaAddressLiteral' &&
    typeof value.address === 'string'
  );
}

function renderParamMember(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    ? name
    : `[${JSON.stringify(name)}]`;
}

function semanticTypeForParamValue(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'list';
  return 'object';
}

function representationKindForParamValue(value) {
  return semanticTypeForParamValue(value);
}

function mountParamsLocalSpace(rootBinding, paramsBinding) {
  if (!rootBinding || typeof rootBinding !== 'object') {
    console.error('SANSA Query tool error: params require a fixture root binding object.');
    process.exit(2);
  }
  rootBinding.localSpaces = {
    ...(rootBinding.localSpaces ?? {}),
    params: paramsBinding,
  };
}

function buildNamespace(fixture) {
  const rootBinding = fixture.root ?? fixture;
  return {
    root: rootBinding,
    children: (binding) => binding.children ?? [],
    attributeSpace: (binding) => binding.attributeSpace ?? binding.attributes,
    localSpace: (binding, name) => binding.localSpaces?.[name],
    value: valueFromBinding,
  };
}

function formatJsonResult(result, mode, fixturePath) {
  if (!result.ok) {
    return {
      ok: false,
      mode,
      fixture: fixturePath,
      errors: result.errors,
    };
  }
  if (mode === 'parse') {
    return {
      ok: true,
      mode,
      fixture: fixturePath,
      query: summarizeQuery(result.query),
    };
  }
  return {
    ok: true,
    mode,
    fixture: fixturePath,
    count: result.results.length,
    results: result.results.map((entry) => ({
      type: entry.type,
      ...(entry.address === undefined ? {} : { address: entry.address }),
      binding: summarizeBinding(entry.binding),
      value: sanitizeJsonValue(summarizeQueryValue(entry.value)),
    })),
  };
}

function printTextResult(result, mode, fixturePath) {
  if (!result.ok) {
    console.error(`SANSA Query ${mode} failed (${fixturePath})`);
    for (const error of result.errors) {
      const location = Number.isInteger(error.index)
        ? ` at index ${error.index}`
        : Number.isInteger(error.selectorIndex)
          ? ` at selector ${error.selectorIndex}`
          : '';
      const phase = typeof error.phase === 'string' ? ` [${error.phase}]` : '';
      const candidate = typeof error.candidateAddress === 'string' ? ` at ${error.candidateAddress}` : '';
      console.error(`${error.code}${phase}${candidate}${location}: ${error.message}`);
    }
    return;
  }

  if (mode === 'parse') {
    console.log(result.query.canonical);
    return;
  }

  if (result.results.length === 0) {
    console.log('(no results)');
    return;
  }

  for (const entry of result.results) {
    for (const line of renderQueryValueLines(entry.value, entry.binding)) {
      console.log(line);
    }
  }
}

function renderQueryValueLines(value, sourceBinding) {
  switch (value.type) {
    case 'scalar':
      return [`${sourceBinding.address ?? '<binding>'} = ${renderAeonValue(value.value, value[QUERY_VALUE_METADATA_PROPERTY])}`];
    case 'object':
      return [`${sourceBinding.address ?? '<binding>'} = ${renderAeonValue(value.value, undefined, value.value?.[QUERY_OBJECT_FIELD_METADATA_PROPERTY])}`];
    case 'bindingSet':
      if (value.bindings.length === 0) return [`${sourceBinding.address ?? '<binding>'} -> (empty)`];
      return value.bindings.map((binding) => {
        const scalar = scalarFromBinding(binding);
        return scalar.ok
          ? `${binding.address ?? '<binding>'} = ${renderAeonValue(scalar.value, scalarMetadataFromBinding(binding))}`
          : `${binding.address ?? '<binding>'}`;
      });
    default:
      return [`${sourceBinding.address ?? '<binding>'} = ${renderAeonValue(value)}`];
  }
}

function renderAeonValue(value, metadata, fieldMetadata) {
  if ((metadata?.kind === 'null' || value === null) && typeof metadata?.nullReason === 'string') {
    return `!${metadata.nullReason}`;
  }
  if (metadata?.kind === 'nan' || (typeof value === 'number' && Number.isNaN(value))) return 'NaN';
  if (metadata?.kind === 'infinity' || value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => renderAeonValue(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).map(([key, entry]) => (
      `${JSON.stringify(key)}:${renderAeonValue(entry, fieldMetadata?.[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function scalarMetadataFromBinding(binding) {
  const metadata = {};
  const kind = binding.scalarKind ?? binding.valueKind ?? binding.literalKind ?? binding.representationKind ?? binding.kind ?? binding.type;
  if (typeof kind === 'string') metadata.kind = lowerFirst(kind);
  if (binding.nullReason !== undefined) metadata.nullReason = binding.nullReason;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function lowerFirst(value) {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}

function summarizeQueryValue(value) {
  switch (value.type) {
    case 'bindingSet':
      return {
        type: value.type,
        bindings: value.bindings.map(summarizeBinding),
      };
    case 'scalar':
    case 'object':
      return value;
    default:
      return value;
  }
}

function valueFromBinding(binding) {
  if (binding.scalarKind === 'nan') return Number.NaN;
  if (binding.scalarKind === 'infinity') {
    return binding.value === '-Infinity' || binding.scalar === '-Infinity' ? -Infinity : Infinity;
  }
  if (Object.hasOwn(binding, 'value')) return binding.value;
  if (Object.hasOwn(binding, 'scalar')) return binding.scalar;
  return undefined;
}

function sanitizeJsonValue(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(sanitizeJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeJsonValue(entry)]));
  }
  return value;
}

function summarizeQuery(query) {
  return {
    canonical: query.canonical,
    clauses: query.clauses,
    from: summarizeQueryFrom(query.from),
    ...(query.where ? { where: query.where.expression } : {}),
    ...(query.orderBy ? {
      orderBy: query.orderBy.keys.map((key) => ({
        expression: key.expression,
        direction: key.direction,
      })),
    } : {}),
    ...(query.offset ? { offset: query.offset.value } : {}),
    ...(query.limit ? { limit: query.limit.value } : {}),
    select: query.select.expression,
  };
}

function summarizeQueryFrom(from) {
  return from.source === 'expression'
    ? from.expression
    : from.address.canonical;
}

function summarizeBinding(binding) {
  const scalar = scalarFromBinding(binding);
  return {
    ...(binding.address === undefined ? {} : { address: binding.address }),
    ...(binding.name === undefined ? {} : { name: binding.name }),
    ...(binding.index === undefined ? {} : { index: binding.index }),
    ...(binding.semanticType === undefined ? {} : { semanticType: binding.semanticType }),
    ...(binding.representationKind === undefined ? {} : { representationKind: binding.representationKind }),
    ...(binding.scalarKind === undefined ? {} : { scalarKind: binding.scalarKind }),
    ...(binding.nullReason === undefined ? {} : { nullReason: binding.nullReason }),
    ...(scalar.ok ? { value: sanitizeJsonValue(scalar.value) } : {}),
  };
}

function scalarFromBinding(binding) {
  const value = valueFromBinding(binding);
  if (value !== undefined) return { ok: true, value };
  if (Object.hasOwn(binding, 'value')) return { ok: true, value: binding.value };
  if (Object.hasOwn(binding, 'scalar')) return { ok: true, value: binding.scalar };
  return { ok: false };
}

function printHelp() {
  console.log(`SANSA Query tool

Usage:
  npm run query -- --query "from $.inventory.items.*\\nselect .sku"
  npm run query -- --query-file query.sansaq --fixture fixture.json
  npm run query -- --mode parse --query "from $.inventory.items.*\\nselect .sku"

Options:
  -q, --query <source>      Query source.
      --query-file <path>   Read query source from a file.
  -f, --fixture <path>      JSON namespace fixture. Defaults to fixtures/query-inventory.json.
      --params <json>       Mount JSON params at $.<"params">.
      --params-file <path>  Read JSON params and mount them at $.<"params">.
      --mode <mode>         evaluate or parse. Defaults to evaluate.
      --format <format>     text or json. Defaults to text.
  -h, --help                Show this help.
`);
}
