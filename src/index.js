const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const QUALIFIER_ARG_RE = /^[A-Za-z0-9!#$%&*+\-.:;=?@^_|~<>]+$/;
export const SANSA_MAX_POSITION_INDEX = 999_999;
export const SANSA_MAX_QUERY_INTEGER = Number.MAX_SAFE_INTEGER;

const QUERY_VALUE_METADATA_PROPERTY = '__sansaQueryValueMetadata';
const QUERY_OBJECT_FIELD_METADATA_PROPERTY = '__sansaObjectFieldMetadata';

export class SansaParseError extends Error {
  constructor(message, index, code = 'SANSA_PARSE_ERROR') {
    super(message);
    this.name = 'SansaParseError';
    this.code = code;
    this.index = index;
  }
}

export function parseAddress(input, options = {}) {
  try {
    const parser = new AddressParser(input, options);
    const address = parser.parse();
    return { ok: true, address, warnings: parser.warnings };
  } catch (error) {
    if (error instanceof SansaParseError) {
      return {
        ok: false,
        errors: [{
          code: error.code,
          message: error.message,
          index: error.index,
        }],
      };
    }
    throw error;
  }
}

export function parseAddressOrThrow(input, options = {}) {
  const result = parseAddress(input, options);
  if (!result.ok) {
    const first = result.errors[0];
    throw new SansaParseError(first.message, first.index, first.code);
  }
  return result.address;
}

export function parseQuery(input, options = {}) {
  try {
    const parser = new QueryParser(input, options);
    const query = parser.parse();
    return { ok: true, query, warnings: parser.warnings };
  } catch (error) {
    if (error instanceof SansaParseError) {
      return {
        ok: false,
        errors: [{
          code: error.code,
          message: error.message,
          index: error.index,
        }],
      };
    }
    throw error;
  }
}

export function parseQueryOrThrow(input, options = {}) {
  const result = parseQuery(input, options);
  if (!result.ok) {
    const first = result.errors[0];
    throw new SansaParseError(first.message, first.index, first.code);
  }
  return result.query;
}

export function parseQueryExpression(input, options = {}) {
  try {
    const parser = new QueryExpressionParser(input, options);
    const expression = parser.parse();
    return { ok: true, expression, warnings: parser.warnings };
  } catch (error) {
    if (error instanceof SansaParseError) {
      return {
        ok: false,
        errors: [{
          code: error.code,
          message: error.message,
          index: error.index,
        }],
      };
    }
    throw error;
  }
}

export function parseQueryExpressionOrThrow(input, options = {}) {
  const result = parseQueryExpression(input, options);
  if (!result.ok) {
    const first = result.errors[0];
    throw new SansaParseError(first.message, first.index, first.code);
  }
  return result.expression;
}

export function evaluateQuery(input, namespace, options = {}) {
  const parsed = typeof input === 'string' ? parseQuery(input, options.parse) : { ok: true, query: input };
  if (!parsed.ok) {
    return {
      ok: false,
      results: [],
      errors: parsed.errors.map((error) => annotateQueryDiagnostic(error, { phase: 'parse' })),
    };
  }

  const query = parsed.query;
  const from = evaluateQueryFromClause(query.from, namespace, options);
  if (!from.ok) {
    return {
      ok: false,
      results: [],
      errors: from.errors.map((error) => annotateQueryDiagnostic(error, { phase: 'from' })),
    };
  }

  let bindings = from.bindings;
  if (query.where) {
    const filtered = [];
    for (const binding of bindings) {
      const evaluated = evaluateQueryExpressionValue(query.where.ast, binding, namespace, options);
      if (!evaluated.ok) {
        return {
          ok: false,
          results: [],
          errors: [annotateQueryDiagnostic(evaluated.error, {
            phase: 'where',
            candidateAddress: getBindingAddress(binding),
          })],
        };
      }
      const boolean = expectBooleanQueryValue(evaluated.value, namespace);
      if (!boolean.ok) {
        return {
          ok: false,
          results: [],
          errors: [annotateQueryDiagnostic(boolean.error, {
            phase: 'where',
            candidateAddress: getBindingAddress(binding),
          })],
        };
      }
      if (boolean.value) filtered.push(binding);
    }
    bindings = filtered;
  }

  if (query.orderBy) {
    const ordered = orderQueryBindings(query.orderBy, bindings, namespace, options);
    if (!ordered.ok) {
      return {
        ok: false,
        results: [],
        errors: [annotateQueryDiagnostic(ordered.error, { phase: 'order' })],
      };
    }
    bindings = ordered.bindings;
  }

  if (query.offset) bindings = bindings.slice(query.offset.value);
  if (query.limit) bindings = bindings.slice(0, query.limit.value);

  const results = [];
  for (const binding of bindings) {
    const evaluated = evaluateQueryExpressionValue(query.select.ast, binding, namespace, options);
    if (!evaluated.ok) {
      return {
        ok: false,
        results: [],
        errors: [annotateQueryDiagnostic(evaluated.error, {
          phase: 'select',
          candidateAddress: getBindingAddress(binding),
        })],
      };
    }
    results.push({
      type: 'queryResult',
      ...(typeof binding.address === 'string' ? { address: binding.address } : {}),
      binding,
      value: evaluated.value,
    });
  }

  return { ok: true, results, diagnostics: [] };
}

export function resolveAddress(input, namespace, options = {}) {
  const parsed = typeof input === 'string' ? parseAddress(input, options.parse) : { ok: true, address: input };
  if (!parsed.ok) return { ok: false, bindings: [], errors: parsed.errors };

  const rootResult = resolveRoot(parsed.address.root, namespace, options);
  if (!rootResult.ok) return { ok: false, bindings: [], errors: [rootResult.error] };

  let current = [rootResult.binding];
  for (let index = 0; index < parsed.address.selectors.length; index += 1) {
    const selector = parsed.address.selectors[index];
    const selected = applyResolveSelector(selector, current, namespace, index);
    if (!selected.ok) return { ok: false, bindings: [], errors: [selected.error] };
    current = selected.bindings;
    if (current.length === 0) break;
  }

  return { ok: true, bindings: current, diagnostics: [] };
}

export function renderAddress(address) {
  let output = address.root.kind === 'absolute' ? '$' : '?';

  for (const selector of address.selectors) {
    switch (selector.type) {
      case 'member':
        output += IDENTIFIER_RE.test(selector.name)
          ? `.${selector.name}`
          : `.[${quotePayload(selector.name)}]`;
        break;
      case 'position':
        output += `[${selector.index}]`;
        break;
      case 'positionRange':
        output += `[${selector.start ?? ''}..${selector.end ?? ''}]`;
        break;
      case 'parent':
        output += '.^';
        break;
      case 'attributeSpace':
        output += '.@';
        break;
      case 'localSpace':
        output += `.<${quotePayload(selector.name)}>`;
        break;
      case 'directExpansion':
        output += '.*';
        break;
      case 'descendantExpansion':
        output += '.**';
        break;
      case 'namePattern':
        output += `.(${quotePayload(selector.pattern)})`;
        break;
      case 'semanticTypeFilter':
        output += `#${selector.name}`;
        break;
      case 'representationKindFilter':
        output += `%${selector.name}`;
        break;
      default:
        throw new Error(`Unknown selector type: ${selector.type}`);
    }
  }

  if (address.qualifierExpression) {
    output += `:${renderQualifierExpression(address.qualifierExpression)}`;
  }

  return output;
}

export function renderQuery(query) {
  const lines = [`from ${renderQueryFromClause(query.from)}`];
  if (query.where) lines.push(`where ${renderQueryExpression(query.where.ast)}`);
  if (query.orderBy) {
    lines.push(`order by ${query.orderBy.keys.map((key) => `${renderQueryExpression(key.ast)} ${key.direction}`).join(', ')}`);
  }
  if (query.offset) lines.push(`offset ${query.offset.value}`);
  if (query.limit) lines.push(`limit ${query.limit.value}`);
  lines.push(`select ${renderQueryExpression(query.select.ast)}`);
  return lines.join('\n');
}

function renderQueryFromClause(from) {
  return from.source === 'expression'
    ? renderQueryExpression(from.ast)
    : renderAddress(from.address);
}

export function renderQueryExpression(expression) {
  switch (expression.type) {
    case 'literalExpression':
      return expression.kind === 'string' ? quotePayload(expression.value) : String(expression.value);
    case 'currentBindingExpression':
      return '.';
    case 'resolutionExpression':
      return expression.canonical;
    case 'groupExpression':
      return `(${renderQueryExpression(expression.expression)})`;
    case 'unaryExpression':
      return `${expression.operator} ${renderQueryExpression(expression.argument)}`;
    case 'binaryExpression':
      return `${renderQueryExpression(expression.left)} ${expression.operator} ${renderQueryExpression(expression.right)}`;
    case 'functionCallExpression':
      return `${expression.name}(${expression.arguments.map((argument) => renderQueryExpression(argument)).join(', ')})`;
    case 'existenceExpression':
      return `${expression.operator}(${renderQueryExpression(expression.argument)})`;
    case 'cardinalityExpression':
      return `${expression.operator}(${renderQueryExpression(expression.argument)})`;
    case 'projectionExpression':
      return `{ ${expression.fields.map((field) => `${field.name} = ${renderQueryExpression(field.expression)}`).join(' ')} }`;
    default:
      throw new Error(`Unknown query expression type: ${expression.type}`);
  }
}

function resolveRoot(root, namespace, options) {
  if (!namespace || typeof namespace !== 'object') {
    return { ok: false, error: resolveError('SANSA_RESOLVE_EXPECTED_NAMESPACE', 'Expected SANSA resolve namespace') };
  }

  if (root.kind === 'contextual') {
    const contextualRoot = options.contextualRoot ?? namespace.contextualRoot;
    const binding = typeof contextualRoot === 'function' ? contextualRoot() : contextualRoot;
    if (binding) return { ok: true, binding };
    return {
      ok: false,
      error: resolveError('SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT', 'Contextual root requires a contextualRoot binding'),
    };
  }

  const rootBinding = typeof namespace.root === 'function' ? namespace.root() : namespace.root;
  if (rootBinding) return { ok: true, binding: rootBinding };
  return { ok: false, error: resolveError('SANSA_RESOLVE_MISSING_ROOT', 'SANSA resolve namespace does not expose a root binding') };
}

function evaluateQueryFromClause(from, namespace, options) {
  if (from.source !== 'expression') {
    return resolveAddress(from.address, namespace, options.resolve);
  }

  const rootResult = resolveRoot({ kind: 'absolute' }, namespace, options.resolve ?? {});
  if (!rootResult.ok) return { ok: false, bindings: [], errors: [rootResult.error] };

  const evaluated = evaluateQueryExpressionValue(from.ast, rootResult.binding, namespace, options);
  if (!evaluated.ok) return { ok: false, bindings: [], errors: [evaluated.error] };
  if (evaluated.value.type !== 'bindingSet') {
    return {
      ok: false,
      bindings: [],
      errors: [
        queryEvaluateError(
          'SANSA_QUERY_EVALUATE_INVALID_FROM_SOURCE',
          "Dynamic 'from' source expression must evaluate to a Binding Set",
        ),
      ],
    };
  }
  return { ok: true, bindings: evaluated.value.bindings, diagnostics: [] };
}

function evaluateQueryExpressionValue(expression, currentBinding, namespace, options) {
  switch (expression.type) {
    case 'literalExpression':
      return {
        ok: true,
        value: {
          type: 'scalar',
          value: expression.value,
        },
      };
    case 'currentBindingExpression':
      return {
        ok: true,
        value: {
          type: 'bindingSet',
          bindings: [currentBinding],
        },
      };
    case 'resolutionExpression':
      return evaluateResolutionExpression(expression, currentBinding, namespace, options);
    case 'groupExpression':
      return evaluateQueryExpressionValue(expression.expression, currentBinding, namespace, options);
    case 'unaryExpression':
      return evaluateUnaryExpression(expression, currentBinding, namespace, options);
    case 'binaryExpression':
      return evaluateBinaryExpression(expression, currentBinding, namespace, options);
    case 'projectionExpression':
      return evaluateProjectionExpression(expression, currentBinding, namespace, options);
    case 'functionCallExpression':
      return evaluateFunctionCallExpression(expression, currentBinding, namespace, options);
    case 'existenceExpression':
      return evaluateExistenceExpression(expression, currentBinding, namespace, options);
    case 'cardinalityExpression':
      return evaluateCardinalityExpression(expression, currentBinding, namespace, options);
    default:
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_UNSUPPORTED_EXPRESSION', `Unsupported query expression type: ${expression.type}`),
      };
  }
}

