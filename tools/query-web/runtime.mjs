import { evaluateQuery, parseQuery } from '../../src/index.js';

const aeonCoreUrl = new URL('../../../aeon/implementations/typescript/packages/core/dist/index.js', import.meta.url);

export function parseQueryForWorkbench(querySource) {
  const result = parseQuery(querySource);
  if (!result.ok) {
    return {
      ok: false,
      mode: 'parse',
      errors: normalizeDiagnostics(result.errors),
    };
  }

  return {
    ok: true,
    mode: 'parse',
    text: result.query.canonical,
    query: summarizeQuery(result.query),
  };
}

export async function evaluateQueryForWorkbench({ sourceKind, source, query }) {
  const namespaceResult = sourceKind === 'json'
    ? namespaceFromJsonSource(source)
    : await namespaceFromAeonSource(source);

  if (!namespaceResult.ok) {
    return namespaceResult;
  }

  const result = evaluateQuery(query, namespaceResult.namespace);
  if (!result.ok) {
    return {
      ok: false,
      mode: 'evaluate',
      sourceKind,
      errors: normalizeDiagnostics(result.errors),
      sourceDiagnostics: namespaceResult.diagnostics,
    };
  }

  return {
    ok: true,
    mode: 'evaluate',
    sourceKind,
    count: result.results.length,
    text: renderTextResults(result.results),
    results: result.results.map((entry) => ({
      type: entry.type,
      ...(entry.address === undefined ? {} : { address: entry.address }),
      binding: summarizeBinding(entry.binding),
      value: summarizeQueryValue(entry.value),
    })),
    sourceDiagnostics: namespaceResult.diagnostics,
  };
}

function namespaceFromJsonSource(source) {
  try {
    const fixture = JSON.parse(source);
    const root = fixture.root ?? fixture;
    return {
      ok: true,
      namespace: {
        root,
        children: (binding) => binding.children ?? [],
        attributeSpace: (binding) => binding.attributeSpace ?? binding.attributes,
        localSpace: (binding, name) => binding.localSpaces?.[name],
      },
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      mode: 'evaluate',
      sourceKind: 'json',
      errors: [{
        code: 'SANSA_QUERY_WORKBENCH_INVALID_JSON',
        message: error.message,
      }],
    };
  }
}

async function namespaceFromAeonSource(source) {
  let aeonCore;
  try {
    aeonCore = await import(aeonCoreUrl.href);
  } catch (error) {
    return {
      ok: false,
      mode: 'evaluate',
      sourceKind: 'aeon',
      errors: [{
        code: 'SANSA_QUERY_WORKBENCH_AEON_RUNTIME_UNAVAILABLE',
        message: `Could not load AEON TypeScript core build: ${error.message}`,
      }],
    };
  }

  const compiled = aeonCore.compile(source, {
    datatypePolicy: 'allow_custom',
    mode: 'custom',
    recovery: false,
  });

  if (compiled.errors.length > 0) {
    return {
      ok: false,
      mode: 'evaluate',
      sourceKind: 'aeon',
      errors: compiled.errors.map(normalizeAeonError),
    };
  }

  return {
    ok: true,
    namespace: buildNamespaceFromEvents(compiled.events, aeonCore.formatPath),
    diagnostics: [],
  };
}

