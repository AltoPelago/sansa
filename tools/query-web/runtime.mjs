import { evaluateQuery, parseQuery } from '../../src/index.js';

const aeonCoreUrl = new URL('../../../aeon/implementations/typescript/packages/core/dist/index.js', import.meta.url);
const QUERY_VALUE_METADATA_PROPERTY = '__sansaQueryValueMetadata';
const QUERY_OBJECT_FIELD_METADATA_PROPERTY = '__sansaObjectFieldMetadata';

export function parseQueryForWorkbench(querySource) {
  const result = parseQuery(querySource);
  if (!result.ok) {
    const errors = normalizeDiagnostics(result.errors);
    return {
      ok: false,
      mode: 'parse',
      text: renderDiagnosticText(errors),
      errors,
    };
  }

  return {
    ok: true,
    mode: 'parse',
    text: result.query.canonical,
    inspect: renderQueryInspect(result.query),
    query: summarizeQuery(result.query),
  };
}

export async function evaluateQueryForWorkbench({ sourceKind, source, query, paramsSource = '' }) {
  const namespaceResult = sourceKind === 'json'
    ? namespaceFromJsonSource(source)
    : await namespaceFromAeonSource(source);

  if (!namespaceResult.ok) {
    return namespaceResult;
  }

  const mounted = await mountParamsLocalSpace(namespaceResult.namespace, paramsSource);
  if (!mounted.ok) {
    return {
      ...mounted,
      sourceKind,
    };
  }

  const sourceDiagnostics = [
    ...(namespaceResult.diagnostics ?? []),
    ...(mounted.diagnostics ?? []),
  ];

  const result = evaluateQuery(query, mounted.namespace);
  if (!result.ok) {
    const errors = normalizeDiagnostics(result.errors);
    return {
      ok: false,
      mode: 'evaluate',
      sourceKind,
      text: renderDiagnosticText(errors),
      errors,
      sourceDiagnostics,
    };
  }

  return {
    ok: true,
    mode: 'evaluate',
    sourceKind,
    count: result.results.length,
    text: renderTextResults(result.results),
    inspect: renderInspectResults(result.results),
    results: result.results.map((entry) => ({
      type: entry.type,
      ...(entry.address === undefined ? {} : { address: entry.address }),
      binding: summarizeBinding(entry.binding),
      value: summarizeQueryValue(entry.value),
    })),
    sourceDiagnostics,
  };
}

export function namespaceFromJsonSource(source) {
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
      text: renderDiagnosticText([{
        code: 'SANSA_QUERY_WORKBENCH_INVALID_JSON',
        message: error.message,
      }]),
      errors: [{
        code: 'SANSA_QUERY_WORKBENCH_INVALID_JSON',
        message: error.message,
      }],
    };
  }
}

export async function namespaceFromAeonSource(source) {
  let aeonCore;
  try {
    aeonCore = await import(aeonCoreUrl.href);
  } catch (error) {
    const errors = [{
      code: 'SANSA_QUERY_WORKBENCH_AEON_RUNTIME_UNAVAILABLE',
      message: `Could not load AEON TypeScript core build: ${error.message}`,
    }];
    return {
      ok: false,
      mode: 'evaluate',
      sourceKind: 'aeon',
      text: renderDiagnosticText(errors),
      errors,
    };
  }

  const compiled = aeonCore.compile(source, {
    datatypePolicy: 'allow_custom',
    mode: 'custom',
    recovery: false,
  });

  if (compiled.errors.length > 0) {
    const errors = compiled.errors.map(normalizeAeonError);
    return {
      ok: false,
      mode: 'evaluate',
      sourceKind: 'aeon',
      text: renderDiagnosticText(errors),
      errors,
    };
  }

  return {
    ok: true,
    namespace: buildNamespaceFromEvents(compiled.events, aeonCore.formatPath),
    diagnostics: [],
  };
}