function evaluateResolutionExpression(expression, currentBinding, namespace, options) {
  const resolveOptions = {
    ...(options.resolve ?? {}),
    ...(['current', 'contextual'].includes(expression.scope) ? { contextualRoot: currentBinding } : {}),
  };
  const resolved = resolveAddress(expression.address, namespace, resolveOptions);
  if (!resolved.ok) return { ok: false, error: resolved.errors[0] };
  return {
    ok: true,
    value: {
      type: 'bindingSet',
      bindings: resolved.bindings,
    },
  };
}

function evaluateUnaryExpression(expression, currentBinding, namespace, options) {
  const evaluated = evaluateQueryExpressionValue(expression.argument, currentBinding, namespace, options);
  if (!evaluated.ok) return evaluated;
  const boolean = expectBooleanQueryValue(evaluated.value, namespace);
  if (!boolean.ok) return boolean;
  return {
    ok: true,
    value: {
      type: 'scalar',
      value: !boolean.value,
    },
  };
}

function evaluateBinaryExpression(expression, currentBinding, namespace, options) {
  if (expression.operator === 'and' || expression.operator === 'or') {
    return evaluateBooleanBinaryExpression(expression, currentBinding, namespace, options);
  }

  const left = evaluateQueryExpressionValue(expression.left, currentBinding, namespace, options);
  if (!left.ok) return left;
  const right = evaluateQueryExpressionValue(expression.right, currentBinding, namespace, options);
  if (!right.ok) return right;

  if (expression.operator === 'in') {
    return evaluateMembershipExpression(left.value, right.value, namespace);
  }

  const leftScalar = expectScalarQueryValue(left.value, namespace);
  if (!leftScalar.ok) return leftScalar;
  const rightScalar = expectScalarQueryValue(right.value, namespace);
  if (!rightScalar.ok) return rightScalar;
  return compareQueryScalars(expression.operator, leftScalar.value, rightScalar.value);
}

function evaluateMembershipExpression(leftValue, rightValue, namespace) {
  const leftScalar = expectScalarQueryValue(leftValue, namespace);
  if (!leftScalar.ok) return leftScalar;

  if (rightValue.type !== 'bindingSet') {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_COMPARISON', 'Membership right operand must evaluate to a Binding Set'),
    };
  }

  for (const binding of rightValue.bindings) {
    const rightScalar = getBindingScalarValue(namespace, binding);
    if (!rightScalar.ok) return rightScalar;
    const compared = compareQueryScalars('==', leftScalar.value, rightScalar.value);
    if (!compared.ok) return compared;
    if (compared.value.value) {
      return {
        ok: true,
        value: {
          type: 'scalar',
          value: true,
        },
      };
    }
  }

  return {
    ok: true,
    value: {
      type: 'scalar',
      value: false,
    },
  };
}

function evaluateBooleanBinaryExpression(expression, currentBinding, namespace, options) {
  const left = evaluateQueryExpressionValue(expression.left, currentBinding, namespace, options);
  if (!left.ok) return left;
  const leftBoolean = expectBooleanQueryValue(left.value, namespace);
  if (!leftBoolean.ok) return leftBoolean;

  if (expression.operator === 'and' && leftBoolean.value === false) {
    return { ok: true, value: { type: 'scalar', value: false } };
  }
  if (expression.operator === 'or' && leftBoolean.value === true) {
    return { ok: true, value: { type: 'scalar', value: true } };
  }

  const right = evaluateQueryExpressionValue(expression.right, currentBinding, namespace, options);
  if (!right.ok) return right;
  const rightBoolean = expectBooleanQueryValue(right.value, namespace);
  if (!rightBoolean.ok) return rightBoolean;
  return {
    ok: true,
    value: {
      type: 'scalar',
      value: expression.operator === 'and'
        ? leftBoolean.value && rightBoolean.value
        : leftBoolean.value || rightBoolean.value,
    },
  };
}

function evaluateProjectionExpression(expression, currentBinding, namespace, options) {
  const value = {};
  const fieldMetadata = {};
  for (const field of expression.fields) {
    const evaluated = evaluateQueryExpressionValue(field.expression, currentBinding, namespace, options);
    if (!evaluated.ok) return evaluated;
    const metadata = queryValueMetadata(evaluated.value, namespace);
    const unwrapped = unwrapQueryValue(evaluated.value, namespace);
    if (!unwrapped.ok) return unwrapped;
    value[field.name] = unwrapped.value;
    if (metadata) fieldMetadata[field.name] = metadata;
  }
  if (Object.keys(fieldMetadata).length > 0) {
    Object.defineProperty(value, QUERY_OBJECT_FIELD_METADATA_PROPERTY, {
      value: fieldMetadata,
      enumerable: false,
    });
  }
  return {
    ok: true,
    value: {
      type: 'object',
      value,
    },
  };
}

function evaluateFunctionCallExpression(expression, currentBinding, namespace, options) {
  if (isSpecialValuePredicateName(expression.name)) {
    return evaluateSpecialValuePredicate(expression, currentBinding, namespace, options);
  }
  if (expression.name === 'path') {
    return evaluatePathExpression(expression, currentBinding, namespace, options);
  }
  if (expression.name === 'fallback') {
    return evaluateFallbackExpression(expression, currentBinding, namespace, options);
  }
  if (expression.name === 'lookup') {
    return evaluateLookupExpression(expression, currentBinding, namespace, options);
  }
  if (expression.name === 'objectFrom') {
    return evaluateObjectFromExpression(expression, currentBinding, namespace, options);
  }
  if (!isOrdinaryFunctionName(expression.name)) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION', `Function '${expression.name}' is not supported by this evaluator slice`),
    };
  }

  const evaluatedArgs = [];
  for (const argument of expression.arguments) {
    const evaluated = evaluateQueryExpressionValue(argument, currentBinding, namespace, options);
    if (!evaluated.ok) return evaluated;
    const scalar = expectScalarQueryValue(evaluated.value, namespace);
    if (!scalar.ok) return scalar;
    evaluatedArgs.push(scalar.value);
  }

  return evaluateOrdinaryFunction(expression.name, evaluatedArgs);
}

function isOrdinaryFunctionName(name) {
  return ['contains', 'startsWith', 'endsWith', 'lower', 'upper', 'concat'].includes(name);
}

function evaluateOrdinaryFunction(name, evaluatedArgs) {
  switch (name) {
    case 'contains':
      return evaluateStringFunction(name, evaluatedArgs, 2, ([value, search]) => value.includes(search));
    case 'startsWith':
      return evaluateStringFunction(name, evaluatedArgs, 2, ([value, search]) => value.startsWith(search));
    case 'endsWith':
      return evaluateStringFunction(name, evaluatedArgs, 2, ([value, search]) => value.endsWith(search));
    case 'lower':
      return evaluateStringFunction(name, evaluatedArgs, 1, ([value]) => value.toLowerCase());
    case 'upper':
      return evaluateStringFunction(name, evaluatedArgs, 1, ([value]) => value.toUpperCase());
    case 'concat':
      if (evaluatedArgs.length === 0) {
        return {
          ok: false,
          error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'concat' expects at least one argument"),
        };
      }
      return evaluateStringFunction(name, evaluatedArgs, evaluatedArgs.length, (args) => args.join(''));
    default:
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION', `Function '${name}' is not supported by this evaluator slice`),
      };
  }
}

function evaluatePathExpression(expression, currentBinding, namespace, options) {
  if (expression.arguments.length !== 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'path' expects 1 argument"),
    };
  }

  const evaluated = evaluateQueryExpressionValue(expression.arguments[0], currentBinding, namespace, options);
  if (!evaluated.ok) return evaluated;
  const scalar = expectScalarQueryValue(evaluated.value, namespace);
  if (!scalar.ok) return scalar;

  const activated = activateAddressLiteral(scalar.value, options.parse?.address);
  if (!activated.ok) return activated;

  const resolved = resolveAddress(activated.address, namespace, {
    ...(options.resolve ?? {}),
    contextualRoot: currentBinding,
  });
  if (!resolved.ok) return { ok: false, error: resolved.errors[0] };
  return {
    ok: true,
    value: {
      type: 'bindingSet',
      bindings: resolved.bindings,
    },
  };
}

function activateAddressLiteral(value, parseOptions) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL', "Function 'path' expects a SANSA Address Literal value"),
    };
  }

  if (value.type === 'SansaAddress' && value.root && Array.isArray(value.selectors)) {
    return { ok: true, address: value };
  }

  if (value.type !== 'SansaAddressLiteral') {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL', "Function 'path' expects a SANSA Address Literal value"),
    };
  }

  if (value.address && typeof value.address === 'object') {
    return { ok: true, address: value.address };
  }

  const source = typeof value.canonical === 'string'
    ? value.canonical
    : typeof value.source === 'string'
      ? value.source
      : typeof value.address === 'string'
        ? value.address
        : null;
  if (source === null) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL', "Function 'path' expects a structured address literal"),
    };
  }

  const parsed = parseAddress(source, parseOptions);
  if (!parsed.ok) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_PATH_LITERAL', "Function 'path' received an invalid SANSA Address Literal", {
        cause: parsed.errors[0],
      }),
    };
  }
  return { ok: true, address: parsed.address };
}

function evaluateFallbackExpression(expression, currentBinding, namespace, options) {
  if (expression.arguments.length !== 2) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'fallback' expects 2 arguments"),
    };
  }

  const primary = evaluateQueryExpressionValue(expression.arguments[0], currentBinding, namespace, options);
  if (!primary.ok) {
    if (primary.error.code === 'SANSA_QUERY_EVALUATE_MISSING_SCALAR') {
      return evaluateFallbackReplacement(expression.arguments[1], currentBinding, namespace, options);
    }
    return primary;
  }

  const primaryValue = consumeFallbackOperand(primary.value, namespace);
  if (primaryValue.ok) return primaryValue;
  if (primaryValue.missing) {
    return evaluateFallbackReplacement(expression.arguments[1], currentBinding, namespace, options);
  }
  return primaryValue;
}

