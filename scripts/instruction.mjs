#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lowerInstruction, parseInstruction, planInstruction, validateMutationPlanTarget } from '../src/index.js';
import { namespaceFromAeonSource, namespaceFromJsonSource } from '../tools/query-web/runtime.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const defaultFixturePath = resolve(root, 'fixtures', 'query-inventory.json');

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const source = readInstructionSource(args);
if (!source.trim()) {
  console.error('SANSA Instruction tool error: expected instruction source via --instruction, --instruction-file, or stdin.');
  process.exit(2);
}

const mode = args.mode ?? 'lower';
const format = args.format ?? 'text';
if (!['parse', 'lower', 'plan'].includes(mode)) {
  console.error(`SANSA Instruction tool error: unsupported --mode '${mode}'. Expected 'parse', 'lower', or 'plan'.`);
  process.exit(2);
}
if (!['text', 'json'].includes(format)) {
  console.error(`SANSA Instruction tool error: unsupported --format '${format}'. Expected 'text' or 'json'.`);
  process.exit(2);
}
if (args.target !== undefined && !['aeon', 'json', 'json-compatible', 'telex', 'telex.aes'].includes(args.target)) {
  console.error(`SANSA Instruction tool error: unsupported --target '${args.target}'. Expected 'aeon', 'json', 'json-compatible', 'telex', or 'telex.aes'.`);
  process.exit(2);
}
if (args.target !== undefined && mode !== 'plan') {
  console.error('SANSA Instruction tool error: --target is only available with --mode plan.');
  process.exit(2);
}

let result;
let fixturePath;
let targetResult;
if (mode === 'parse') {
  result = parseInstruction(source);
} else {
  fixturePath = resolve(args.fixture ?? defaultFixturePath);
  const loaded = await readNamespaceFixture(fixturePath, args.fixtureKind);
  if (!loaded.ok) process.exit(2);
  result = mode === 'plan'
    ? planInstruction(source, loaded.namespace)
    : lowerInstruction(source, loaded.namespace);
  if (mode === 'plan' && result.ok && args.target !== undefined) {
    targetResult = validateMutationPlanTarget(result.plan, args.target);
    if (!targetResult.ok) {
      result = {
        ok: false,
        phase: 'target',
        loweredRequest: result.loweredRequest,
        errors: targetResult.errors,
      };
    }
  }
}

if (format === 'json') {
  console.log(JSON.stringify(formatJsonResult(result, mode, fixturePath, args.target, targetResult), null, 2));
} else {
  printTextResult(result, mode, fixturePath, args.target, targetResult);
}

process.exit(result.ok ? 0 : 1);

function parseArgs(raw) {
  const output = {};
  for (let index = 0; index < raw.length; index += 1) {
    const arg = raw[index];
    if (arg === '--help' || arg === '-h') {
      output.help = true;
    } else if (arg === '--instruction' || arg === '-i') {
      output.instruction = requireValue(raw, ++index, arg);
    } else if (arg === '--instruction-file') {
      output.instructionFile = requireValue(raw, ++index, arg);
    } else if (arg === '--fixture' || arg === '-f') {
      output.fixture = requireValue(raw, ++index, arg);
    } else if (arg === '--fixture-kind') {
      output.fixtureKind = requireValue(raw, ++index, arg);
    } else if (arg === '--format') {
      output.format = requireValue(raw, ++index, arg);
    } else if (arg === '--mode') {
      output.mode = requireValue(raw, ++index, arg);
    } else if (arg === '--target') {
      output.target = requireValue(raw, ++index, arg);
    } else {
      console.error(`SANSA Instruction tool error: unknown argument '${arg}'.`);
      process.exit(2);
    }
  }
  return output;
}

function requireValue(raw, index, flag) {
  const value = raw[index];
  if (!value || value.startsWith('--')) {
    console.error(`SANSA Instruction tool error: ${flag} expects a value.`);
    process.exit(2);
  }
  return value;
}

function readInstructionSource(options) {
  if (typeof options.instruction === 'string') return options.instruction;
  if (typeof options.instructionFile === 'string') return readFileSync(resolve(options.instructionFile), 'utf8');
  if (!process.stdin.isTTY) return readFileSync(0, 'utf8');
  return '';
}

async function readNamespaceFixture(path, explicitKind) {
  const kind = inferFixtureKind(path, explicitKind);
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    console.error(`SANSA Instruction tool error: could not read fixture '${path}': ${error.message}`);
    return { ok: false };
  }

  if (kind === 'json') {
    const result = namespaceFromJsonSource(source);
    if (result.ok) return { ok: true, namespace: namespaceWithParents(result.namespace) };
    console.error(`SANSA Instruction tool error: could not parse JSON fixture '${path}':`);
    console.error(result.text ?? renderDiagnostics(result.errors ?? []));
    return { ok: false };
  }

  const result = await namespaceFromAeonSource(source);
  if (!result.ok) {
    console.error(`SANSA Instruction tool error: could not compile AEON fixture '${path}':`);
    console.error(result.text ?? renderDiagnostics(result.errors ?? []));
    return { ok: false };
  }
  return { ok: true, namespace: namespaceWithParents(result.namespace) };
}