async function mountParamsLocalSpace(namespace, paramsSource) {
  if (String(paramsSource).trim().length === 0) {
    return { ok: true, namespace, diagnostics: [] };
  }

  let aeonCore;
  try {
    aeonCore = await import(aeonCoreUrl.href);
  } catch (error) {
    const errors = [{
      code: 'SANSA_QUERY_WORKBENCH_AEON_RUNTIME_UNAVAILABLE',
      message: `Could not load AEON TypeScript core build for params: ${error.message}`,
    }];
    return {
      ok: false,
      mode: 'evaluate',
      text: renderDiagnosticText(errors),
      errors,
    };
  }

  const compiled = aeonCore.compile(String(paramsSource), {
    datatypePolicy: 'allow_custom',
    mode: 'custom',
    recovery: false,
  });

  if (compiled.errors.length > 0) {
    const errors = compiled.errors.map(normalizeAeonError).map((error) => ({
      ...error,
      code: `PARAMS_${error.code}`,
    }));
    return {
      ok: false,
      mode: 'evaluate',
      text: renderDiagnosticText(errors),
      errors,
    };
  }

  const paramsNamespace = buildNamespaceFromEvents(compiled.events, aeonCore.formatPath);
  const paramsBinding = remapLocalSpaceBinding(paramsNamespace.root, '$.<"params">');
  const root = typeof namespace.root === 'function' ? namespace.root() : namespace.root;
  if (!root) {
    const errors = [{
      code: 'SANSA_QUERY_WORKBENCH_PARAMS_MISSING_ROOT',
      message: 'Cannot mount params local space because the source namespace has no root binding.',
    }];
    return {
      ok: false,
      mode: 'evaluate',
      text: renderDiagnosticText(errors),
      errors,
    };
  }

  root.localSpaces = {
    ...(root.localSpaces ?? {}),
    params: paramsBinding,
  };
  const localSpace = namespace.localSpace;

  return {
    ok: true,
    namespace: {
      ...namespace,
      localSpace: (binding, name) => {
        if (binding === root && name === 'params') return root.localSpaces?.params;
        return localSpace?.(binding, name) ?? binding.localSpaces?.[name];
      },
    },
    diagnostics: [{
      code: 'SANSA_QUERY_WORKBENCH_PARAMS_MOUNTED',
      message: 'Mounted $.<"params"> local space.',
    }],
  };
}

function remapLocalSpaceBinding(binding, targetAddress) {
  return remapBindingTree({
    ...binding,
    address: '$',
    representationKind: binding.representationKind ?? 'object',
  }, '$', targetAddress);
}

function remapBindingTree(binding, sourceBase, targetBase) {
  const address = remapAddress(binding.address, sourceBase, targetBase);
  const output = {
    ...binding,
    address,
    children: (binding.children ?? []).map((child) => remapBindingTree(child, sourceBase, targetBase)),
  };
  if (binding.attributeSpace) {
    output.attributeSpace = remapBindingTree(binding.attributeSpace, sourceBase, targetBase);
  }
  if (binding.localSpaces) {
    output.localSpaces = Object.fromEntries(Object.entries(binding.localSpaces).map(([name, localSpace]) => (
      [name, remapBindingTree(localSpace, sourceBase, targetBase)]
    )));
  }
  return output;
}

function remapAddress(address, sourceBase, targetBase) {
  if (typeof address !== 'string') return address;
  if (address === sourceBase) return targetBase;
  if (address.startsWith(`${sourceBase}.`)) return `${targetBase}${address.slice(sourceBase.length)}`;
  return address;
}

function buildNamespaceFromEvents(events, formatPath) {
  const root = {
    address: '$',
    representationKind: 'object',
    children: [],
  };
  const byAddress = new Map([['$', root]]);
  const parents = new Map([[root, null]]);

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
      binding.attributeSpace = buildAttributeSpace(address, event.annotations, parents, binding);
    }

    if (!byAddress.has(address)) {
      byAddress.set(address, binding);
      parents.set(binding, parent);
      parent.children.push(binding);
    }
  }

  return {
    root,
    children: (binding) => binding.children ?? [],
    attributeSpace: (binding) => binding.attributeSpace,
    localSpace: (binding, name) => binding.localSpaces?.[name],
    parent: (binding) => parents.get(binding) ?? binding.parent,
  };
}

function parentPathAddress(path, formatPath) {
  if (path.segments.length <= 1) return '$';
  return formatPath({ segments: path.segments.slice(0, -1) });
}