function evaluateFallbackReplacement(expression, currentBinding, namespace, options) {
  const replacement = evaluateQueryExpressionValue(expression, currentBinding, namespace, options);
  if (!replacement.ok) return replacement;
  const replacementValue = consumeFallbackOperand(replacement.value, namespace);
  if (replacementValue.ok) return replacementValue;
  if (replacementValue.missing) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_MISSING_SCALAR', "Function 'fallback' replacement resolved no scalar value"),
    };
  }
  return replacementValue;
}

function consumeFallbackOperand(value, namespace) {
  if (value.type !== 'bindingSet') {
    return { ok: true, value };
  }
  if (value.bindings.length === 0) {
    return { ok: false, missing: true };
  }
  if (value.bindings.length > 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', "Function 'fallback' expected one binding but resolved multiple bindings"),
    };
  }
  const scalar = getBindingScalarValue(namespace, value.bindings[0]);
  if (!scalar.ok) return scalar;
  return scalarQueryValue(scalar.value, scalar.metadata);
}

function evaluateLookupExpression(expression, currentBinding, namespace, options) {
  if (expression.arguments.length !== 2) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'lookup' expects 2 arguments"),
    };
  }

  const baseResolution = unwrapResolutionExpression(expression.arguments[0]);
  if (!baseResolution) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'lookup' expects a resolution expression base"),
    };
  }

  const base = evaluateResolutionExpression(baseResolution, currentBinding, namespace, options);
  if (!base.ok) return base;
  if (base.value.bindings.length === 0) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_MISSING_SCALAR', "Function 'lookup' expected one base binding but resolved none"),
    };
  }
  if (base.value.bindings.length > 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', "Function 'lookup' expected one base binding but resolved multiple bindings"),
    };
  }

  const key = evaluateQueryExpressionValue(expression.arguments[1], currentBinding, namespace, options);
  if (!key.ok) return key;
  const keyScalar = expectScalarQueryValue(key.value, namespace);
  if (!keyScalar.ok) return keyScalar;

  let bindings;
  if (typeof keyScalar.value === 'string') {
    bindings = selectMember(namespace, base.value.bindings[0], keyScalar.value);
  } else if (Number.isInteger(keyScalar.value) && keyScalar.value >= 0) {
    bindings = selectPosition(namespace, base.value.bindings[0], keyScalar.value);
  } else {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'lookup' expects a string member key or non-negative integer position key"),
    };
  }

  if (bindings.length > 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', "Function 'lookup' target resolved multiple bindings"),
    };
  }

  return {
    ok: true,
    value: {
      type: 'bindingSet',
      bindings,
    },
  };
}

function evaluateObjectFromExpression(expression, currentBinding, namespace, options) {
  if (expression.arguments.length !== 2) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'objectFrom' expects 2 arguments"),
    };
  }

  const keyResolution = unwrapResolutionExpression(expression.arguments[0]);
  const valueResolution = unwrapResolutionExpression(expression.arguments[1]);
  if (!keyResolution || !valueResolution) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'objectFrom' expects resolution expression arguments"),
    };
  }

  const keys = evaluateResolutionExpression(keyResolution, currentBinding, namespace, options);
  if (!keys.ok) return keys;
  const values = evaluateResolutionExpression(valueResolution, currentBinding, namespace, options);
  if (!values.ok) return values;

  if (keys.value.bindings.length !== values.value.bindings.length) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', "Function 'objectFrom' expected key and value binding sets with equal length"),
    };
  }

  const output = {};
  const fieldMetadata = {};
  for (let index = 0; index < keys.value.bindings.length; index += 1) {
    const keyScalar = getBindingScalarValue(namespace, keys.value.bindings[index]);
    if (!keyScalar.ok) return keyScalar;
    if (typeof keyScalar.value !== 'string') {
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'objectFrom' expects string key bindings"),
      };
    }
    if (Object.hasOwn(output, keyScalar.value)) {
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', `Function 'objectFrom' received duplicate key '${keyScalar.value}'`),
      };
    }

    const valueScalar = getBindingScalarValue(namespace, values.value.bindings[index]);
    if (!valueScalar.ok) return valueScalar;
    output[keyScalar.value] = valueScalar.value;
    if (valueScalar.metadata) fieldMetadata[keyScalar.value] = valueScalar.metadata;
  }

  if (Object.keys(fieldMetadata).length > 0) {
    Object.defineProperty(output, QUERY_OBJECT_FIELD_METADATA_PROPERTY, {
      value: fieldMetadata,
      enumerable: false,
    });
  }
  return {
    ok: true,
    value: {
      type: 'object',
      value: output,
    },
  };
}

function isSpecialValuePredicateName(name) {
  return ['isValue', 'isNull', 'isNullReason', 'isNaN', 'isInfinity'].includes(name);
}

function evaluateSpecialValuePredicate(expression, currentBinding, namespace, options) {
  const arity = expression.name === 'isNullReason' ? 2 : 1;
  if (expression.arguments.length !== arity) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', `Function '${expression.name}' expects ${arity} argument${arity === 1 ? '' : 's'}`),
    };
  }

  if (expression.name === 'isValue') {
    return evaluateIsValuePredicate(expression.arguments[0], currentBinding, namespace, options);
  }

  const bindingInfo = evaluateSingleBindingArgument(expression.name, expression.arguments[0], currentBinding, namespace, options);
  if (!bindingInfo.ok) return bindingInfo;

  switch (expression.name) {
    case 'isNull':
      return scalarBoolean(isExplicitNullScalar(bindingInfo));
    case 'isNullReason': {
      const reason = evaluateQueryExpressionValue(expression.arguments[1], currentBinding, namespace, options);
      if (!reason.ok) return reason;
      const scalarReason = expectScalarQueryValue(reason.value, namespace);
      if (!scalarReason.ok) return scalarReason;
      if (typeof scalarReason.value !== 'string') {
        return {
          ok: false,
          error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'isNullReason' expects a string reason"),
        };
      }
      return scalarBoolean(isExplicitNullScalar(bindingInfo) && bindingInfo.nullReason === scalarReason.value);
    }
    case 'isNaN':
      return scalarBoolean(isNanScalar(bindingInfo));
    case 'isInfinity':
      return scalarBoolean(isInfinityScalar(bindingInfo));
    default:
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION', `Function '${expression.name}' is not supported by this evaluator slice`),
      };
  }
}

function evaluateIsValuePredicate(argument, currentBinding, namespace, options) {
  const evaluated = evaluateQueryExpressionValue(argument, currentBinding, namespace, options);
  if (!evaluated.ok) {
    if (evaluated.error.code === 'SANSA_QUERY_EVALUATE_MISSING_SCALAR') return scalarBoolean(false);
    return evaluated;
  }
  return evaluateIsValueQueryValue(evaluated.value, namespace);
}

function evaluateIsValueQueryValue(value, namespace) {
  if (value.type === 'scalar') {
    return scalarBoolean(isOrdinaryValueScalar({
      value: value.value,
      ...(value[QUERY_VALUE_METADATA_PROPERTY]?.kind === undefined ? {} : { kind: value[QUERY_VALUE_METADATA_PROPERTY].kind }),
    }));
  }
  if (value.type === 'object') return scalarBoolean(false);
  if (value.type !== 'bindingSet') {
    return scalarBoolean(false);
  }
  if (value.bindings.length === 0) return scalarBoolean(false);
  if (value.bindings.length > 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', "Function 'isValue' expected one binding but resolved multiple bindings"),
    };
  }

  const scalar = getBindingScalarInfo(namespace, value.bindings[0]);
  if (!scalar.ok) {
    if (scalar.error.code === 'SANSA_QUERY_EVALUATE_MISSING_SCALAR') return scalarBoolean(false);
    return scalar;
  }
  return scalarBoolean(isOrdinaryValueScalar(scalar));
}

function evaluateSingleBindingArgument(name, argument, currentBinding, namespace, options) {
  const resolution = unwrapResolutionExpression(argument);
  if (!resolution) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', `Function '${name}' expects a resolution expression`),
    };
  }
  const evaluated = evaluateResolutionExpression(resolution, currentBinding, namespace, options);
  if (!evaluated.ok) return evaluated;
  if (evaluated.value.bindings.length === 0) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_MISSING_SCALAR', `Function '${name}' expected one binding but resolved none`),
    };
  }
  if (evaluated.value.bindings.length > 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', `Function '${name}' expected one binding but resolved multiple bindings`),
    };
  }
  const scalar = getBindingScalarInfo(namespace, evaluated.value.bindings[0]);
  if (!scalar.ok) return scalar;
  return scalar;
}

function isExplicitNullScalar(info) {
  return info.kind === 'null' || info.value === null;
}

function isNanScalar(info) {
  return info.kind === 'nan' || (typeof info.value === 'number' && Number.isNaN(info.value));
}

function isInfinityScalar(info) {
  return info.kind === 'infinity' || info.value === Infinity || info.value === -Infinity;
}

function isOrdinaryValueScalar(info) {
  if (isExplicitNullScalar(info) || isNanScalar(info) || isInfinityScalar(info)) return false;
  if (typeof info.value === 'number') return Number.isFinite(info.value);
  return typeof info.value === 'string' || typeof info.value === 'boolean';
}

function scalarBoolean(value) {
  return scalarQueryValue(value);
}

function scalarQueryValue(value, metadata) {
  const output = {
    type: 'scalar',
    value,
  };
  if (metadata) {
    Object.defineProperty(output, QUERY_VALUE_METADATA_PROPERTY, {
      value: metadata,
      enumerable: false,
    });
  }
  return {
    ok: true,
    value: output,
  };
}

function evaluateStringFunction(name, args, arity, operation) {
  if (args.length !== arity) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', `Function '${name}' expects ${arity} argument${arity === 1 ? '' : 's'}`),
    };
  }
  if (args.some((arg) => typeof arg !== 'string')) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', `Function '${name}' expects string arguments`),
    };
  }
  return {
    ok: true,
    value: {
      type: 'scalar',
      value: operation(args),
    },
  };
}

function evaluateExistenceExpression(expression, currentBinding, namespace, options) {
  const resolution = unwrapResolutionExpression(expression.argument);
  if (!resolution) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_EXISTENCE_ARGUMENT', 'Existence operators require a resolution expression'),
    };
  }

  const resolved = evaluateResolutionExpression(resolution, currentBinding, namespace, options);
  if (!resolved.ok) return resolved;
  const hasBindings = resolved.value.bindings.length > 0;
  return {
    ok: true,
    value: {
      type: 'scalar',
      value: expression.operator === 'exists' ? hasBindings : !hasBindings,
    },
  };
}

function unwrapResolutionExpression(expression) {
  if (expression.type === 'groupExpression') return unwrapResolutionExpression(expression.expression);
  return expression.type === 'resolutionExpression' ? expression : null;
}

function evaluateCardinalityExpression(expression, currentBinding, namespace, options) {
  const booleans = evaluateCardinalityBooleans(expression.argument, currentBinding, namespace, options);
  if (!booleans.ok) return booleans;
  const value = (() => {
    switch (expression.operator) {
      case 'any': return booleans.values.some(Boolean);
      case 'all': return booleans.values.every(Boolean);
      case 'none': return booleans.values.every((entry) => !entry);
      default: return false;
    }
  })();
  return {
    ok: true,
    value: {
      type: 'scalar',
      value,
    },
  };
}