function buildNamespaceFromEvents(events, formatPath) {
  const root = {
    address: '$',
    representationKind: 'object',
    children: [],
  };
  const byAddress = new Map([['$', root]]);

  for (const event of events) {
    const address = formatPath(event.path);
    const parentAddress = parentPathAddress(event.path, formatPath);
    const parent = byAddress.get(parentAddress) ?? root;
    const segment = event.path.segments[event.path.segments.length - 1];
    const binding = byAddress.get(address) ?? {
      address,
      children: [],
    };

    if (segment?.type === 'member') binding.name = segment.key;
    if (segment?.type === 'index') binding.index = segment.index;
    binding.semanticType = event.datatype ?? semanticTypeFromValue(event.value);
    binding.representationKind = representationKindFromValue(event.value);
    binding.scalarKind = scalarKindFromValue(event.value);
    const nullReason = nullReasonFromValue(event.value);
    if (nullReason !== undefined) binding.nullReason = nullReason;

    const scalar = scalarFromAeonValue(event.value);
    if (scalar.ok) binding.value = scalar.value;

    if (event.annotations?.size) {
      binding.attributeSpace = buildAttributeSpace(address, event.annotations);
    }

    if (!byAddress.has(address)) {
      byAddress.set(address, binding);
      parent.children.push(binding);
    }
  }

  return {
    root,
    children: (binding) => binding.children ?? [],
    attributeSpace: (binding) => binding.attributeSpace,
    localSpace: (binding, name) => binding.localSpaces?.[name],
  };
}

function parentPathAddress(path, formatPath) {
  if (path.segments.length <= 1) return '$';
  return formatPath({ segments: path.segments.slice(0, -1) });
}

function buildAttributeSpace(ownerAddress, annotations) {
  return {
    address: `${ownerAddress}.@`,
    representationKind: 'attributeSpace',
    children: [...annotations.entries()].map(([name, entry]) => {
      const binding = {
        name,
        address: appendMember(`${ownerAddress}.@`, name),
        semanticType: entry.datatype ?? semanticTypeFromValue(entry.value),
        representationKind: representationKindFromValue(entry.value),
        scalarKind: scalarKindFromValue(entry.value),
        children: [],
      };
      const nullReason = nullReasonFromValue(entry.value);
      if (nullReason !== undefined) binding.nullReason = nullReason;
      const scalar = scalarFromAeonValue(entry.value);
      if (scalar.ok) binding.value = scalar.value;
      if (entry.annotations?.size) {
        binding.attributeSpace = buildAttributeSpace(binding.address, entry.annotations);
      }
      return binding;
    }),
  };
}

function appendMember(base, name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    ? `${base}.${name}`
    : `${base}.[${JSON.stringify(name)}]`;
}

function semanticTypeFromValue(value) {
  switch (value.type) {
    case 'StringLiteral':
      return 'string';
    case 'NumberLiteral':
      return 'number';
    case 'InfinityLiteral':
      return 'infinity';
    case 'NaNLiteral':
      return 'nan';
    case 'BooleanLiteral':
      return 'boolean';
    case 'NullLiteral':
      return 'null';
    case 'SansaAddressLiteral':
      return 'sansa';
    default:
      return undefined;
  }
}

function representationKindFromValue(value) {
  switch (value.type) {
    case 'TypedValue':
      return representationKindFromValue(value.value);
    case 'ObjectNode':
      return 'object';
    case 'ListNode':
      return 'list';
    case 'TupleLiteral':
      return 'tuple';
    case 'NodeLiteral':
      return 'node';
    case 'StringLiteral':
    case 'DateLiteral':
    case 'DateTimeLiteral':
    case 'TimeLiteral':
    case 'HexLiteral':
    case 'RadixLiteral':
    case 'EncodingLiteral':
    case 'SeparatorLiteral':
    case 'SansaAddressLiteral':
      return 'string';
    case 'NumberLiteral':
    case 'InfinityLiteral':
    case 'NaNLiteral':
      return 'number';
    case 'BooleanLiteral':
      return 'boolean';
    case 'NullLiteral':
      return 'null';
    case 'ToggleLiteral':
      return 'toggle';
    case 'CloneReference':
      return 'cloneReference';
    case 'PointerReference':
      return 'pointerReference';
    default:
      return value.type;
  }
}