function buildAttributeSpace(ownerAddress, annotations, parents, parent) {
  const attributeSpace = {
    address: `${ownerAddress}.@`,
    representationKind: 'attributeSpace',
    children: [],
  };
  parents.set(attributeSpace, parent);
  attributeSpace.children = [...annotations.entries()].map(([name, entry]) => {
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
      binding.attributeSpace = buildAttributeSpace(binding.address, entry.annotations, parents, binding);
    }
    parents.set(binding, attributeSpace);
    return binding;
  });
  return attributeSpace;
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
      return 'number';
    case 'InfinityLiteral':
      return 'infinity';
    case 'NaNLiteral':
      return 'nan';
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
      return {
        ok: true,
        value: {
          type: 'SansaAddressLiteral',
          address: value.address ?? value.canonical ?? value.value,
          ...(value.canonical === undefined ? {} : { canonical: value.canonical }),
        },
      };
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

function renderQueryInspect(query) {
  return [
    `canonical: ${query.canonical}`,
    `from: ${summarizeQueryFrom(query.from)}`,
    ...(query.where ? [`where: ${query.where.expression}`] : []),
    ...(query.orderBy ? query.orderBy.keys.map((key, index) => (
      `order[${index}]: ${key.expression} ${key.direction}`
    )) : []),
    ...(query.offset ? [`offset: ${query.offset.value}`] : []),
    ...(query.limit ? [`limit: ${query.limit.value}`] : []),
    `select: ${query.select.expression}`,
  ].join('\n');
}

function renderInspectResults(results) {
  if (results.length === 0) return '(no results)';
  return results.map((entry, index) => [
    `Result ${index + 1}`,
    `candidate: ${entry.address ?? entry.binding.address ?? '<binding>'}`,
    ...renderBindingInspectLines(entry.binding, 'candidate'),
    ...renderQueryValueInspectLines(entry.value),
  ].join('\n')).join('\n\n');
}

function renderDiagnosticText(errors) {
  if (errors.length === 0) return '(no diagnostics)';
  return errors.map((error) => {
    const phase = typeof error.phase === 'string' ? ` [${error.phase}]` : '';
    const candidate = typeof error.candidateAddress === 'string' ? ` at ${error.candidateAddress}` : '';
    const location = Number.isInteger(error.index)
      ? ` index ${error.index}`
      : Number.isInteger(error.selectorIndex)
        ? ` selector ${error.selectorIndex}`
        : '';
    return `${error.code}${phase}${candidate}${location}: ${error.message}`;
  }).join('\n');
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
  if (value?.type === 'SansaAddressLiteral') {
    return JSON.stringify(value.canonical ?? value.value ?? value.address?.canonical ?? value.address);
  }
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

function renderQueryValueInspectLines(value) {
  switch (value.type) {
    case 'scalar':
      return [`value: scalar ${JSON.stringify(sanitizeJsonValue(value.value))}`];
    case 'object':
      return [`value: object ${JSON.stringify(sanitizeJsonValue(value.value))}`];
    case 'bindingSet':
      if (value.bindings.length === 0) return ['value: bindingSet (0 bindings)'];
      return [
        `value: bindingSet (${value.bindings.length} binding${value.bindings.length === 1 ? '' : 's'})`,
        ...value.bindings.flatMap((binding) => [
          `- ${binding.address ?? '<binding>'}`,
          ...renderBindingInspectLines(binding, '  binding'),
        ]),
      ];
    default:
      return [`value: ${JSON.stringify(sanitizeJsonValue(value))}`];
  }
}

function renderBindingInspectLines(binding, label) {
  const summary = summarizeBinding(binding);
  return [
    ...(summary.name === undefined ? [] : [`${label}.name: ${summary.name}`]),
    ...(summary.index === undefined ? [] : [`${label}.index: ${summary.index}`]),
    ...(summary.semanticType === undefined ? [] : [`${label}.semanticType: ${summary.semanticType}`]),
    ...(summary.representationKind === undefined ? [] : [`${label}.representationKind: ${summary.representationKind}`]),
    ...(summary.scalarKind === undefined ? [] : [`${label}.scalarKind: ${summary.scalarKind}`]),
    ...(summary.nullReason === undefined ? [] : [`${label}.nullReason: ${summary.nullReason}`]),
    ...(summary.value === undefined ? [] : [`${label}.value: ${JSON.stringify(summary.value)}`]),
  ];
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