function evaluateCardinalityBooleans(expression, currentBinding, namespace, options) {
  if (expression.type === 'groupExpression') {
    return evaluateCardinalityBooleans(expression.expression, currentBinding, namespace, options);
  }

  if (expression.type === 'resolutionExpression') {
    const resolved = evaluateResolutionExpression(expression, currentBinding, namespace, options);
    if (!resolved.ok) return resolved;
    const values = [];
    for (const binding of resolved.value.bindings) {
      const scalar = getBindingScalarValue(namespace, binding);
      if (!scalar.ok) return scalar;
      if (typeof scalar.value !== 'boolean') {
        return {
          ok: false,
          error: queryEvaluateError('SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN', 'Cardinality resolution operands must expose Boolean scalar values'),
        };
      }
      values.push(scalar.value);
    }
    return { ok: true, values };
  }

  if (expression.type === 'functionCallExpression') {
    return evaluateCardinalityFunctionBooleans(expression, currentBinding, namespace, options);
  }

  if (expression.type !== 'binaryExpression' || ['and', 'or'].includes(expression.operator)) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT', 'Cardinality operators require a resolution predicate in this evaluator slice'),
    };
  }

  const left = evaluateQueryExpressionValue(expression.left, currentBinding, namespace, options);
  if (!left.ok) return left;
  const right = evaluateQueryExpressionValue(expression.right, currentBinding, namespace, options);
  if (!right.ok) return right;

  const leftIsSet = left.value.type === 'bindingSet';
  const rightIsSet = right.value.type === 'bindingSet';

  if (leftIsSet === rightIsSet) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT', 'Cardinality comparison predicates require exactly one binding-set side'),
    };
  }

  const setValue = leftIsSet ? left.value : right.value;
  const scalarValue = leftIsSet
    ? expectScalarQueryValue(right.value, namespace)
    : expectScalarQueryValue(left.value, namespace);
  if (!scalarValue.ok) return scalarValue;

  const values = [];
  for (const binding of setValue.bindings) {
    const bindingScalar = getBindingScalarValue(namespace, binding);
    if (!bindingScalar.ok) return bindingScalar;
    const compared = leftIsSet
      ? compareQueryScalars(expression.operator, bindingScalar.value, scalarValue.value)
      : compareQueryScalars(expression.operator, scalarValue.value, bindingScalar.value);
    if (!compared.ok) return compared;
    values.push(compared.value.value);
  }
  return { ok: true, values };
}

function evaluateCardinalityFunctionBooleans(expression, currentBinding, namespace, options) {
  if (!isOrdinaryFunctionName(expression.name)) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_UNSUPPORTED_FUNCTION', `Function '${expression.name}' is not supported by this evaluator slice`),
    };
  }

  const evaluatedArgs = [];
  for (const argument of expression.arguments) {
    const evaluated = evaluateQueryExpressionValue(argument, currentBinding, namespace, options);
    if (!evaluated.ok) return evaluated;
    evaluatedArgs.push(evaluated.value);
  }

  const bindingSetArgs = evaluatedArgs
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value.type === 'bindingSet');
  if (bindingSetArgs.length !== 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_CARDINALITY_ARGUMENT', 'Cardinality function predicates require exactly one binding-set argument'),
    };
  }

  const scalarArgs = [];
  for (let index = 0; index < evaluatedArgs.length; index += 1) {
    if (index === bindingSetArgs[0].index) {
      scalarArgs.push(null);
      continue;
    }
    const scalar = expectScalarQueryValue(evaluatedArgs[index], namespace);
    if (!scalar.ok) return scalar;
    scalarArgs.push(scalar.value);
  }

  const values = [];
  for (const binding of bindingSetArgs[0].value.bindings) {
    const bindingScalar = getBindingScalarValue(namespace, binding);
    if (!bindingScalar.ok) return bindingScalar;
    const args = scalarArgs.slice();
    args[bindingSetArgs[0].index] = bindingScalar.value;
    const evaluated = evaluateOrdinaryFunction(expression.name, args);
    if (!evaluated.ok) return evaluated;
    if (evaluated.value.type !== 'scalar' || typeof evaluated.value.value !== 'boolean') {
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN', 'Cardinality function predicates must evaluate to Boolean scalar values'),
      };
    }
    values.push(evaluated.value.value);
  }
  return { ok: true, values };
}

function orderQueryBindings(orderBy, bindings, namespace, options) {
  const keyed = [];
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    const keys = [];
    for (const key of orderBy.keys) {
      const evaluated = evaluateQueryExpressionValue(key.ast, binding, namespace, options);
      if (!evaluated.ok) {
        return {
          ok: false,
          error: annotateQueryDiagnostic(evaluated.error, { candidateAddress: getBindingAddress(binding) }),
        };
      }
      const scalar = expectScalarQueryValue(evaluated.value, namespace);
      if (!scalar.ok) {
        return {
          ok: false,
          error: annotateQueryDiagnostic(scalar.error, { candidateAddress: getBindingAddress(binding) }),
        };
      }
      if (!['number', 'string'].includes(typeof scalar.value)) {
        return {
          ok: false,
          error: queryEvaluateError(
            'SANSA_QUERY_EVALUATE_INVALID_COMPARISON',
            'Order keys must evaluate to string or number scalar values',
            { candidateAddress: getBindingAddress(binding) },
          ),
        };
      }
      if (typeof scalar.value === 'number' && Number.isNaN(scalar.value)) {
        return {
          ok: false,
          error: queryEvaluateError(
            'SANSA_QUERY_EVALUATE_INVALID_COMPARISON',
            'NaN is not a valid order key',
            { candidateAddress: getBindingAddress(binding) },
          ),
        };
      }
      keys.push({ value: scalar.value, direction: key.direction });
    }
    keyed.push({ binding, keys, index });
  }

  for (let keyIndex = 0; keyIndex < orderBy.keys.length; keyIndex += 1) {
    const expectedType = keyed[0] ? typeof keyed[0].keys[keyIndex].value : null;
    const mismatched = expectedType
      ? keyed.find((entry) => typeof entry.keys[keyIndex].value !== expectedType)
      : undefined;
    if (mismatched) {
      return {
        ok: false,
        error: queryEvaluateError(
          'SANSA_QUERY_EVALUATE_INVALID_COMPARISON',
          'Order keys must evaluate to one scalar type per key position',
          { candidateAddress: getBindingAddress(mismatched.binding) },
        ),
      };
    }
  }

  keyed.sort((left, right) => {
    for (let index = 0; index < left.keys.length; index += 1) {
      const comparison = compareOrderKeyValues(left.keys[index].value, right.keys[index].value);
      if (comparison !== 0) {
        return left.keys[index].direction === 'desc' ? -comparison : comparison;
      }
    }
    return left.index - right.index;
  });

  return {
    ok: true,
    bindings: keyed.map((entry) => entry.binding),
  };
}

function compareOrderKeyValues(left, right) {
  if (typeof left === 'string') return compareStringsByUnicodeScalarValue(left, right);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareStringsByUnicodeScalarValue(left, right) {
  const leftScalars = Array.from(left);
  const rightScalars = Array.from(right);
  const length = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftScalars[index].codePointAt(0);
    const rightCodePoint = rightScalars[index].codePointAt(0);
    if (leftCodePoint < rightCodePoint) return -1;
    if (leftCodePoint > rightCodePoint) return 1;
  }
  if (leftScalars.length < rightScalars.length) return -1;
  if (leftScalars.length > rightScalars.length) return 1;
  return 0;
}

function compareQueryScalars(operator, left, right) {
  if (typeof left !== typeof right) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_COMPARISON', 'Cross-type comparison is not supported by this evaluator slice'),
    };
  }
  if (!['string', 'number', 'boolean'].includes(typeof left)) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_COMPARISON', `Unsupported comparison value type '${typeof left}'`),
    };
  }
  if (typeof left === 'number' && (Number.isNaN(left) || Number.isNaN(right))) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_COMPARISON', 'NaN is not comparable; use isNaN(...) for explicit NaN tests'),
    };
  }
  if (['<', '<=', '>', '>='].includes(operator) && typeof left === 'boolean') {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_COMPARISON', 'Ordering comparison is not defined for Boolean values'),
    };
  }

  const value = (() => {
    switch (operator) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '<': return compareOrderKeyValues(left, right) < 0;
      case '<=': return compareOrderKeyValues(left, right) <= 0;
      case '>': return compareOrderKeyValues(left, right) > 0;
      case '>=': return compareOrderKeyValues(left, right) >= 0;
      default: return false;
    }
  })();
  return { ok: true, value: { type: 'scalar', value } };
}

function expectBooleanQueryValue(value, namespace) {
  if (value.type === 'scalar' && typeof value.value === 'boolean') {
    return { ok: true, value: value.value };
  }
  if (value.type === 'bindingSet') {
    const scalar = expectScalarQueryValue(value, namespace);
    if (!scalar.ok) return scalar;
    if (typeof scalar.value === 'boolean') return { ok: true, value: scalar.value };
  }
  return {
    ok: false,
    error: queryEvaluateError('SANSA_QUERY_EVALUATE_EXPECTED_BOOLEAN', 'Expected Boolean query value'),
  };
}

function expectScalarQueryValue(value, namespace) {
  if (value.type === 'scalar') return { ok: true, value: value.value };
  if (value.type === 'bindingSet') {
    if (value.bindings.length === 0) {
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_MISSING_SCALAR', 'Expected one binding but resolved none'),
      };
    }
    if (value.bindings.length > 1) {
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', 'Expected one binding but resolved multiple bindings'),
      };
    }
    const scalar = getBindingScalarValue(namespace, value.bindings[0]);
    if (!scalar.ok) return scalar;
    return { ok: true, value: scalar.value };
  }
  return {
    ok: false,
    error: queryEvaluateError('SANSA_QUERY_EVALUATE_EXPECTED_SCALAR', 'Expected scalar query value'),
  };
}

function unwrapQueryValue(value, namespace) {
  if (value.type === 'scalar') return { ok: true, value: value.value };
  if (value.type === 'object') return { ok: true, value: value.value };
  return expectScalarQueryValue(value, namespace);
}

function getBindingScalarValue(namespace, binding) {
  const info = getBindingScalarInfo(namespace, binding);
  if (!info.ok) return info;
  return { ok: true, value: info.value, metadata: scalarMetadataFromInfo(info) };
}

function getBindingScalarInfo(namespace, binding) {
  const kind = getBindingScalarKind(namespace, binding);
  const nullReason = getBindingNullReason(namespace, binding);
  if (typeof namespace.value === 'function') {
    return { ok: true, value: namespace.value(binding), kind, nullReason };
  }
  if (Object.hasOwn(binding, 'value')) return { ok: true, value: binding.value, kind, nullReason };
  if (Object.hasOwn(binding, 'scalar')) return { ok: true, value: binding.scalar, kind, nullReason };
  return {
    ok: false,
    error: queryEvaluateError('SANSA_QUERY_EVALUATE_MISSING_SCALAR', 'Binding does not expose a scalar value'),
  };
}

function getBindingScalarKind(namespace, binding) {
  const actual = typeof namespace.representationKind === 'function'
    ? namespace.representationKind(binding)
    : binding.scalarKind ?? binding.valueKind ?? binding.literalKind ?? binding.representationKind ?? binding.kind ?? binding.type;
  if (actual === 'NullLiteral') return 'null';
  if (actual === 'NaNLiteral') return 'nan';
  if (actual === 'InfinityLiteral') return 'infinity';
  return typeof actual === 'string' ? lowerFirst(actual) : undefined;
}

function getBindingNullReason(namespace, binding) {
  if (typeof namespace.nullReason === 'function') return namespace.nullReason(binding);
  return binding.nullReason;
}