function namespaceWithParents(namespace) {
  const rootBinding = typeof namespace.root === 'function' ? namespace.root() : namespace.root;
  attachParents(rootBinding);
  return {
    ...namespace,
    parent: namespace.parent ?? ((binding) => binding.parent),
  };
}

function attachParents(binding) {
  if (!binding || typeof binding !== 'object') return;
  for (const child of binding.children ?? []) {
    child.parent = binding;
    attachParents(child);
  }
  const attributeSpace = binding.attributeSpace ?? binding.attributes;
  if (attributeSpace && typeof attributeSpace === 'object') {
    attributeSpace.parent = binding;
    attachParents(attributeSpace);
  }
  for (const localSpace of Object.values(binding.localSpaces ?? {})) {
    if (localSpace && typeof localSpace === 'object') {
      localSpace.parent = binding;
      attachParents(localSpace);
    }
  }
}

function inferFixtureKind(path, explicitKind) {
  if (explicitKind !== undefined) {
    if (explicitKind === 'json' || explicitKind === 'aeon') return explicitKind;
    console.error(`SANSA Instruction tool error: unsupported --fixture-kind '${explicitKind}'. Expected 'json' or 'aeon'.`);
    process.exit(2);
  }
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.aeon')) return 'aeon';
  console.error(`SANSA Instruction tool error: could not infer fixture kind from '${path}'. Use --fixture-kind json or --fixture-kind aeon.`);
  process.exit(2);
}

function printTextResult(result, mode, fixturePath, target, targetResult) {
  if (!result.ok) {
    console.error(renderDiagnostics(result.errors));
    return;
  }
  if (mode === 'parse') {
    console.log(result.instruction.canonical);
    return;
  }
  if (mode === 'lower') {
    console.log(renderLoweredRequest(result.request));
    return;
  }
  console.log(`fixture: ${fixturePath}`);
  console.log(renderLoweredRequest(result.loweredRequest));
  console.log(renderPlanSummary(result.plan));
  if (target !== undefined) {
    console.log(`target: ${targetResult?.ok ? `${target} ok` : `${target} failed`}`);
  }
}

function formatJsonResult(result, mode, fixturePath, target, targetResult) {
  if (!result.ok) {
    return {
      ok: false,
      mode,
      ...(target === undefined ? {} : { target }),
      ...(result.phase === undefined ? {} : { phase: result.phase }),
      errors: result.errors,
      ...(result.loweredRequest === undefined ? {} : { loweredRequest: result.loweredRequest }),
    };
  }
  if (mode === 'parse') return result;
  if (mode === 'lower') return result;
  return {
    ok: true,
    mode,
    fixture: fixturePath,
    loweredRequest: result.loweredRequest,
    plan: summarizePlan(result.plan),
    ...(target === undefined ? {} : { target, targetResult }),
    diagnostics: result.diagnostics,
    warnings: result.warnings,
  };
}

function renderLoweredRequest(request) {
  const operations = Array.isArray(request)
    ? request
    : Array.isArray(request?.operations)
      ? request.operations
      : [request];
  const lines = operations.map((operation, index) => {
    const prefix = operations.length > 1 ? `${index + 1}. ` : '';
    return `${prefix}${renderRequestedOperation(operation)}`;
  });
  if (Array.isArray(request?.preconditions) && request.preconditions.length > 0) {
    lines.push(...request.preconditions.map((precondition, index) => {
      const prefix = request.preconditions.length > 1 ? `${index + 1}. ` : '';
      return `${prefix}require ${precondition.expression}${precondition.target === undefined ? '' : ` at ${precondition.target}`}`;
    }));
  }
  return lines.join('\n');
}

function renderRequestedOperation(operation) {
  switch (operation.op) {
    case 'create':
      return `create ${appendMember(operation.parent, operation.name)} = ${renderValue(operation.value)}${renderHints(operation)}`;
    case 'replace':
      return `replace ${operation.target} = ${renderValue(operation.value)}${renderHints(operation)}`;
    case 'remove':
      return `remove ${operation.target}`;
    case 'insert':
      return `insert ${operation.placement.kind ?? operation.placement} in ${operation.container} = ${renderValue(operation.value)}${renderHints(operation)}`;
    case 'move':
      return `move ${operation.source} ${operation.placement.kind ?? operation.placement} in ${operation.container}`;
    default:
      return JSON.stringify(operation);
  }
}

function renderPlanSummary(plan) {
  const lines = [
    `plan: ${plan.operations.length} operation${plan.operations.length === 1 ? '' : 's'}`,
    ...plan.operations.map((operation, index) => `${index + 1}. ${renderPlannedOperation(operation)}`),
  ];
  if (plan.sourceProvenance?.reason !== undefined || plan.sourceProvenance?.claimedAuthor !== undefined) {
    lines.push('provenance:');
    if (plan.sourceProvenance.reason !== undefined) lines.push(`because ${JSON.stringify(plan.sourceProvenance.reason)}`);
    if (plan.sourceProvenance.claimedAuthor !== undefined) lines.push(`by ${JSON.stringify(plan.sourceProvenance.claimedAuthor)}`);
  }
  return lines.join('\n');
}