function scalarFromAeonValue(value) {
  switch (value.type) {
    case 'TypedValue':
      return scalarFromAeonValue(value.value);
    case 'StringLiteral':
    case 'DateLiteral':
    case 'DateTimeLiteral':
    case 'TimeLiteral':
    case 'HexLiteral':
    case 'RadixLiteral':
    case 'EncodingLiteral':
    case 'SeparatorLiteral':
      return { ok: true, value: value.value };
    case 'SansaAddressLiteral':
      return { ok: true, value: value.canonical ?? value.value };
    case 'NumberLiteral':
      return { ok: true, value: Number(value.value) };
    case 'InfinityLiteral':
      return { ok: true, value: value.value === '-Infinity' ? -Infinity : Infinity };
    case 'NaNLiteral':
      return { ok: true, value: Number.NaN };
    case 'BooleanLiteral':
      return { ok: true, value: value.value };
    case 'ToggleLiteral':
      return { ok: true, value: value.value };
    case 'NullLiteral':
      return { ok: true, value: null };
    default:
      return { ok: false };
  }
}

function scalarKindFromValue(value) {
  switch (value.type) {
    case 'TypedValue':
      return scalarKindFromValue(value.value);
    case 'NullLiteral':
      return 'null';
    case 'InfinityLiteral':
      return 'infinity';
    case 'NaNLiteral':
      return 'nan';
    default:
      return undefined;
  }
}

function nullReasonFromValue(value) {
  switch (value.type) {
    case 'TypedValue':
      return nullReasonFromValue(value.value);
    case 'NullLiteral':
      return value.value;
    default:
      return undefined;
  }
}

function renderTextResults(results) {
  if (results.length === 0) return '(no results)';
  return results.flatMap((entry) => renderQueryValueLines(entry.value, entry.binding)).join('\n');
}

function renderQueryValueLines(value, sourceBinding) {
  switch (value.type) {
    case 'scalar':
    case 'object':
      return [`${sourceBinding.address ?? '<binding>'} = ${JSON.stringify(sanitizeJsonValue(value.value))}`];
    case 'bindingSet':
      if (value.bindings.length === 0) return [`${sourceBinding.address ?? '<binding>'} -> (empty)`];
      return value.bindings.map((binding) => {
        const scalar = scalarFromBinding(binding);
        return scalar.ok
          ? `${binding.address ?? '<binding>'} = ${JSON.stringify(sanitizeJsonValue(scalar.value))}`
          : `${binding.address ?? '<binding>'}`;
      });
    default:
      return [`${sourceBinding.address ?? '<binding>'} = ${JSON.stringify(value)}`];
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

function summarizeQueryValue(value) {
  switch (value.type) {
    case 'bindingSet':
      return {
        type: value.type,
        bindings: value.bindings.map(summarizeBinding),
      };
    case 'scalar':
    case 'object':
      return sanitizeJsonValue(value);
    default:
      return sanitizeJsonValue(value);
  }
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
  if (Object.hasOwn(binding, 'value')) return { ok: true, value: binding.value };
  if (Object.hasOwn(binding, 'scalar')) return { ok: true, value: binding.scalar };
  return { ok: false };
}

function normalizeDiagnostics(errors) {
  return errors.map((error) => ({
    code: error.code,
    message: error.message,
    ...(typeof error.phase === 'string' ? { phase: error.phase } : {}),
    ...(typeof error.candidateAddress === 'string' ? { candidateAddress: error.candidateAddress } : {}),
    ...(Number.isInteger(error.index) ? { index: error.index } : {}),
    ...(Number.isInteger(error.selectorIndex) ? { selectorIndex: error.selectorIndex } : {}),
  }));
}

function normalizeAeonError(error) {
  return {
    code: error.code ?? error.name ?? 'AEON_ERROR',
    message: error.message,
    ...(error.span ? {
      span: {
        start: error.span.start,
        end: error.span.end,
      },
    } : {}),
  };
}

function sanitizeJsonValue(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(sanitizeJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeJsonValue(entry)]));
  }
  return value;
}