function queryValueMetadata(value, namespace) {
  if (value.type === 'scalar') return value[QUERY_VALUE_METADATA_PROPERTY];
  if (value.type !== 'bindingSet' || value.bindings.length !== 1) return undefined;
  const info = getBindingScalarInfo(namespace, value.bindings[0]);
  return info.ok ? scalarMetadataFromInfo(info) : undefined;
}

function scalarMetadataFromInfo(info) {
  const metadata = {};
  if (info.kind !== undefined) metadata.kind = info.kind;
  if (info.nullReason !== undefined) metadata.nullReason = info.nullReason;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function applyResolveSelector(selector, bindings, namespace, selectorIndex) {
  switch (selector.type) {
    case 'member':
      return { ok: true, bindings: bindings.flatMap((binding) => selectMember(namespace, binding, selector.name)) };
    case 'position':
      return { ok: true, bindings: bindings.flatMap((binding) => selectPosition(namespace, binding, selector.index)) };
    case 'positionRange':
      return { ok: true, bindings: bindings.flatMap((binding) => selectPositionRange(namespace, binding, selector.start, selector.end)) };
    case 'parent':
      return selectParents(namespace, bindings, selectorIndex);
    case 'directExpansion':
      return { ok: true, bindings: bindings.flatMap((binding) => getChildren(namespace, binding)) };
    case 'descendantExpansion':
      return { ok: true, bindings: bindings.flatMap((binding) => getDescendants(namespace, binding)) };
    case 'namePattern': {
      const pattern = globPatternToRegExp(selector.pattern);
      return {
        ok: true,
        bindings: bindings.flatMap((binding) => getChildren(namespace, binding).filter((child) => {
          const name = getBindingName(namespace, child);
          return typeof name === 'string' && pattern.test(name);
        })),
      };
    }
    case 'semanticTypeFilter':
      return { ok: true, bindings: bindings.filter((binding) => matchesSemanticType(namespace, binding, selector.name)) };
    case 'representationKindFilter':
      return { ok: true, bindings: bindings.filter((binding) => matchesRepresentationKind(namespace, binding, selector.name)) };
    case 'attributeSpace':
      return selectAttributeSpaces(namespace, bindings, selectorIndex);
    case 'localSpace':
      return selectLocalSpaces(namespace, bindings, selector.name, selectorIndex);
    default:
      return {
        ok: false,
        error: resolveError(
          'SANSA_RESOLVE_UNSUPPORTED_SELECTOR',
          `Unsupported SANSA selector type: ${selector.type}`,
          selectorIndex,
        ),
      };
  }
}

function selectMember(namespace, binding, name) {
  if (typeof namespace.member === 'function') {
    const selected = namespace.member(binding, name);
    return selected ? [selected] : [];
  }
  return getChildren(namespace, binding).filter((child) => getBindingName(namespace, child) === name);
}

function selectPosition(namespace, binding, index) {
  if (typeof namespace.position === 'function') {
    const selected = namespace.position(binding, index);
    return selected ? [selected] : [];
  }
  const children = getChildren(namespace, binding);
  const indexed = children.find((child) => getBindingIndex(namespace, child) === index);
  if (indexed) return [indexed];
  return children[index] ? [children[index]] : [];
}

function selectPositionRange(namespace, binding, start, end) {
  const lower = start ?? 0;
  const upper = end ?? Number.POSITIVE_INFINITY;
  if (lower > upper) return [];

  return getChildren(namespace, binding).filter((child, ordinal) => {
    const explicitIndex = getBindingIndex(namespace, child);
    const position = Number.isInteger(explicitIndex) ? explicitIndex : ordinal;
    return position >= lower && position <= upper;
  });
}

function selectParents(namespace, bindings, selectorIndex) {
  if (typeof namespace.parent === 'function') {
    return { ok: true, bindings: bindings.map((binding) => namespace.parent(binding)).filter(Boolean) };
  }
  if (bindings.some((binding) => Object.prototype.hasOwnProperty.call(binding, 'parent'))) {
    return { ok: true, bindings: bindings.map((binding) => binding.parent).filter(Boolean) };
  }
  if (bindings.length === 0) return { ok: true, bindings: [] };
  return {
    ok: false,
    error: resolveError(
      'SANSA_RESOLVE_UNSUPPORTED_PARENT',
      'The namespace does not expose parent traversal',
      selectorIndex,
    ),
  };
}

function selectAttributeSpaces(namespace, bindings, selectorIndex) {
  if (typeof namespace.attributeSpace !== 'function') {
    const selected = bindings
      .map((binding) => binding.attributeSpace ?? binding.attributes)
      .filter(Boolean);
    if (selected.length > 0 || bindings.length === 0) return { ok: true, bindings: selected };
    return {
      ok: false,
      error: resolveError(
        'SANSA_RESOLVE_UNSUPPORTED_ATTRIBUTE_SPACE',
        'The namespace does not expose attribute address-space traversal',
        selectorIndex,
      ),
    };
  }
  return {
    ok: true,
    bindings: bindings.map((binding) => namespace.attributeSpace(binding)).filter(Boolean),
  };
}

function selectLocalSpaces(namespace, bindings, name, selectorIndex) {
  if (typeof namespace.localSpace !== 'function') {
    return {
      ok: false,
      error: resolveError(
        'SANSA_RESOLVE_UNSUPPORTED_LOCAL_SPACE',
        `The namespace does not expose local address space '${name}'`,
        selectorIndex,
      ),
    };
  }
  return {
    ok: true,
    bindings: bindings.map((binding) => namespace.localSpace(binding, name)).filter(Boolean),
  };
}

function getChildren(namespace, binding) {
  if (typeof namespace.children === 'function') return Array.from(namespace.children(binding) ?? []);
  if (Array.isArray(binding.children)) return binding.children;
  return [];
}

function getDescendants(namespace, binding) {
  const output = [];
  for (const child of getChildren(namespace, binding)) {
    output.push(child, ...getDescendants(namespace, child));
  }
  return output;
}

function getBindingName(namespace, binding) {
  if (typeof namespace.name === 'function') return namespace.name(binding);
  return binding.name ?? binding.key ?? undefined;
}

function getBindingIndex(namespace, binding) {
  if (typeof namespace.index === 'function') return namespace.index(binding);
  return Number.isInteger(binding.index) ? binding.index : undefined;
}

function matchesSemanticType(namespace, binding, expected) {
  if (typeof namespace.semanticTypeMatches === 'function') return namespace.semanticTypeMatches(binding, expected) === true;
  const actual = typeof namespace.semanticType === 'function'
    ? namespace.semanticType(binding)
    : binding.semanticType ?? binding.datatype;
  if (actual === expected) return true;
  return typeof actual === 'string' && datatypeBaseName(actual) === expected;
}

function matchesRepresentationKind(namespace, binding, expected) {
  if (typeof namespace.representationKindMatches === 'function') return namespace.representationKindMatches(binding, expected) === true;
  const actual = typeof namespace.representationKind === 'function'
    ? namespace.representationKind(binding)
    : binding.representationKind ?? binding.kind ?? binding.type;
  return typeof actual === 'string' && lowerFirst(actual) === expected;
}

function resolveError(code, message, selectorIndex) {
  return {
    code,
    message,
    ...(selectorIndex === undefined ? {} : { selectorIndex }),
  };
}

function queryEvaluateError(code, message, details = {}) {
  return { code, message, ...details };
}

function annotateQueryDiagnostic(error, details) {
  return {
    ...error,
    ...(details.phase === undefined ? {} : { phase: details.phase }),
    ...(details.candidateAddress === undefined ? {} : { candidateAddress: details.candidateAddress }),
  };
}

function getBindingAddress(binding) {
  return typeof binding.address === 'string' ? binding.address : undefined;
}

export function renderQualifierExpression(expression) {
  return expression.terms.map(renderQualifierTerm).join('|');
}

export function renderQualifierTerm(term) {
  let output = term.name;
  const parameterGroups = term.parameterGroups ?? (term.parameters.length > 0 ? [term.parameters] : []);
  for (const group of parameterGroups) {
    output += `<${group.map(renderQualifierTerm).join(',')}>`;
  }
  for (const argument of term.arguments) {
    output += `[${renderQualifierArgument(argument)}]`;
  }
  return output;
}

function renderQualifierArgument(argument) {
  if (argument.kind === 'token') return argument.value;
  return quotePayload(argument.value);
}

class AddressParser {
  constructor(input, options = {}) {
    this.input = input;
    this.options = options;
    this.index = 0;
    this.warnings = [];
    this.maxPositionIndex = normalizeMaxPositionIndex(options.maxPositionIndex);
  }

  parse() {
    if (this.input.length === 0) this.fail('Expected SANSA address root', 'SANSA_EMPTY_ADDRESS');
    const rootChar = this.peek();
    if (rootChar !== '$' && rootChar !== '?') {
      this.fail("Expected SANSA address root '$' or '?'", 'SANSA_EXPECTED_ROOT');
    }
    this.index += 1;

    const root = { type: 'root', kind: rootChar === '$' ? 'absolute' : 'contextual' };
    const selectors = [];
    let qualifierExpression = null;

    while (!this.atEnd()) {
      const char = this.peek();
      if (char === ':') {
        this.index += 1;
        if (this.atEnd()) this.fail('Expected qualifier expression', 'SANSA_EXPECTED_QUALIFIER');
        qualifierExpression = this.parseQualifierExpression();
        break;
      }
      if (char === '.') {
        selectors.push(this.parseDotSelector());
        continue;
      }
      if (char === '[') {
        selectors.push(this.parsePositionSelector());
        continue;
      }
      if (char === '#') {
        this.index += 1;
        selectors.push({ type: 'semanticTypeFilter', name: this.parseIdentifier('semantic type filter') });
        continue;
      }
      if (char === '%') {
        this.index += 1;
        selectors.push({ type: 'representationKindFilter', name: this.parseIdentifier('representation kind filter') });
        continue;
      }
      if (isLayout(char)) this.fail('Whitespace is not allowed inside a SANSA address', 'SANSA_UNEXPECTED_WHITESPACE');
      this.fail(`Unexpected character '${char}'`, 'SANSA_UNEXPECTED_CHARACTER');
    }

    this.expectEnd();
    const address = {
      type: 'SansaAddress',
      root,
      selectors,
      qualifierExpression,
      isExact: selectors.every(isExactSelector),
    };
    address.canonical = renderAddress(address);
    return address;
  }

  parseDotSelector() {
    this.consume('.');
    if (this.match('@')) return { type: 'attributeSpace' };
    if (this.match('^')) return { type: 'parent' };
    if (this.match('*')) {
      if (this.match('*')) return { type: 'descendantExpansion' };
      return { type: 'directExpansion' };
    }
    if (this.match('[')) {
      const name = this.parseQuotedPayload();
      if (name.length === 0) this.fail('Quoted member names must not be empty', 'SANSA_EMPTY_MEMBER_NAME');
      this.consume(']');
      return { type: 'member', name, quoted: true };
    }
    if (this.match('<')) {
      const name = this.parseQuotedPayload();
      if (name.length === 0) this.fail('Local address-space names must not be empty', 'SANSA_EMPTY_LOCAL_SPACE_NAME');
      this.consume('>');
      return { type: 'localSpace', name };
    }
    if (this.match('(')) {
      const pattern = this.parseQuotedPayload();
      this.consume(')');
      return { type: 'namePattern', pattern };
    }
    return { type: 'member', name: this.parseIdentifier('member selector'), quoted: false };
  }

  parsePositionSelector() {
    this.consume('[');
    const selectorStart = this.index;
    const start = this.parseOptionalPositionIndex();
    if (this.input.startsWith('..', this.index)) {
      this.index += 2;
      const end = this.parseOptionalPositionIndex();
      if (start === null && end === null) {
        this.fail('Position ranges must include a start or end index', 'SANSA_EMPTY_POSITION_RANGE', selectorStart);
      }
      this.consume(']');
      return { type: 'positionRange', start, end };
    }
    if (start === null) this.fail('Expected positional index', 'SANSA_EXPECTED_INDEX');
    this.consume(']');
    return { type: 'position', index: start };
  }

  parseOptionalPositionIndex() {
    const start = this.index;
    while (isDigit(this.peek())) this.index += 1;
    if (this.index === start) return null;
    const raw = this.input.slice(start, this.index);
    if (raw.length > 1 && raw.startsWith('0')) {
      this.fail('Positional indexes must not contain leading zeroes', 'SANSA_LEADING_ZERO_INDEX', start);
    }
    if (exceedsUnsignedDecimal(raw, this.maxPositionIndex)) {
      this.fail(
        `Position indexes must be less than or equal to ${this.maxPositionIndex}`,
        'SANSA_POSITION_INDEX_LIMIT_EXCEEDED',
        start,
      );
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) {
      this.fail(
        `Position indexes must be less than or equal to ${this.maxPositionIndex}`,
        'SANSA_POSITION_INDEX_LIMIT_EXCEEDED',
        start,
      );
    }
    if (value > SANSA_MAX_POSITION_INDEX) {
      this.warn(
        `Position index ${value} exceeds the SANSA v1 portable index ceiling ${SANSA_MAX_POSITION_INDEX}`,
        'SANSA_NON_PORTABLE_POSITION_INDEX',
        start,
        { observed: value, portableFloor: SANSA_MAX_POSITION_INDEX },
      );
    }
    return value;
  }

  parseQualifierExpression(stopChar = '') {
    const terms = [this.parseQualifierTerm(stopChar)];
    while (!this.atEnd() && this.peek() === '|') {
      this.index += 1;
      terms.push(this.parseQualifierTerm(stopChar));
    }
    return { type: 'QualifierExpression', terms };
  }

  parseQualifierTerm(stopChar = '') {
    const name = this.parseIdentifier('qualifier type name');
    const parameters = [];
    const parameterGroups = [];
    const args = [];

    while (this.match('<')) {
      const group = [];
      group.push(this.parseQualifierTerm('>'));
      if (this.peek() === '|') {
        this.fail('Nested qualifier unions are not supported', 'SANSA_INVALID_QUALIFIER');
      }
      while (this.match(',')) {
        group.push(this.parseQualifierTerm('>'));
        if (this.peek() === '|') {
          this.fail('Nested qualifier unions are not supported', 'SANSA_INVALID_QUALIFIER');
        }
      }
      this.consume('>');
      parameterGroups.push(group);
      parameters.push(...group);
    }

    while (this.match('[')) {
      args.push(this.parseQualifierArgument());
      this.consume(']');
    }

    const next = this.peek();
    if (next && !['|', ',', '>', stopChar].includes(next)) {
      this.fail(`Unexpected character '${next}' in qualifier expression`, 'SANSA_INVALID_QUALIFIER');
    }

    return { type: 'QualifierTerm', name, parameters, parameterGroups, arguments: args };
  }

  parseQualifierArgument() {
    if (this.peek() === '"') {
      return { kind: 'quoted', value: this.parseQuotedPayload() };
    }

    const start = this.index;
    while (!this.atEnd() && this.peek() !== ']') {
      const char = this.peek();
      if (!isQualifierArgumentChar(char)) {
        this.fail(`Invalid unquoted qualifier argument character '${char}'`, 'SANSA_INVALID_QUALIFIER_ARGUMENT_CHAR');
      }
      this.index += 1;
    }
    if (this.index === start) this.fail('Expected qualifier argument', 'SANSA_EXPECTED_QUALIFIER_ARGUMENT');
    const value = this.input.slice(start, this.index);
    if (!QUALIFIER_ARG_RE.test(value)) this.fail('Invalid qualifier argument', 'SANSA_INVALID_QUALIFIER_ARGUMENT');
    return { kind: 'token', value };
  }

  parseIdentifier(context) {
    const start = this.index;
    const first = this.peek();
    if (!isIdentifierStart(first)) this.fail(`Expected ${context}`, 'SANSA_EXPECTED_IDENTIFIER');
    this.index += 1;
    while (isIdentifierContinue(this.peek())) this.index += 1;
    return this.input.slice(start, this.index);
  }

  parseQuotedPayload() {
    this.consume('"');
    let output = '';
    while (!this.atEnd()) {
      const char = this.peek();
      if (char === '"') {
        this.index += 1;
        return output;
      }
      if (char === '\n' || char === '\r') {
        this.fail('Quoted payloads must not contain raw newlines', 'SANSA_RAW_NEWLINE_IN_QUOTED_PAYLOAD');
      }
      if (char === '\\') {
        output += this.parseEscape();
        continue;
      }
      output += char;
      this.index += 1;
    }
    this.fail('Unterminated quoted payload', 'SANSA_UNTERMINATED_QUOTED_PAYLOAD');
  }

  parseEscape() {
    this.consume('\\');
    const escape = this.peek();
    if (!escape) this.fail('Unterminated escape sequence', 'SANSA_UNTERMINATED_ESCAPE');
    this.index += 1;
    switch (escape) {
      case '\\': return '\\';
      case '"': return '"';
      case "'": return "'";
      case '`': return '`';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'u':
        return this.parseUnicodeEscape();
      default:
        this.fail(`Invalid escape sequence \\${escape}`, 'SANSA_INVALID_ESCAPE', this.index - 2);
    }
  }

  parseUnicodeEscape() {
    if (this.match('{')) {
      const start = this.index;
      while (!this.atEnd() && this.peek() !== '}') this.index += 1;
      if (this.atEnd()) this.fail('Unterminated Unicode escape', 'SANSA_UNTERMINATED_UNICODE_ESCAPE');
      const raw = this.input.slice(start, this.index);
      this.consume('}');
      if (!/^[0-9A-Fa-f]{1,6}$/.test(raw)) this.fail('Invalid Unicode escape', 'SANSA_INVALID_UNICODE_ESCAPE', start);
      return codePointToString(Number.parseInt(raw, 16), start);
    }

    const raw = this.input.slice(this.index, this.index + 4);
    if (!/^[0-9A-Fa-f]{4}$/.test(raw)) this.fail('Invalid Unicode escape', 'SANSA_INVALID_UNICODE_ESCAPE');
    this.index += 4;
    return codePointToString(Number.parseInt(raw, 16), this.index - 4);
  }

  expectEnd() {
    if (!this.atEnd()) this.fail(`Unexpected trailing character '${this.peek()}'`, 'SANSA_TRAILING_INPUT');
  }

  consume(char) {
    if (this.peek() !== char) this.fail(`Expected '${char}'`, 'SANSA_EXPECTED_TOKEN');
    this.index += 1;
  }

  match(char) {
    if (this.peek() !== char) return false;
    this.index += 1;
    return true;
  }

  peek() {
    return this.input[this.index] ?? '';
  }

  atEnd() {
    return this.index >= this.input.length;
  }

  fail(message, code, index = this.index) {
    throw new SansaParseError(message, index, code);
  }

  warn(message, code, index = this.index, extra = {}) {
    this.warnings.push({ code, message, index, ...extra });
  }
}

class QueryParser {
  constructor(input, options = {}) {
    this.input = input;
    this.options = options;
    this.warnings = [];
  }

  parse() {
    const source = stripQueryComments(this.input);
    if (source.trim().length === 0) {
      this.fail('Expected SANSA query', 'SANSA_QUERY_EMPTY', 0);
    }

    const clauses = scanQueryClauses(source);
    const first = clauses[0];
    if (!first || first.name !== 'from' || source.slice(0, first.start).trim().length > 0) {
      this.fail("Expected 'from' clause", 'SANSA_QUERY_EXPECTED_FROM', first?.start ?? 0);
    }

    let previousOrder = -1;
    let sawSelect = false;
    const seen = new Set();
    const order = new Map([
      ['from', 0],
      ['where', 1],
      ['order', 2],
      ['offset', 3],
      ['limit', 4],
      ['select', 5],
    ]);

    for (const clause of clauses) {
      if (sawSelect) {
        this.fail("'select' must be the terminal SANSA query clause", 'SANSA_QUERY_SELECT_MUST_BE_TERMINAL', clause.start);
      }
      if (seen.has(clause.name)) {
        this.fail(`Duplicate SANSA query clause '${clause.label}'`, 'SANSA_QUERY_DUPLICATE_CLAUSE', clause.start);
      }
      seen.add(clause.name);
      const currentOrder = order.get(clause.name);
      if (currentOrder < previousOrder) {
        this.fail(`SANSA query clause '${clause.label}' is out of order`, 'SANSA_QUERY_INVALID_CLAUSE_ORDER', clause.start);
      }
      previousOrder = currentOrder;
      if (clause.name === 'select') sawSelect = true;
    }

    if (!seen.has('select')) {
      const end = source.length;
      this.fail("Expected 'select' clause", 'SANSA_QUERY_EXPECTED_SELECT', end);
    }

    const clauseByName = new Map(clauses.map((clause) => [clause.name, clause]));
    const from = this.parseFromClause(clauseByName.get('from'));
    const where = clauseByName.has('where') ? this.parseExpressionClause(clauseByName.get('where'), 'where') : null;
    const orderBy = clauseByName.has('order') ? this.parseOrderByClause(clauseByName.get('order')) : null;
    const offset = clauseByName.has('offset') ? this.parseIntegerClause(clauseByName.get('offset'), 'offset') : null;
    const limit = clauseByName.has('limit') ? this.parseIntegerClause(clauseByName.get('limit'), 'limit') : null;
    const select = this.parseExpressionClause(clauseByName.get('select'), 'select');

    const query = {
      type: 'SansaQuery',
      from,
      where,
      orderBy,
      offset,
      limit,
      select,
      clauses: clauses.map((clause) => clause.name),
    };
    query.canonical = renderQuery(query);
    return query;
  }

  parseFromClause(clause) {
    const expression = normalizeQueryExpression(clause.body);
    if (expression.length === 0) {
      this.fail("Expected SANSA address after 'from'", 'SANSA_QUERY_EXPECTED_FROM_ADDRESS', clause.bodyStart);
    }
    if (expression.startsWith('$') || expression.startsWith('?')) {
      if (/\s/.test(expression)) {
        this.fail("Expected a single SANSA address after 'from'", 'SANSA_QUERY_INVALID_FROM_ADDRESS', clause.bodyStart);
      }
      const result = parseAddress(expression, this.options.address);
      if (!result.ok) {
        const first = result.errors[0];
        this.fail(first.message, first.code, clause.bodyStart + first.index);
      }
      this.warnings.push(...result.warnings);
      return { type: 'fromClause', source: 'address', address: result.address };
    }

    const ast = this.parseClauseExpression(expression, clause.bodyStart);
    if (ast.type !== 'functionCallExpression' || ast.name !== 'path') {
      this.fail("Expected SANSA address or path(...) after 'from'", 'SANSA_QUERY_INVALID_FROM_SOURCE', clause.bodyStart);
    }
    return { type: 'fromClause', source: 'expression', expression: renderQueryExpression(ast), ast };
  }

  parseExpressionClause(clause, name) {
    const expression = normalizeQueryExpression(clause.body);
    if (expression.length === 0) {
      this.fail(`Expected expression after '${clause.label}'`, `SANSA_QUERY_EXPECTED_${name.toUpperCase()}_EXPRESSION`, clause.bodyStart);
    }
    const ast = this.parseClauseExpression(expression, clause.bodyStart);
    return { type: `${name}Clause`, expression: renderQueryExpression(ast), ast };
  }

  parseOrderByClause(clause) {
    const expression = normalizeQueryExpression(clause.body);
    if (expression.length === 0) {
      this.fail("Expected expression after 'order by'", 'SANSA_QUERY_EXPECTED_ORDER_EXPRESSION', clause.bodyStart);
    }
    const keys = splitTopLevelQueryList(expression).map((part) => {
      const normalized = normalizeQueryExpression(part);
      const directionMatch = /^(.*)\s+(asc|desc)$/u.exec(normalized);
      const keyExpression = directionMatch ? directionMatch[1].trim() : normalized;
      const direction = directionMatch ? directionMatch[2] : 'asc';
      if (keyExpression.length === 0) {
        this.fail("Expected order key expression", 'SANSA_QUERY_EXPECTED_ORDER_EXPRESSION', clause.bodyStart);
      }
      const ast = this.parseClauseExpression(keyExpression, clause.bodyStart + part.indexOf(keyExpression));
      return { type: 'orderKey', expression: renderQueryExpression(ast), ast, direction };
    });
    return { type: 'orderByClause', keys };
  }

  parseIntegerClause(clause, name) {
    const value = normalizeQueryExpression(clause.body);
    const code = name === 'limit' ? 'SANSA_QUERY_INVALID_LIMIT' : 'SANSA_QUERY_INVALID_OFFSET';
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
      this.fail(`Expected non-negative integer after '${name}'`, code, clause.bodyStart);
    }
    if (exceedsUnsignedDecimal(value, SANSA_MAX_QUERY_INTEGER)) {
      this.fail(`Query '${name}' must be less than or equal to ${SANSA_MAX_QUERY_INTEGER}`, code, clause.bodyStart);
    }
    return { type: `${name}Clause`, value: Number(value) };
  }

  parseClauseExpression(expression, offset) {
    const result = parseQueryExpression(expression, this.options.expression);
    if (!result.ok) {
      const first = result.errors[0];
      this.fail(first.message, first.code, offset + first.index);
    }
    this.warnings.push(...result.warnings);
    return result.expression;
  }

  fail(message, code, index) {
    throw new SansaParseError(message, index, code);
  }
}

