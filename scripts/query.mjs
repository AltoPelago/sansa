#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateQuery, parseQuery } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const defaultFixturePath = resolve(root, 'fixtures', 'query-inventory.json');

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

function buildNamespace(fixture) {
  const rootBinding = fixture.root ?? fixture;
  return {
    root: rootBinding,
    children: (binding) => binding.children ?? [],
    attributeSpace: (binding) => binding.attributeSpace ?? binding.attributes,
    localSpace: (binding, name) => binding.localSpaces?.[name],
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
      binding: summarizeBinding(entry.binding),
      value: summarizeQueryValue(entry.value),
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
      console.error(`${error.code}${location}: ${error.message}`);
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
      return [`${sourceBinding.address ?? '<binding>'} = ${JSON.stringify(value.value)}`];
    case 'object':
      return [`${sourceBinding.address ?? '<binding>'} = ${JSON.stringify(value.value)}`];
    case 'bindingSet':
      if (value.bindings.length === 0) return [`${sourceBinding.address ?? '<binding>'} -> (empty)`];
      return value.bindings.map((binding) => {
        const scalar = scalarFromBinding(binding);
        return scalar.ok
          ? `${binding.address ?? '<binding>'} = ${JSON.stringify(scalar.value)}`
          : `${binding.address ?? '<binding>'}`;
      });
    default:
      return [`${sourceBinding.address ?? '<binding>'} = ${JSON.stringify(value)}`];
  }
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

function summarizeQuery(query) {
  return {
    canonical: query.canonical,
    clauses: query.clauses,
    from: query.from.address.canonical,
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

function summarizeBinding(binding) {
  const scalar = scalarFromBinding(binding);
  return {
    ...(binding.address === undefined ? {} : { address: binding.address }),
    ...(binding.name === undefined ? {} : { name: binding.name }),
    ...(binding.index === undefined ? {} : { index: binding.index }),
    ...(binding.semanticType === undefined ? {} : { semanticType: binding.semanticType }),
    ...(binding.representationKind === undefined ? {} : { representationKind: binding.representationKind }),
    ...(scalar.ok ? { value: scalar.value } : {}),
  };
}

function scalarFromBinding(binding) {
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
      --mode <mode>         evaluate or parse. Defaults to evaluate.
      --format <format>     text or json. Defaults to text.
  -h, --help                Show this help.
`);
}