function renderPlannedOperation(operation) {
  switch (operation.op) {
    case 'create':
      return `create ${appendMember(operation.parent.canonicalAddress, operation.name)} = ${renderValue(operation.value)}${renderHints(operation)}`;
    case 'replace':
      return `replace ${operation.target.canonicalAddress} = ${renderValue(operation.value)}${renderHints(operation)}`;
    case 'remove':
      return `remove ${operation.target.canonicalAddress}`;
    case 'insert':
      return `insert ${operation.placement.kind} in ${operation.container.canonicalAddress} = ${renderValue(operation.value)}${renderHints(operation)}`;
    case 'move':
      return `move ${operation.source.canonicalAddress} ${operation.placement.kind} in ${operation.container.canonicalAddress}`;
    default:
      return JSON.stringify(summarizeOperation(operation));
  }
}

function summarizePlan(plan) {
  return {
    type: plan.type,
    planVersion: plan.planVersion,
    planId: plan.planId,
    operations: plan.operations.map(summarizeOperation),
    preconditions: plan.preconditions.map((precondition) => ({
      expression: precondition.expression,
      canonical: precondition.canonical,
      target: precondition.target?.canonicalAddress,
    })),
    diagnostics: plan.diagnostics,
    portabilityWarnings: plan.portabilityWarnings,
    sourceProvenance: plan.sourceProvenance,
  };
}

function summarizeOperation(operation) {
  switch (operation.op) {
    case 'create':
      return {
        op: 'create',
        parent: operation.parent.canonicalAddress,
        name: operation.name,
        value: operation.value,
        ...hintFields(operation),
      };
    case 'replace':
      return {
        op: 'replace',
        target: operation.target.canonicalAddress,
        value: operation.value,
        ...hintFields(operation),
      };
    case 'remove':
      return { op: 'remove', target: operation.target.canonicalAddress };
    case 'insert':
      return {
        op: 'insert',
        container: operation.container.canonicalAddress,
        placement: summarizePlacement(operation.placement),
        value: operation.value,
        ...hintFields(operation),
      };
    case 'move':
      return {
        op: 'move',
        source: operation.source.canonicalAddress,
        container: operation.container.canonicalAddress,
        placement: summarizePlacement(operation.placement),
      };
    default:
      return { op: operation.op };
  }
}

function summarizePlacement(placement) {
  if (placement.kind === 'first' || placement.kind === 'last') return placement.kind;
  return { kind: placement.kind, anchor: placement.anchor.canonicalAddress };
}

function renderHints(operation) {
  const hints = [];
  if (operation.datatype) hints.push(`datatype:${operation.datatype}`);
  if (operation.kind) hints.push(`kind:${operation.kind}`);
  return hints.length === 0 ? '' : ` (${hints.join(', ')})`;
}

function hintFields(operation) {
  return {
    ...(operation.datatype === undefined ? {} : { datatype: operation.datatype }),
    ...(operation.kind === undefined ? {} : { kind: operation.kind }),
  };
}

function renderValue(value) {
  return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value);
}

function appendMember(parent, name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    ? `${parent}.${name}`
    : `${parent}.[${JSON.stringify(name)}]`;
}

function renderDiagnostics(errors) {
  return (errors ?? []).map((error) => {
    const phase = error.phase ? ` [${error.phase}]` : '';
    const details = diagnosticDetails(error);
    return `${error.code}${phase}${details}: ${error.message}`;
  }).join('\n');
}

function diagnosticDetails(error) {
  const parts = [];
  if (error.candidateAddress) parts.push(`at ${error.candidateAddress}`);
  if (Number.isInteger(error.operationIndex)) parts.push(`operation ${error.operationIndex}`);
  if (typeof error.targetFormat === 'string') parts.push(`target ${error.targetFormat}`);
  if (typeof error.datatype === 'string') parts.push(`datatype ${error.datatype}`);
  if (typeof error.valuePath === 'string') parts.push(`value ${error.valuePath}`);
  return parts.length === 0 ? '' : ` (${parts.join(', ')})`;
}

function printHelp() {
  console.log(`SANSA Instruction tool

Usage:
  sansa-instruction --instruction <source> [--mode parse|lower|plan]
  sansa-instruction --instruction-file <path> [--fixture <path>]
  cat instruction.sansa | sansa-instruction --mode plan

Options:
  -i, --instruction <source>       Instruction source string.
      --instruction-file <path>    Read instruction source from a file.
  -f, --fixture <path>             JSON or AEON fixture for lower/plan modes.
                                   Defaults to fixtures/query-inventory.json.
      --fixture-kind <kind>        Force fixture kind: json or aeon.
      --mode <mode>                parse, lower, or plan. Defaults to lower.
      --target <target>            Validate plan target: aeon, json, json-compatible, telex, or telex.aes.
                                   Only available with --mode plan.
      --format <format>            text or json. Defaults to text.
  -h, --help                       Show this help.
`);
}