class QueryExpressionParser {
  constructor(input, options = {}) {
    this.input = normalizeQueryExpression(stripQueryComments(String(input)));
    this.options = options;
    this.index = 0;
    this.warnings = [];
  }

  parse() {
    if (this.input.length === 0) {
      this.fail('Expected SANSA query expression', 'SANSA_QUERY_EXPECTED_EXPRESSION');
    }
    const expression = this.parseOr();
    this.skipLayout();
    if (!this.atEnd()) {
      this.fail(`Unexpected query expression token '${this.peek()}'`, 'SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN');
    }
    expression.canonical = renderQueryExpression(expression);
    return expression;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.matchKeyword('or')) {
      const right = this.parseAnd();
      left = this.binary('or', left, right);
    }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.matchKeyword('and')) {
      const right = this.parseNot();
      left = this.binary('and', left, right);
    }
    return left;
  }

  parseNot() {
    if (this.matchKeyword('not')) {
      const argument = this.parseNot();
      return {
        type: 'unaryExpression',
        operator: 'not',
        argument,
        canonical: '',
      };
    }
    return this.parseComparison();
  }

  parseComparison() {
    let left = this.parsePrimary();
    this.skipLayout();
    const operator = this.matchComparisonOperator();
    if (!operator) return left;
    const right = this.parsePrimary();
    left = this.binary(operator, left, right);
    this.skipLayout();
    if (this.matchComparisonOperator()) {
      this.fail('Chained comparison expressions are not supported', 'SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN');
    }
    return left;
  }

  parsePrimary() {
    this.skipLayout();
    const char = this.peek();
    if (!char) this.fail('Expected SANSA query expression', 'SANSA_QUERY_EXPECTED_EXPRESSION');
    if (char === '"') return this.parseString();
    if (char === '-' || isDigit(char)) return this.parseNumber();
    if (char === '$' || char === '?' || char === '.') return this.parseResolution();
    if (char === '(') return this.parseGroup();
    if (char === '{') return this.parseProjection();
    if (isIdentifierStart(char)) return this.parseIdentifierExpression();
    this.fail(`Unexpected query expression token '${char}'`, 'SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN');
  }

  parseIdentifierExpression() {
    const name = this.readIdentifier();
    if (name === 'true' || name === 'false') {
      return {
        type: 'literalExpression',
        kind: 'boolean',
        value: name === 'true',
        canonical: name,
      };
    }
    this.skipLayout();
    if (!this.match('(')) {
      this.fail(`Unexpected query expression identifier '${name}'`, 'SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN');
    }
    const argumentSource = this.readBalancedBody('(', ')');
    const argumentParts = argumentSource.trim().length === 0 ? [] : splitTopLevelQueryList(argumentSource);
    const args = argumentParts.map((part) => parseQueryExpressionOrThrow(part, this.options));
    if (['any', 'all', 'none'].includes(name)) {
      if (args.length !== 1) {
        this.fail(`Cardinality operator '${name}' expects exactly one expression`, 'SANSA_QUERY_INVALID_FUNCTION_CALL');
      }
      return {
        type: 'cardinalityExpression',
        operator: name,
        argument: args[0],
        canonical: '',
      };
    }
    if (['exists', 'absent'].includes(name)) {
      if (args.length !== 1) {
        this.fail(`Existence operator '${name}' expects exactly one resolution expression`, 'SANSA_QUERY_INVALID_FUNCTION_CALL');
      }
      if (!unwrapResolutionExpression(args[0])) {
        this.fail(`Existence operator '${name}' expects a resolution expression`, 'SANSA_QUERY_INVALID_FUNCTION_CALL');
      }
      return {
        type: 'existenceExpression',
        operator: name,
        argument: args[0],
        canonical: '',
      };
    }
    return {
      type: 'functionCallExpression',
      name,
      arguments: args,
      canonical: '',
    };
  }

  parseString() {
    const value = this.parseQuotedPayload();
    return {
      type: 'literalExpression',
      kind: 'string',
      value,
      canonical: quotePayload(value),
    };
  }

  parseNumber() {
    const start = this.index;
    if (this.peek() === '-') this.index += 1;
    if (this.peek() === '0') {
      this.index += 1;
      if (isDigit(this.peek())) {
        this.fail('Number literals must not contain leading zeroes', 'SANSA_QUERY_INVALID_NUMBER_LITERAL', start);
      }
    } else if (isDigit(this.peek())) {
      while (isDigit(this.peek())) this.index += 1;
    } else {
      this.fail('Expected number literal', 'SANSA_QUERY_INVALID_NUMBER_LITERAL', start);
    }
    if (this.peek() === '.') {
      this.index += 1;
      if (!isDigit(this.peek())) {
        this.fail('Expected decimal digits after number literal decimal point', 'SANSA_QUERY_INVALID_NUMBER_LITERAL', start);
      }
      while (isDigit(this.peek())) this.index += 1;
    }
    const source = this.input.slice(start, this.index);
    return {
      type: 'literalExpression',
      kind: 'number',
      value: Number(source),
      canonical: source,
    };
  }

  parseResolution() {
    const start = this.index;
    const source = this.readResolutionSource();
    if (source === '.') {
      return {
        type: 'currentBindingExpression',
        canonical: '.',
      };
    }
    const positionalCurrentShorthand = isQueryCurrentPositionalShorthand(source);
    const parseSource = positionalCurrentShorthand
      ? `?${source.slice(1)}`
      : source.startsWith('.')
        ? `?${source}`
        : source;
    const result = parseAddress(parseSource, this.options.address);
    if (!result.ok) {
      const first = result.errors[0];
      this.fail(first.message, first.code, start + first.index - (source.startsWith('.') ? 1 : 0));
    }
    this.warnings.push(...result.warnings);
    const scope = source.startsWith('.')
      ? 'current'
      : result.address.root.kind;
    const canonical = positionalCurrentShorthand
      ? `.${renderAddress(result.address).slice(1)}`
      : source.startsWith('.')
      ? renderAddress(result.address).slice(1)
      : renderAddress(result.address);
    return {
      type: 'resolutionExpression',
      scope,
      address: result.address,
      canonical,
    };
  }

  parseGroup() {
    this.consume('(');
    const source = this.readBalancedBody('(', ')');
    const expression = parseQueryExpressionOrThrow(source, this.options);
    return {
      type: 'groupExpression',
      expression,
      canonical: '',
    };
  }

  parseProjection() {
    this.consume('{');
    const source = this.readBalancedBody('{', '}');
    const fields = splitProjectionFields(source).map((field) => ({
      type: 'projectionField',
      name: field.name,
      expression: parseQueryExpressionOrThrow(field.expression, this.options),
    }));
    if (fields.length === 0) {
      this.fail('Expected at least one projection field', 'SANSA_QUERY_INVALID_PROJECTION');
    }
    return {
      type: 'projectionExpression',
      fields,
      canonical: '',
    };
  }

  readResolutionSource() {
    const start = this.index;
    let quote = null;
    let parenDepth = 0;
    let bracketDepth = 0;
    let angleDepth = 0;
    let qualifierDepth = 0;
    let sawColon = false;
    for (; this.index < this.input.length; this.index += 1) {
      const char = this.input[this.index];
      if (quote) {
        if (char === '\\') this.index += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"') {
        quote = char;
        continue;
      }
      if (char === ':') sawColon = true;
      if (char === '(') parenDepth += 1;
      else if (char === ')' && parenDepth > 0) parenDepth -= 1;
      else if (char === '[') bracketDepth += 1;
      else if (char === ']' && bracketDepth > 0) bracketDepth -= 1;
      else if (char === '<' && (sawColon || this.input[this.index - 1] === '.')) {
        angleDepth += 1;
        if (sawColon) qualifierDepth += 1;
      } else if (char === '>' && angleDepth > 0) {
        angleDepth -= 1;
        if (qualifierDepth > 0) qualifierDepth -= 1;
      } else if (
        parenDepth === 0
        && bracketDepth === 0
        && angleDepth === 0
        && (isLayout(char) || char === ',' || char === ')' || char === '}' || isComparisonStart(char))
      ) {
        break;
      }
    }
    const source = this.input.slice(start, this.index);
    if (source.length === 0) {
      this.fail('Expected SANSA resolution expression', 'SANSA_QUERY_INVALID_RESOLUTION_EXPRESSION', start);
    }
    return source;
  }

  readBalancedBody(open, close) {
    const start = this.index;
    let quote = null;
    let depth = 1;
    while (!this.atEnd()) {
      const char = this.input[this.index];
      if (quote) {
        if (char === '\\') this.index += 2;
        else {
          if (char === quote) quote = null;
          this.index += 1;
        }
        continue;
      }
      if (char === '"') {
        quote = char;
        this.index += 1;
        continue;
      }
      if (char === open) depth += 1;
      else if (char === close) depth -= 1;
      if (depth === 0) {
        const body = this.input.slice(start, this.index);
        this.index += 1;
        return body;
      }
      this.index += 1;
    }
    this.fail(`Unterminated '${open}' expression`, 'SANSA_QUERY_UNTERMINATED_EXPRESSION', start - 1);
  }

  parseQuotedPayload() {
    const parser = new AddressParser(this.input.slice(this.index), this.options.address);
    const value = parser.parseQuotedPayload();
    this.warnings.push(...parser.warnings);
    this.index += parser.index;
    return value;
  }

  binary(operator, left, right) {
    return {
      type: 'binaryExpression',
      operator,
      left,
      right,
      canonical: '',
    };
  }

  matchComparisonOperator() {
    this.skipLayout();
    if (this.matchKeyword('in')) return 'in';
    for (const operator of ['==', '!=', '<=', '>=', '<', '>']) {
      if (this.input.startsWith(operator, this.index)) {
        this.index += operator.length;
        return operator;
      }
    }
    return null;
  }

  matchKeyword(keyword) {
    this.skipLayout();
    if (!this.input.startsWith(keyword, this.index)) return false;
    const before = this.index === 0 ? '' : this.input[this.index - 1];
    const after = this.input[this.index + keyword.length] ?? '';
    if (isIdentifierContinue(before) || isIdentifierContinue(after)) return false;
    this.index += keyword.length;
    return true;
  }

  readIdentifier() {
    const start = this.index;
    if (!isIdentifierStart(this.peek())) {
      this.fail('Expected identifier', 'SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN');
    }
    this.index += 1;
    while (isIdentifierContinue(this.peek())) this.index += 1;
    return this.input.slice(start, this.index);
  }

  skipLayout() {
    while (isLayout(this.peek())) this.index += 1;
  }

  consume(char) {
    if (this.peek() !== char) this.fail(`Expected '${char}'`, 'SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN');
    this.index += 1;
  }

  match(char) {
    if (this.peek() !== char) return false;
    this.index += 1;
    return true;
  }

  peek() {
    return this.input[this.index] ?? '';
  }

  atEnd() {
    return this.index >= this.input.length;
  }

  fail(message, code, index = this.index) {
    throw new SansaParseError(message, index, code);
  }
}

function stripQueryComments(input) {
  let output = '';
  let quote = null;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1] ?? '';
    if (quote) {
      output += char;
      if (char === '\\') {
        index += 1;
        output += input[index] ?? '';
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      output += char;
      continue;
    }
    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      while (index + 1 < input.length && input[index + 1] !== '\n' && input[index + 1] !== '\r') {
        index += 1;
        output += ' ';
      }
      continue;
    }
    if (char === '/' && next === '*') {
      const start = index;
      output += '  ';
      index += 1;
      let closed = false;
      while (index + 1 < input.length) {
        index += 1;
        const current = input[index];
        const following = input[index + 1] ?? '';
        output += current === '\n' || current === '\r' ? current : ' ';
        if (current === '*' && following === '/') {
          index += 1;
          output += ' ';
          closed = true;
          break;
        }
      }
      if (!closed) {
        throw new SansaParseError('Unterminated SANSA query block comment', start, 'SANSA_QUERY_UNTERMINATED_BLOCK_COMMENT');
      }
      continue;
    }
    output += char;
  }
  return output;
}

function scanQueryClauses(source) {
  const clauses = [];
  let quote = null;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') parenDepth += 1;
    else if (char === ')' && parenDepth > 0) parenDepth -= 1;
    else if (char === '[') bracketDepth += 1;
    else if (char === ']' && bracketDepth > 0) bracketDepth -= 1;
    else if (char === '{') braceDepth += 1;
    else if (char === '}' && braceDepth > 0) braceDepth -= 1;

    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0) {
      continue;
    }

    const match = matchQueryClauseKeyword(source, index);
    if (match) {
      clauses.push({
        name: match.name,
        label: match.label,
        start: index,
        bodyStart: match.end,
        body: '',
      });
      index = match.end - 1;
    }
  }

  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index];
    const next = clauses[index + 1];
    const bodyEnd = next ? next.start : source.length;
    clause.body = source.slice(clause.bodyStart, bodyEnd);
  }
  return clauses;
}

function matchQueryClauseKeyword(source, index) {
  if (!isQueryClauseBoundaryBefore(source, index)) return null;
  if (source.startsWith('order', index) && isQueryClauseBoundaryAfter(source, index + 'order'.length)) {
    let cursor = index + 'order'.length;
    const gapStart = cursor;
    while (isLayout(source[cursor] ?? '')) cursor += 1;
    if (cursor > gapStart && source.startsWith('by', cursor) && isQueryClauseBoundaryAfter(source, cursor + 2)) {
      return { name: 'order', label: 'order by', end: cursor + 2 };
    }
  }
  for (const name of ['from', 'where', 'offset', 'limit', 'select']) {
    if (source.startsWith(name, index) && isQueryClauseBoundaryAfter(source, index + name.length)) {
      return { name, label: name, end: index + name.length };
    }
  }
  return null;
}

function exceedsUnsignedDecimal(raw, max) {
  const maxRaw = String(max);
  return raw.length > maxRaw.length || (raw.length === maxRaw.length && raw > maxRaw);
}

function normalizeMaxPositionIndex(value) {
  if (value === undefined) return SANSA_MAX_POSITION_INDEX;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return SANSA_MAX_POSITION_INDEX;
  }
  return value;
}

function isQueryClauseBoundaryBefore(source, index) {
  if (index === 0) return true;
  return isLayout(source[index - 1]);
}

function isQueryClauseBoundaryAfter(source, index) {
  const char = source[index] ?? '';
  return char === '' || isLayout(char);
}

function normalizeQueryExpression(source) {
  let output = '';
  let quote = null;
  let pendingSpace = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      output += char;
      if (char === '\\') {
        index += 1;
        output += source[index] ?? '';
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      if (pendingSpace && output.length > 0) output += ' ';
      pendingSpace = false;
      quote = char;
      output += char;
      continue;
    }
    if (isLayout(char)) {
      pendingSpace = output.length > 0;
      continue;
    }
    if (pendingSpace && output.length > 0) output += ' ';
    pendingSpace = false;
    output += char;
  }
  return output.trim();
}

function isQueryCurrentPositionalShorthand(source) {
  return source.startsWith('.[') && source[2] !== '"';
}

function splitTopLevelQueryList(source) {
  const parts = [];
  let quote = null;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '(') parenDepth += 1;
    else if (char === ')' && parenDepth > 0) parenDepth -= 1;
    else if (char === '[') bracketDepth += 1;
    else if (char === ']' && bracketDepth > 0) bracketDepth -= 1;
    else if (char === '{') braceDepth += 1;
    else if (char === '}' && braceDepth > 0) braceDepth -= 1;
    else if (char === ',' && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

function splitProjectionFields(source) {
  const fields = [];
  let cursor = 0;
  while (cursor < source.length) {
    while (isLayout(source[cursor] ?? '')) cursor += 1;
    if (cursor >= source.length) break;
    const nameStart = cursor;
    if (!isIdentifierStart(source[cursor] ?? '')) {
      throw new SansaParseError('Expected projection field name', cursor, 'SANSA_QUERY_INVALID_PROJECTION');
    }
    cursor += 1;
    while (isIdentifierContinue(source[cursor] ?? '')) cursor += 1;
    const name = source.slice(nameStart, cursor);
    while (isLayout(source[cursor] ?? '')) cursor += 1;
    if (source[cursor] !== '=') {
      throw new SansaParseError("Expected '=' after projection field name", cursor, 'SANSA_QUERY_INVALID_PROJECTION');
    }
    cursor += 1;
    const expressionStart = cursor;
    const nextField = findNextProjectionField(source, cursor);
    const expressionEnd = nextField < 0 ? source.length : nextField;
    const expression = source.slice(expressionStart, expressionEnd).trim();
    if (expression.length === 0) {
      throw new SansaParseError('Expected projection field expression', expressionStart, 'SANSA_QUERY_INVALID_PROJECTION');
    }
    fields.push({ name, expression });
    cursor = expressionEnd;
  }
  return fields;
}

function findNextProjectionField(source, start) {
  let quote = null;
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"') {
      quote = char;
      continue;
    }
    if (char === '(') parenDepth += 1;
    else if (char === ')' && parenDepth > 0) parenDepth -= 1;
    else if (char === '[') bracketDepth += 1;
    else if (char === ']' && bracketDepth > 0) bracketDepth -= 1;
    else if (char === '{') braceDepth += 1;
    else if (char === '}' && braceDepth > 0) braceDepth -= 1;

    if (parenDepth !== 0 || bracketDepth !== 0 || braceDepth !== 0 || !isLayout(char)) {
      continue;
    }

    let cursor = index;
    while (isLayout(source[cursor] ?? '')) cursor += 1;
    if (!isIdentifierStart(source[cursor] ?? '')) continue;
    cursor += 1;
    while (isIdentifierContinue(source[cursor] ?? '')) cursor += 1;
    const afterName = cursor;
    while (isLayout(source[cursor] ?? '')) cursor += 1;
    if (source[cursor] === '=' && source[cursor + 1] !== '=') {
      return index;
    }
    index = afterName - 1;
  }
  return -1;
}

function isComparisonStart(char) {
  return char === '=' || char === '!' || char === '<' || char === '>';
}

function isExactSelector(selector) {
  return ['member', 'position', 'attributeSpace', 'localSpace'].includes(selector.type);
}

function isIdentifierStart(char) {
  return /^[A-Za-z_]$/.test(char ?? '');
}

function isIdentifierContinue(char) {
  return /^[A-Za-z0-9_]$/.test(char ?? '');
}

function isDigit(char) {
  return /^[0-9]$/.test(char ?? '');
}

function isLayout(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isQualifierArgumentChar(char) {
  return /^[A-Za-z0-9!#$%&*+\-.:;=?@^_|~<>]$/.test(char ?? '');
}

function datatypeBaseName(datatype) {
  const genericCut = datatype.indexOf('<');
  const argumentCut = datatype.indexOf('[');
  const cut = [genericCut, argumentCut].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return (cut === undefined ? datatype : datatype.slice(0, cut)).trim();
}

function lowerFirst(value) {
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function globPatternToRegExp(pattern) {
  let source = '^';
  for (const char of pattern) {
    if (char === '*') {
      source += '.*';
    } else if (char === '?') {
      source += '.';
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`${source}$`, 'u');
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function codePointToString(codePoint, index) {
  if (codePoint > 0x10FFFF || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
    throw new SansaParseError('Unicode escape must decode to a scalar value', index, 'SANSA_INVALID_UNICODE_SCALAR');
  }
  return String.fromCodePoint(codePoint);
}

function quotePayload(value) {
  let output = '"';
  for (const char of value) {
    switch (char) {
      case '\\':
        output += '\\\\';
        break;
      case '"':
        output += '\\"';
        break;
      case '\n':
        output += '\\n';
        break;
      case '\r':
        output += '\\r';
        break;
      case '\t':
        output += '\\t';
        break;
      case '\b':
        output += '\\b';
        break;
      case '\f':
        output += '\\f';
        break;
      default:
        output += char;
        break;
    }
  }
  output += '"';
  return output;
}
