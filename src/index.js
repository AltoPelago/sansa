const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const QUALIFIER_ARG_RE = /^[A-Za-z0-9!#$%&*+\-.:;=?@^_|~<>]+$/;
export const SANSA_MAX_POSITION_INDEX = 999_999;
export const SANSA_MAX_QUERY_INTEGER = Number.MAX_SAFE_INTEGER;

const QUERY_VALUE_METADATA_PROPERTY = '__sansaQueryValueMetadata';
const QUERY_OBJECT_FIELD_METADATA_PROPERTY = '__sansaObjectFieldMetadata';
const TRANSFORM_EXTENSION_FUNCTIONS = new Map([
  ['objectFrom', 'sansa.transform.objectFrom'],
  ['fieldsFrom', 'sansa.transform.fieldsFrom'],
]);
const DEFAULT_VALUE_SEMANTICS_PROFILE_ID = 'aeon.value.default.v1';
const CODEPOINT_STRING_PROFILE_ID = 'aeon.value.string.codepoint.v1';
const FRENCH_STRING_PROFILE_ID = 'aeon.value.string.locale.fr.v1';
const NATURAL_ASCII_STRING_PROFILE_ID = 'aeon.value.string.natural.ascii.v1';
const TEMPORAL_ISO8601_PROFILE_ID = 'aeon.value.temporal.iso8601.v1';
const VALUE_SEMANTICS_METADATA_CATEGORIES = [
  'toggle',
  'hex',
  'radix',
  'encoding',
  'separator',
  'sansa',
  'sansaAddress',
  'cloneReference',
  'pointerReference',
  'referenceForm',
  'date',
  'time',
  'datetime',
  'zrut',
  'temporal',
  'lexicalStructuredScalar',
  'container',
];

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

export const aeonValueSemanticsDefaultProfile = Object.freeze({
  id: DEFAULT_VALUE_SEMANTICS_PROFILE_ID,
  stringOrder: CODEPOINT_STRING_PROFILE_ID,
  temporalOrder: TEMPORAL_ISO8601_PROFILE_ID,
  caseMapping: 'unicode-default',
  compareStrings: compareStringsByUnicodeScalarValue,
  compareTemporal: compareTemporalByCanonicalValue,
  lowerString: (value) => value.toLowerCase(),
  upperString: (value) => value.toUpperCase(),
});

export function createIntlValueSemanticsProfile(options = {}) {
  const locale = options.locale ?? 'und';
  const collator = new Intl.Collator(locale, {
    usage: options.usage ?? 'sort',
    sensitivity: options.sensitivity ?? 'variant',
    ignorePunctuation: options.ignorePunctuation ?? false,
    numeric: options.numeric ?? false,
    caseFirst: options.caseFirst ?? 'false',
  });
  return Object.freeze({
    id: options.id ?? `aeon.value.string.intl.${Array.isArray(locale) ? locale.join('-') : locale}.v1`,
    locale,
    stringOrder: 'intl-collator',
    temporalOrder: TEMPORAL_ISO8601_PROFILE_ID,
    caseMapping: 'intl-locale',
    compareStrings: (left, right) => normalizeComparison(collator.compare(left, right)),
    compareTemporal: options.compareTemporal ?? compareTemporalByCanonicalValue,
    lowerString: (value) => value.toLocaleLowerCase(locale),
    upperString: (value) => value.toLocaleUpperCase(locale),
  });
}

export function createFrenchValueSemanticsProfile(options = {}) {
  return createIntlValueSemanticsProfile({
    id: 'aeon.value.string.locale.fr.v1',
    locale: 'fr',
    ...options,
  });
}

export function createNaturalAsciiValueSemanticsProfile(options = {}) {
  return Object.freeze({
    id: NATURAL_ASCII_STRING_PROFILE_ID,
    stringOrder: NATURAL_ASCII_STRING_PROFILE_ID,
    temporalOrder: TEMPORAL_ISO8601_PROFILE_ID,
    caseMapping: 'unicode-default',
    ...options,
    compareStrings: compareStringsByNaturalAsciiOrder,
    compareTemporal: options.compareTemporal ?? compareTemporalByCanonicalValue,
    lowerString: (value) => value.toLowerCase(),
    upperString: (value) => value.toUpperCase(),
  });
}

export function evaluateQuery(input, namespace, options = {}) {
  let valueSemanticsProfile;
  try {
    valueSemanticsProfile = getValueSemanticsProfile(options.valueSemantics);
  } catch (error) {
    return {
      ok: false,
      results: [],
      errors: [
        annotateQueryDiagnostic(queryEvaluateError(
          'SANSA_QUERY_INVALID_VALUE_SEMANTICS_PROFILE',
          error instanceof Error ? error.message : 'Invalid value-semantics profile',
        ), { phase: 'policy' }),
      ],
    };
  }

  options = {
    ...options,
    valueSemantics: valueSemanticsProfile,
  };
  const parsed = typeof input === 'string' ? parseQuery(input, options.parse) : { ok: true, query: input };
  if (!parsed.ok) {
    return {
      ok: false,
      results: [],
      errors: parsed.errors.map((error) => annotateQueryDiagnostic(error, { phase: 'parse' })),
    };
  }

  const query = parsed.query;
  const policy = enforceQueryPolicy(query, options);
  if (!policy.ok) {
    return {
      ok: false,
      results: [],
      errors: [annotateQueryDiagnostic(policy.error, { phase: 'policy' })],
    };
  }

  const from = evaluateQueryFromClause(query.from, namespace, options);
  if (!from.ok) {
    return {
      ok: false,
      results: [],
      errors: from.errors.map((error) => annotateQueryDiagnostic(error, { phase: 'from' })),
    };
  }

  let bindings = from.bindings;
  const fromBudget = checkQueryBudget(options, 'maxFromBindings', bindings.length);
  if (!fromBudget.ok) {
    return {
      ok: false,
      results: [],
      errors: [annotateQueryDiagnostic(fromBudget.error, { phase: 'from' })],
    };
  }

  if (query.where) {
    const whereBudget = checkQueryBudget(options, 'maxWhereCandidates', bindings.length);
    if (!whereBudget.ok) {
      return {
        ok: false,
        results: [],
        errors: [annotateQueryDiagnostic(whereBudget.error, { phase: 'where' })],
      };
    }
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
    const orderBudget = checkQueryBudget(options, 'maxOrderCandidates', bindings.length);
    if (!orderBudget.ok) {
      return {
        ok: false,
        results: [],
        errors: [annotateQueryDiagnostic(orderBudget.error, { phase: 'order' })],
      };
    }
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

  const resultBudget = checkQueryBudget(options, 'maxResultRecords', bindings.length);
  if (!resultBudget.ok) {
    return {
      ok: false,
      results: [],
      errors: [annotateQueryDiagnostic(resultBudget.error, { phase: 'select' })],
    };
  }

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
    const candidateAddress = getBindingAddress(binding);
    const valueAddress = queryValueAddress(evaluated.value);
    results.push({
      type: 'queryResult',
      ...(candidateAddress === undefined ? {} : { address: candidateAddress, candidateAddress }),
      ...(valueAddress === undefined ? {} : { valueAddress }),
      kind: evaluated.value.type === 'bindingSet' ? 'binding' : 'derived',
      binding,
      value: evaluated.value,
    });
  }

  return { ok: true, results, diagnostics: [] };
}

export function planMutation(input, namespace, options = {}) {
  const normalized = normalizeMutationRequest(input);
  if (!normalized.ok) {
    return { ok: false, errors: [mutationError(normalized.code, normalized.message)] };
  }

  const operationBudget = checkMutationBudget(options, 'maxOperations', normalized.operations.length, 'plan');
  if (!operationBudget.ok) return { ok: false, errors: [operationBudget.error] };
  const preconditionBudget = checkMutationBudget(options, 'maxPreconditions', normalized.preconditions.length, 'plan');
  if (!preconditionBudget.ok) return { ok: false, errors: [preconditionBudget.error] };

  const operations = [];
  const seenDestructiveTargets = new Set();
  const seenCreates = new Set();

  for (let operationIndex = 0; operationIndex < normalized.operations.length; operationIndex += 1) {
    const requested = normalized.operations[operationIndex];
    const planned = planMutationOperation(requested, operationIndex, namespace, options);
    if (!planned.ok) return { ok: false, errors: [planned.error] };

    const conflict = checkMutationPlanConflict(planned.operation, seenDestructiveTargets, seenCreates);
    if (!conflict.ok) {
      return {
        ok: false,
        errors: [mutationError(conflict.code, conflict.message, { operationIndex })],
      };
    }

    operations.push(planned.operation);
  }

  const preconditions = evaluateMutationPreconditions(normalized.preconditions, namespace, options);
  if (!preconditions.ok) return { ok: false, errors: [preconditions.error] };
  const portabilityWarnings = collectMutationPortabilityWarnings(operations, preconditions.preconditions);

  return {
    ok: true,
    plan: {
      type: 'SansaMutationPlan',
      planVersion: 'sansa.mutate.plan.v1',
      namespaceState: options.namespaceState ?? getNamespaceState(namespace),
      operations,
      preconditions: preconditions.preconditions,
      ...(normalized.sourceProvenance === undefined ? {} : { sourceProvenance: normalized.sourceProvenance }),
      ...(portabilityWarnings.length === 0 ? {} : { portabilityWarnings }),
      diagnostics: [],
    },
    diagnostics: [],
  };
}

export function applyMutationPlan(plan, namespace, options = {}) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.operations)) {
    return {
      ok: false,
      operationResults: [],
      errors: [mutationError('SANSA_MUTATE_INVALID_PLAN', 'Expected SANSA mutation plan')],
    };
  }

  const adapter = mutationAdapter(namespace);
  if (options.requireAtomic === true && adapter?.supportsAtomicApply !== true) {
    return {
      ok: false,
      operationResults: [],
      errors: [mutationError('SANSA_MUTATE_ATOMIC_APPLY_UNAVAILABLE', 'Mutation adapter does not advertise atomic apply')],
    };
  }

  const operationBudget = checkMutationBudget(options, 'maxOperations', plan.operations.length, 'apply');
  if (!operationBudget.ok) {
    return { ok: false, operationResults: [], errors: [operationBudget.error] };
  }
  const preconditionBudget = checkMutationBudget(options, 'maxPreconditions', (plan.preconditions ?? []).length, 'apply');
  if (!preconditionBudget.ok) {
    return { ok: false, operationResults: [], errors: [preconditionBudget.error] };
  }

  for (let operationIndex = 0; operationIndex < plan.operations.length; operationIndex += 1) {
    const operation = plan.operations[operationIndex];
    const capability = mutationHookForOperation(operation, adapter);
    if (!capability.ok) {
      return {
        ok: false,
        operationResults: [],
        errors: [mutationError(capability.code, capability.message, { operationIndex })],
      };
    }
    const stable = verifyMutationOperationStability(operation, operationIndex, namespace, options);
    if (!stable.ok) {
      return { ok: false, operationResults: [], errors: [stable.error] };
    }
  }

  if (options.recheckPreconditions !== false) {
    const preconditions = verifyPlannedMutationPreconditions(plan.preconditions ?? [], namespace, options);
    if (!preconditions.ok) {
      return { ok: false, operationResults: [], errors: [preconditions.error] };
    }
  }

  const operationResults = [];
  for (let operationIndex = 0; operationIndex < plan.operations.length; operationIndex += 1) {
    const operation = plan.operations[operationIndex];
    const hook = mutationHookForOperation(operation, adapter).hook;
    const applied = applyMutationOperation(operation, hook);
    if (!applied.ok) {
      return {
        ok: false,
        operationResults,
        errors: [mutationError(
          'SANSA_MUTATE_APPLY_FAILED',
          applied.message,
          { operationIndex },
        )],
      };
    }
    operationResults.push({
      operationIndex,
      status: 'applied',
      ...mutationOperationReportAddresses(operation),
      ...(applied.previousAddress === undefined ? {} : { previousAddress: applied.previousAddress }),
      ...(applied.affectedAddress === undefined ? {} : { affectedAddress: applied.affectedAddress }),
      ...(applied.resultingAddress === undefined ? {} : { resultingAddress: applied.resultingAddress }),
      ...(applied.affectedBinding === undefined ? {} : { affectedBinding: applied.affectedBinding }),
    });
  }

  return {
    ok: true,
    planId: plan.planId,
    stateBefore: plan.namespaceState,
    stateAfter: getNamespaceState(namespace),
    operationResults,
    diagnostics: [],
  };
}

function normalizeMutationRequest(input) {
  if (Array.isArray(input)) return { ok: true, operations: input, preconditions: [] };
  if (input && typeof input === 'object' && Array.isArray(input.operations)) {
    if (input.preconditions !== undefined && !Array.isArray(input.preconditions)) {
      return {
        ok: false,
        code: 'SANSA_MUTATE_INVALID_PRECONDITION',
        message: 'Mutation request preconditions must be a list',
      };
    }
    return {
      ok: true,
      operations: input.operations,
      preconditions: input.preconditions ?? [],
      sourceProvenance: input.provenance,
    };
  }
  if (input && typeof input === 'object' && typeof input.op === 'string') {
    return { ok: true, operations: [input], preconditions: [] };
  }
  return {
    ok: false,
    code: 'SANSA_MUTATE_INVALID_REQUEST',
    message: 'Expected mutation request object, operation object, or operation list',
  };
}

function evaluateMutationPreconditions(preconditions, namespace, options) {
  if (preconditions.length === 0) return { ok: true, preconditions: [] };

  let valueSemanticsProfile;
  try {
    valueSemanticsProfile = getValueSemanticsProfile(options.valueSemantics);
  } catch (error) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_INVALID_VALUE_SEMANTICS_PROFILE',
        error instanceof Error ? error.message : 'Invalid value-semantics profile',
      ),
    };
  }

  const evaluationOptions = {
    ...options,
    valueSemantics: valueSemanticsProfile,
  };
  const planned = [];
  for (let preconditionIndex = 0; preconditionIndex < preconditions.length; preconditionIndex += 1) {
    const precondition = evaluateMutationPrecondition(
      preconditions[preconditionIndex],
      preconditionIndex,
      namespace,
      evaluationOptions,
    );
    if (!precondition.ok) return precondition;
    planned.push(precondition.precondition);
  }
  return { ok: true, preconditions: planned };
}

function evaluateMutationPrecondition(precondition, preconditionIndex, namespace, options) {
  if (!precondition || typeof precondition !== 'object' || typeof precondition.expression !== 'string') {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_INVALID_PRECONDITION',
        'Mutation preconditions must provide an expression string',
        { preconditionIndex },
      ),
    };
  }

  const parsed = parseQueryExpression(precondition.expression, mutationQueryExpressionParseOptions(options));
  if (!parsed.ok) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_INVALID_PRECONDITION',
        'Mutation precondition expression is not valid',
        { preconditionIndex, cause: parsed.errors[0] },
      ),
    };
  }

  const context = resolveMutationPreconditionContext(precondition, preconditionIndex, namespace, options);
  if (!context.ok) return context;

  const evaluated = evaluateQueryExpressionValue(parsed.expression, context.binding, namespace, options);
  if (!evaluated.ok) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED',
        evaluated.error.message,
        { preconditionIndex, cause: evaluated.error },
      ),
    };
  }

  const boolean = expectBooleanQueryValue(evaluated.value, namespace);
  if (!boolean.ok) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED',
        boolean.error.message,
        { preconditionIndex, cause: boolean.error },
      ),
    };
  }
  if (boolean.value !== true) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_PRECONDITION_FAILED',
        'Mutation precondition evaluated false',
        { preconditionIndex },
      ),
    };
  }

  return {
    ok: true,
    precondition: {
      expression: precondition.expression,
      canonical: parsed.expression.canonical,
      ...(context.target === undefined ? {} : { target: context.target }),
    },
  };
}

function resolveMutationPreconditionContext(precondition, preconditionIndex, namespace, options) {
  if (precondition.target !== undefined) {
    const target = resolveMutationExactTarget(precondition.target, 'precondition target', undefined, namespace, options);
    if (!target.ok) {
      return {
        ok: false,
        error: mutationError(
          'SANSA_MUTATE_INVALID_PRECONDITION',
          target.error.message,
          { preconditionIndex, cause: target.error },
        ),
      };
    }
    return { ok: true, binding: target.target.binding, target: target.target };
  }

  const rootResult = resolveRoot({ kind: 'absolute' }, namespace, options.resolve ?? {});
  if (!rootResult.ok) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED',
        rootResult.error.message,
        { preconditionIndex, cause: rootResult.error },
      ),
    };
  }
  return { ok: true, binding: rootResult.binding };
}

function mutationQueryExpressionParseOptions(options) {
  if (options.parse?.expression || options.parse?.address) {
    return options.parse.expression ?? { address: options.parse.address };
  }
  if (options.parse) return { address: options.parse };
  return {};
}

function checkMutationBudget(options, budget, observed, phase) {
  const limit = normalizeQueryBudgetLimit(options.budget?.[budget]);
  if (limit === undefined || observed <= limit) return { ok: true };
  return {
    ok: false,
    error: mutationError(
      'SANSA_MUTATE_BUDGET_EXCEEDED',
      `Mutation budget '${budget}' exceeded: limit ${limit}, observed ${observed}`,
      { phase, budget, limit, observed },
    ),
  };
}

function verifyPlannedMutationPreconditions(preconditions, namespace, options) {
  if (!Array.isArray(preconditions) || preconditions.length === 0) return { ok: true };

  let valueSemanticsProfile;
  try {
    valueSemanticsProfile = getValueSemanticsProfile(options.valueSemantics);
  } catch (error) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_INVALID_VALUE_SEMANTICS_PROFILE',
        error instanceof Error ? error.message : 'Invalid value-semantics profile',
      ),
    };
  }

  const evaluationOptions = {
    ...options,
    valueSemantics: valueSemanticsProfile,
  };
  for (let preconditionIndex = 0; preconditionIndex < preconditions.length; preconditionIndex += 1) {
    const precondition = verifyPlannedMutationPrecondition(
      preconditions[preconditionIndex],
      preconditionIndex,
      namespace,
      evaluationOptions,
    );
    if (!precondition.ok) return precondition;
  }
  return { ok: true };
}

function verifyPlannedMutationPrecondition(precondition, preconditionIndex, namespace, options) {
  if (!precondition || typeof precondition !== 'object' || typeof precondition.expression !== 'string') {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_INVALID_PRECONDITION',
        'Planned mutation preconditions must preserve an expression string',
        { preconditionIndex },
      ),
    };
  }

  const parsed = parseQueryExpression(precondition.canonical ?? precondition.expression, mutationQueryExpressionParseOptions(options));
  if (!parsed.ok) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_INVALID_PRECONDITION',
        'Planned mutation precondition expression is not valid',
        { preconditionIndex, cause: parsed.errors[0] },
      ),
    };
  }

  const context = resolvePlannedMutationPreconditionContext(precondition, preconditionIndex, namespace, options);
  if (!context.ok) return context;

  const evaluated = evaluateQueryExpressionValue(parsed.expression, context.binding, namespace, options);
  if (!evaluated.ok) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED',
        evaluated.error.message,
        { preconditionIndex, cause: evaluated.error },
      ),
    };
  }

  const boolean = expectBooleanQueryValue(evaluated.value, namespace);
  if (!boolean.ok) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED',
        boolean.error.message,
        { preconditionIndex, cause: boolean.error },
      ),
    };
  }
  if (boolean.value !== true) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_PRECONDITION_FAILED',
        'Mutation precondition no longer holds at apply time',
        { preconditionIndex },
      ),
    };
  }

  return { ok: true };
}

function resolvePlannedMutationPreconditionContext(precondition, preconditionIndex, namespace, options) {
  if (precondition.target !== undefined) {
    const stable = verifyMutationTargetStability(precondition.target, undefined, namespace, options);
    if (!stable.ok) {
      return {
        ok: false,
        error: mutationError(
          'SANSA_MUTATE_STALE_TARGET',
          stable.error.message,
          { preconditionIndex, cause: stable.error },
        ),
      };
    }
    return { ok: true, binding: precondition.target.binding };
  }

  const rootResult = resolveRoot({ kind: 'absolute' }, namespace, options.resolve ?? {});
  if (!rootResult.ok) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_PRECONDITION_EVALUATION_FAILED',
        rootResult.error.message,
        { preconditionIndex, cause: rootResult.error },
      ),
    };
  }
  return { ok: true, binding: rootResult.binding };
}

function planMutationOperation(requested, operationIndex, namespace, options) {
  if (!requested || typeof requested !== 'object') {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_INVALID_OPERATION', 'Expected mutation operation object', { operationIndex }),
    };
  }

  switch (requested.op) {
    case 'create':
      return planCreateOperation(requested, operationIndex, namespace, options);
    case 'replace':
      return planReplaceOperation(requested, operationIndex, namespace, options);
    case 'remove':
      return planRemoveOperation(requested, operationIndex, namespace, options);
    case 'insert':
      return planInsertOperation(requested, operationIndex, namespace, options);
    case 'move':
      return planMoveOperation(requested, operationIndex, namespace, options);
    default:
      return {
        ok: false,
        error: mutationError(
          'SANSA_MUTATE_UNSUPPORTED_OPERATION',
          `Unsupported mutation operation: ${requested.op}`,
          { operationIndex },
        ),
      };
  }
}

function planCreateOperation(requested, operationIndex, namespace, options) {
  const parent = resolveMutationExactTarget(requested.parent, 'parent', operationIndex, namespace, options);
  if (!parent.ok) return parent;
  if (typeof requested.name !== 'string' || requested.name.length === 0) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_INVALID_NAME', 'Create requires a non-empty string name', { operationIndex }),
    };
  }
  if (selectMember(namespace, parent.target.binding, requested.name).length > 0) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_TARGET_EXISTS',
        `Create target '${requested.name}' already exists under ${parent.target.canonicalAddress}`,
        { operationIndex },
      ),
    };
  }
  return {
    ok: true,
    operation: {
      op: 'create',
      parent: parent.target,
      name: requested.name,
      value: requested.value,
      ...mutationProvenance(requested),
    },
  };
}

function planReplaceOperation(requested, operationIndex, namespace, options) {
  const target = resolveMutationExactTarget(requested.target, 'target', operationIndex, namespace, options);
  if (!target.ok) return target;
  return {
    ok: true,
    operation: {
      op: 'replace',
      target: target.target,
      value: requested.value,
      ...mutationProvenance(requested),
    },
  };
}

function planRemoveOperation(requested, operationIndex, namespace, options) {
  const target = resolveMutationExactTarget(requested.target, 'target', operationIndex, namespace, options);
  if (!target.ok) return target;
  if (target.target.address.root.kind === 'absolute' && target.target.address.selectors.length === 0) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_ROOT_REMOVE_FORBIDDEN', 'The conservative mutation core does not remove the namespace root', { operationIndex }),
    };
  }
  return {
    ok: true,
    operation: {
      op: 'remove',
      target: target.target,
      ...mutationProvenance(requested),
    },
  };
}

function planInsertOperation(requested, operationIndex, namespace, options) {
  const container = resolveMutationExactTarget(requested.container, 'container', operationIndex, namespace, options);
  if (!container.ok) return container;
  const placement = resolveMutationPlacement(requested.placement, container.target, operationIndex, namespace, options);
  if (!placement.ok) return placement;
  return {
    ok: true,
    operation: {
      op: 'insert',
      container: container.target,
      placement: placement.placement,
      value: requested.value,
      ...mutationProvenance(requested),
    },
  };
}

function planMoveOperation(requested, operationIndex, namespace, options) {
  const source = resolveMutationExactTarget(requested.source, 'source', operationIndex, namespace, options);
  if (!source.ok) return source;
  const container = resolveMutationExactTarget(requested.container, 'container', operationIndex, namespace, options);
  if (!container.ok) return container;
  if (!isDirectChildOfContainer(namespace, source.target.binding, container.target.binding)) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_INVALID_MOVE_CONTAINER',
        'The conservative mutation core only moves bindings within their current ordered container',
        { operationIndex },
      ),
    };
  }
  const placement = resolveMutationPlacement(requested.placement, container.target, operationIndex, namespace, options);
  if (!placement.ok) return placement;
  if (placement.placement.anchor && sameMutationBinding(source.target, placement.placement.anchor, namespace)) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_INVALID_MOVE_ANCHOR', 'Move placement anchor must not be the moved source binding', { operationIndex }),
    };
  }
  return {
    ok: true,
    operation: {
      op: 'move',
      source: source.target,
      container: container.target,
      placement: placement.placement,
      ...mutationProvenance(requested),
    },
  };
}

function resolveMutationPlacement(placement, containerTarget, operationIndex, namespace, options) {
  const kind = typeof placement === 'string' ? placement : placement?.kind;
  if (kind !== 'first' && kind !== 'last' && kind !== 'before' && kind !== 'after') {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_UNSUPPORTED_PLACEMENT', 'Placement must be first, last, before, or after', { operationIndex }),
    };
  }
  if (kind === 'first' || kind === 'last') return { ok: true, placement: { kind } };

  const anchorInput = placement.anchor ?? placement.target;
  const anchor = resolveMutationExactTarget(anchorInput, 'anchor', operationIndex, namespace, options);
  if (!anchor.ok) return anchor;
  if (!isDirectChildOfContainer(namespace, anchor.target.binding, containerTarget.binding)) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_INVALID_ANCHOR',
        'Ordered insertion and movement anchors must be direct children of the target container',
        { operationIndex },
      ),
    };
  }
  return { ok: true, placement: { kind, anchor: anchor.target } };
}

function resolveMutationExactTarget(input, role, operationIndex, namespace, options) {
  const parsed = typeof input === 'string' ? parseAddress(input, options.parse) : { ok: true, address: input };
  if (!parsed.ok) {
    return {
      ok: false,
      error: mutationError(
        'SANSA_MUTATE_INVALID_TARGET',
        `${capitalize(role)} address is not a valid SANSA address`,
        { operationIndex, cause: parsed.errors[0] },
      ),
    };
  }
  if (!parsed.address || parsed.address.type !== 'SansaAddress') {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_INVALID_TARGET', `${capitalize(role)} must be a SANSA address`, { operationIndex }),
    };
  }
  if (!parsed.address.isExact) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_NON_EXACT_TARGET', `${capitalize(role)} address must be exact`, { operationIndex }),
    };
  }

  const resolved = resolveAddress(parsed.address, namespace, options.resolve);
  if (!resolved.ok) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_TARGET_RESOLUTION_FAILED', `${capitalize(role)} address failed to resolve`, {
        operationIndex,
        cause: resolved.errors[0],
      }),
    };
  }
  if (resolved.bindings.length === 0) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_TARGET_MISS', `${capitalize(role)} address resolved no bindings`, { operationIndex }),
    };
  }
  if (resolved.bindings.length > 1) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_TARGET_MULTIPLICITY', `${capitalize(role)} address resolved multiple bindings`, { operationIndex }),
    };
  }

  const binding = resolved.bindings[0];
  const canonicalAddress = getBindingAddress(binding) ?? parsed.address.canonical;
  return {
    ok: true,
    target: {
      requestedAddress: typeof input === 'string' ? input : renderAddress(parsed.address),
      canonicalAddress,
      address: parsed.address,
      binding,
      ...mutationBindingIdentity(namespace, binding),
      ...mutationTargetWarnings(parsed.warnings),
    },
  };
}

function collectMutationPortabilityWarnings(operations, preconditions) {
  const warnings = [];
  for (const operation of operations) {
    for (const target of mutationOperationTargets(operation)) {
      warnings.push(...(target.portabilityWarnings ?? []));
    }
  }
  for (const precondition of preconditions) {
    warnings.push(...(precondition.target?.portabilityWarnings ?? []));
  }
  return warnings;
}

function mutationTargetWarnings(warnings) {
  const portabilityWarnings = (warnings ?? []).filter((warning) => warning.code?.startsWith('SANSA_NON_PORTABLE_'));
  return portabilityWarnings.length === 0 ? {} : { portabilityWarnings };
}

function checkMutationPlanConflict(operation, seenDestructiveTargets, seenCreates) {
  if (operation.op === 'create') {
    const key = `${mutationTargetKey(operation.parent)}\u0000${operation.name}`;
    if (seenCreates.has(key)) {
      return { ok: false, code: 'SANSA_MUTATE_DUPLICATE_TARGET', message: 'Plan contains repeated create for the same parent/name' };
    }
    seenCreates.add(key);
    return { ok: true };
  }
  for (const target of mutationOperationDestructiveTargets(operation)) {
    const key = mutationTargetKey(target);
    if (seenDestructiveTargets.has(key)) {
      return { ok: false, code: 'SANSA_MUTATE_DUPLICATE_TARGET', message: 'Plan contains repeated destructive operation for the same binding' };
    }
    seenDestructiveTargets.add(key);
  }
  return { ok: true };
}

function mutationOperationDestructiveTargets(operation) {
  if (operation.op === 'replace' || operation.op === 'remove') return [operation.target];
  if (operation.op === 'move') return [operation.source];
  return [];
}

function verifyMutationOperationStability(operation, operationIndex, namespace, options) {
  const targets = mutationOperationTargets(operation);
  for (const target of targets) {
    const stable = verifyMutationTargetStability(target, operationIndex, namespace, options);
    if (!stable.ok) return stable;
  }
  return { ok: true };
}

function verifyMutationTargetStability(target, operationIndex, namespace, options) {
  const resolved = resolveAddress(target.address, namespace, options.resolve);
  if (!resolved.ok || resolved.bindings.length !== 1) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_STALE_TARGET', `Mutation target is stale: ${target.canonicalAddress}`, { operationIndex }),
    };
  }
  const current = resolved.bindings[0];
  if (!sameMutationBinding(target, { binding: current, ...mutationBindingIdentity(namespace, current) }, namespace)) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_STALE_TARGET', `Mutation target identity changed: ${target.canonicalAddress}`, { operationIndex }),
    };
  }
  const observedState = mutationObservedState(namespace, current);
  if (target.observedState !== undefined && observedState !== undefined && target.observedState !== observedState) {
    return {
      ok: false,
      error: mutationError('SANSA_MUTATE_STALE_TARGET', `Mutation target state changed: ${target.canonicalAddress}`, { operationIndex }),
    };
  }
  return { ok: true };
}

function mutationOperationTargets(operation) {
  switch (operation.op) {
    case 'create':
      return [operation.parent];
    case 'replace':
    case 'remove':
      return [operation.target];
    case 'insert':
      return operation.placement.anchor ? [operation.container, operation.placement.anchor] : [operation.container];
    case 'move':
      return operation.placement.anchor
        ? [operation.source, operation.container, operation.placement.anchor]
        : [operation.source, operation.container];
    default:
      return [];
  }
}

function applyMutationOperation(operation, hook) {
  try {
    let result;
    if (operation.op === 'create') {
      result = hook(operation.parent.binding, operation.name, operation.value, operation);
    } else if (operation.op === 'replace') {
      result = hook(operation.target.binding, operation.value, operation);
    } else if (operation.op === 'remove') {
      result = hook(operation.target.binding, operation);
    } else if (operation.op === 'insert') {
      result = hook(operation.container.binding, operation.placement, operation.value, operation);
    } else if (operation.op === 'move') {
      result = hook(operation.source.binding, operation.container.binding, operation.placement, operation);
    }
    if (result && typeof result === 'object' && result.ok === false) {
      return { ok: false, message: result.message ?? result.error?.message ?? 'Mutation adapter rejected operation' };
    }
    const affectedBinding = result?.binding ?? result?.affectedBinding
      ?? operation.target?.binding
      ?? operation.source?.binding
      ?? operation.parent?.binding
      ?? operation.container?.binding;
    const fallbackAffectedAddress = getBindingAddress(affectedBinding);
    return {
      ok: true,
      previousAddress: operation.target?.canonicalAddress ?? operation.source?.canonicalAddress,
      affectedAddress: result?.affectedAddress ?? fallbackAffectedAddress,
      resultingAddress: result?.resultingAddress ?? fallbackMutationResultingAddress(operation, fallbackAffectedAddress),
      affectedBinding,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Mutation adapter threw while applying operation',
    };
  }
}

function mutationOperationReportAddresses(operation) {
  const output = {};
  if (operation.target?.canonicalAddress) output.targetAddress = operation.target.canonicalAddress;
  if (operation.parent?.canonicalAddress) output.parentAddress = operation.parent.canonicalAddress;
  if (operation.container?.canonicalAddress) output.containerAddress = operation.container.canonicalAddress;
  if (operation.source?.canonicalAddress) output.sourceAddress = operation.source.canonicalAddress;
  if (operation.placement?.anchor?.canonicalAddress) output.anchorAddress = operation.placement.anchor.canonicalAddress;
  return output;
}

function fallbackMutationResultingAddress(operation, affectedAddress) {
  if (operation.op === 'remove') return undefined;
  if (operation.op === 'create' && operation.parent?.canonicalAddress) {
    return appendMemberAddress(operation.parent.canonicalAddress, operation.name);
  }
  return affectedAddress;
}

function appendMemberAddress(parentAddress, name) {
  return IDENTIFIER_RE.test(name)
    ? `${parentAddress}.${name}`
    : `${parentAddress}.[${quotePayload(name)}]`;
}

function mutationHookForOperation(operation, adapter) {
  const capabilityFlag = mutationCapabilityFlagForOperation(operation.op);
  if (capabilityFlag && adapter?.[capabilityFlag] === false) {
    return {
      ok: false,
      code: 'SANSA_MUTATE_UNSUPPORTED_ADAPTER_OPERATION',
      message: `Mutation adapter does not advertise '${operation.op}' support`,
    };
  }
  const hook = adapter?.[operation.op];
  if (typeof hook === 'function') return { ok: true, hook };
  return {
    ok: false,
    code: 'SANSA_MUTATE_UNSUPPORTED_ADAPTER_OPERATION',
    message: `Mutation adapter does not support '${operation.op}'`,
  };
}

function mutationCapabilityFlagForOperation(op) {
  switch (op) {
    case 'create':
      return 'supportsCreate';
    case 'replace':
      return 'supportsReplace';
    case 'remove':
      return 'supportsRemove';
    case 'insert':
      return 'supportsOrderedInsert';
    case 'move':
      return 'supportsMove';
    default:
      return null;
  }
}

function mutationAdapter(namespace) {
  return namespace?.mutate && typeof namespace.mutate === 'object' ? namespace.mutate : namespace;
}

function mutationBindingIdentity(namespace, binding) {
  const identity = {};
  const handle = mutationBindingHandle(namespace, binding);
  const observedState = mutationObservedState(namespace, binding);
  if (handle !== undefined) identity.bindingHandle = handle;
  if (observedState !== undefined) identity.observedState = observedState;
  return identity;
}

function mutationBindingHandle(namespace, binding) {
  if (typeof namespace?.bindingHandle === 'function') return namespace.bindingHandle(binding);
  if (typeof namespace?.mutate?.bindingHandle === 'function') return namespace.mutate.bindingHandle(binding);
  return binding.bindingHandle ?? binding.handle ?? binding.id;
}

function mutationObservedState(namespace, binding) {
  if (typeof namespace?.observedState === 'function') return namespace.observedState(binding);
  if (typeof namespace?.mutate?.observedState === 'function') return namespace.mutate.observedState(binding);
  return binding.observedState ?? binding.revision ?? binding.version;
}

function getNamespaceState(namespace) {
  if (typeof namespace?.namespaceState === 'function') return namespace.namespaceState();
  if (typeof namespace?.mutate?.namespaceState === 'function') return namespace.mutate.namespaceState();
  return namespace?.namespaceState ?? namespace?.state;
}

function sameMutationBinding(left, right, namespace) {
  if (left.binding === right.binding) return true;
  const adapter = mutationAdapter(namespace);
  if (typeof adapter?.sameBinding === 'function') return adapter.sameBinding(left.binding, right.binding) === true;
  if (left.bindingHandle !== undefined && right.bindingHandle !== undefined) return left.bindingHandle === right.bindingHandle;
  return false;
}

function isDirectChildOfContainer(namespace, child, container) {
  if (typeof namespace.parent === 'function' && namespace.parent(child) === container) return true;
  if (child.parent === container) return true;
  return getChildren(namespace, container).includes(child);
}

function mutationTargetKey(target) {
  if (target.bindingHandle !== undefined) return `handle:${String(target.bindingHandle)}`;
  return `address:${target.canonicalAddress}`;
}

function mutationProvenance(requested) {
  return requested.provenance === undefined ? {} : { provenance: requested.provenance };
}

function mutationError(code, message, details = {}) {
  return { code, message, ...details };
}

function capitalize(value) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function enforceQueryPolicy(query, options) {
  if (!isValidationQueryPolicy(options.policy)) return { ok: true };

  if (query.orderBy) return queryPolicyViolation('Validation query policy does not allow order by clauses');
  if (query.offset) return queryPolicyViolation('Validation query policy does not allow offset clauses');
  if (query.limit) return queryPolicyViolation('Validation query policy does not allow limit clauses');
  if (query.select.ast.type === 'projectionExpression') {
    return queryPolicyViolation('Validation query policy does not allow object projection expressions');
  }

  const expressions = [
    ...(query.from.source === 'expression' ? [query.from.ast] : []),
    ...(query.where ? [query.where.ast] : []),
    ...(query.orderBy ? query.orderBy.keys.map((key) => key.ast) : []),
    query.select.ast,
  ];
  const disallowedFunction = expressions
    .map((expression) => findExpression(expression, (entry) => entry.type === 'functionCallExpression'
      && TRANSFORM_EXTENSION_FUNCTIONS.has(entry.name)))
    .find(Boolean);
  if (disallowedFunction) {
    return queryPolicyViolation(
      `Validation query policy does not allow transform extension function '${disallowedFunction.name}'`,
      { extension: TRANSFORM_EXTENSION_FUNCTIONS.get(disallowedFunction.name) },
    );
  }

  return { ok: true };
}

function isValidationQueryPolicy(policy) {
  return policy === 'validation'
    || policy?.mode === 'validation'
    || policy?.validation === true;
}

function queryPolicyViolation(message, details = {}) {
  return {
    ok: false,
    error: queryEvaluateError('SANSA_QUERY_POLICY_VIOLATION', message, details),
  };
}

function checkQueryBudget(options, budget, observed) {
  const limit = normalizeQueryBudgetLimit(options.budget?.[budget]);
  if (limit === undefined || observed <= limit) return { ok: true };
  return {
    ok: false,
    error: queryEvaluateError(
      'SANSA_QUERY_BUDGET_EXCEEDED',
      `Query budget '${budget}' exceeded: limit ${limit}, observed ${observed}`,
      { budget, limit, observed },
    ),
  };
}

function normalizeQueryBudgetLimit(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function findExpression(expression, predicate) {
  if (predicate(expression)) return expression;

  switch (expression.type) {
    case 'groupExpression':
      return findExpression(expression.expression, predicate);
    case 'unaryExpression':
      return findExpression(expression.argument, predicate);
    case 'binaryExpression':
      return findExpression(expression.left, predicate)
        ?? findExpression(expression.right, predicate);
    case 'functionCallExpression':
      for (const argument of expression.arguments) {
        const found = findExpression(argument, predicate);
        if (found) return found;
      }
      return null;
    case 'existenceExpression':
    case 'cardinalityExpression':
      return findExpression(expression.argument, predicate);
    case 'projectionExpression':
      for (const field of expression.fields) {
        const found = findExpression(field.expression, predicate);
        if (found) return found;
      }
      return null;
    default:
      return null;
  }
}

export function resolveAddress(input, namespace, options = {}) {
  const parsed = typeof input === 'string' ? parseAddress(input, options.parse) : { ok: true, address: input };
  if (!parsed.ok) return { ok: false, bindings: [], errors: parsed.errors };

  const rootResult = resolveRoot(parsed.address.root, namespace, options);
  if (!rootResult.ok) return { ok: false, bindings: [], errors: [rootResult.error] };

  let current = [rootResult.binding];
  for (let index = 0; index < parsed.address.selectors.length; index += 1) {
    const selector = parsed.address.selectors[index];
    const selected = applyResolveSelector(
      selector,
      current,
      namespace,
      index,
      {
        effectiveRoot: options.allowParentFromEffectiveRoot === true ? undefined : rootResult.binding,
        parentTraversal: options.parentTraversal,
        failOnParentFromEffectiveRoot: options.failOnParentFromEffectiveRoot === true,
      },
    );
    if (!selected.ok) return { ok: false, bindings: [], errors: [selected.error] };
    current = selected.bindings;
    if (current.length === 0) break;
  }

  if (parsed.address.isExact && current.length > 1) {
    return {
      ok: false,
      bindings: [],
      errors: [
        resolveError(
          'SANSA_RESOLVE_EXACT_MULTIPLICITY_VIOLATION',
          'Exact SANSA resolution produced more than one binding',
        ),
      ],
    };
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
      return expression.canonical ?? (expression.kind === 'string' ? quotePayload(expression.value) : String(expression.value));
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
    const binding = options.contextualRoot ?? namespace.contextualRoot;
    if (isBindingObject(binding)) return { ok: true, binding };
    return {
      ok: false,
      error: resolveError('SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT', 'Contextual root requires a contextualRoot binding'),
    };
  }

  const rootBinding = typeof namespace.root === 'function' ? namespace.root() : namespace.root;
  if (rootBinding) return { ok: true, binding: rootBinding };
  return { ok: false, error: resolveError('SANSA_RESOLVE_MISSING_ROOT', 'SANSA resolve namespace does not expose a root binding') };
}

function isBindingObject(value) {
  return value !== null && typeof value === 'object';
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
        value: scalarQueryValue(
          expression.value,
          queryLiteralMetadata(expression),
        ).value,
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
    ...(expression.scope === 'current' ? { allowParentFromEffectiveRoot: true } : {}),
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
    return evaluateMembershipExpression(left.value, right.value, namespace, options);
  }

  const leftScalar = expectComparableQueryValue(left.value, namespace);
  if (!leftScalar.ok) return leftScalar;
  const rightScalar = expectComparableQueryValue(right.value, namespace);
  if (!rightScalar.ok) return rightScalar;
  return compareQueryScalars(expression.operator, leftScalar, rightScalar, options);
}

function evaluateMembershipExpression(leftValue, rightValue, namespace, options) {
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
    const compared = compareQueryScalars('==', leftScalar, rightScalar, options);
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
  if (expression.name === 'resolveChild') {
    return evaluateResolveChildExpression(expression, currentBinding, namespace, options);
  }
  if (expression.name === 'follow') {
    return evaluateFollowExpression(expression, currentBinding, namespace, options);
  }
  if (expression.name === 'objectFrom') {
    const extension = expectEnabledExtension(expression.name, options);
    if (!extension.ok) return extension;
    return evaluateObjectFromExpression(expression, currentBinding, namespace, options);
  }
  if (expression.name === 'fieldsFrom') {
    const extension = expectEnabledExtension(expression.name, options);
    if (!extension.ok) return extension;
    return evaluateFieldsFromExpression(expression, currentBinding, namespace, options);
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

  return evaluateOrdinaryFunction(expression.name, evaluatedArgs, options);
}

function expectEnabledExtension(functionName, options) {
  const extensionId = TRANSFORM_EXTENSION_FUNCTIONS.get(functionName);
  if (!extensionId || isExtensionEnabled(extensionId, options)) return { ok: true };
  return {
    ok: false,
    error: queryEvaluateError(
      'SANSA_QUERY_EVALUATE_UNSUPPORTED_EXTENSION',
      `Function '${functionName}' requires disabled extension '${extensionId}'`,
      { extension: extensionId },
    ),
  };
}

function isExtensionEnabled(extensionId, options) {
  const enabledExtensions = options.enabledExtensions;
  if (Array.isArray(enabledExtensions)) return enabledExtensions.includes(extensionId);

  const extensions = options.extensions;
  if (!extensions || typeof extensions !== 'object') return true;
  if (extensions.transform === false) return false;
  if (extensions.transform === true) return true;
  if (extensionId === 'sansa.transform.objectFrom' && extensions.objectFrom === false) return false;
  if (extensionId === 'sansa.transform.fieldsFrom' && extensions.fieldsFrom === false) return false;
  return true;
}

function isOrdinaryFunctionName(name) {
  return ['contains', 'startsWith', 'endsWith', 'lower', 'upper', 'concat'].includes(name);
}

function evaluateOrdinaryFunction(name, evaluatedArgs, options = {}) {
  const profile = getValueSemanticsProfile(options.valueSemantics);
  switch (name) {
    case 'contains':
      return evaluateStringFunction(name, evaluatedArgs, 2, ([value, search]) => value.includes(search));
    case 'startsWith':
      return evaluateStringFunction(name, evaluatedArgs, 2, ([value, search]) => value.startsWith(search));
    case 'endsWith':
      return evaluateStringFunction(name, evaluatedArgs, 2, ([value, search]) => value.endsWith(search));
    case 'lower':
      return evaluateStringFunction(name, evaluatedArgs, 1, ([value]) => profile.lowerString(value));
    case 'upper':
      return evaluateStringFunction(name, evaluatedArgs, 1, ([value]) => profile.upperString(value));
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

function evaluateResolveChildExpression(expression, currentBinding, namespace, options) {
  if (expression.arguments.length !== 2) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'resolveChild' expects 2 arguments"),
    };
  }

  const baseResolution = unwrapResolutionExpression(expression.arguments[0]);
  if (!baseResolution) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'resolveChild' expects a resolution expression base"),
    };
  }

  const base = evaluateResolutionExpression(baseResolution, currentBinding, namespace, options);
  if (!base.ok) return base;
  if (base.value.bindings.length === 0) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_MISSING_SCALAR', "Function 'resolveChild' expected one base binding but resolved none"),
    };
  }
  if (base.value.bindings.length > 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', "Function 'resolveChild' expected one base binding but resolved multiple bindings"),
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
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'resolveChild' expects a string member key or non-negative integer position key"),
    };
  }

  if (bindings.length > 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', "Function 'resolveChild' target resolved multiple bindings"),
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

function evaluateFollowExpression(expression, currentBinding, namespace, options) {
  if (expression.arguments.length !== 1) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'follow' expects 1 argument"),
    };
  }

  const evaluated = evaluateQueryExpressionValue(expression.arguments[0], currentBinding, namespace, options);
  if (!evaluated.ok) return evaluated;
  const scalar = expectScalarQueryValue(evaluated.value, namespace);
  if (!scalar.ok) return scalar;
  if (!isReferenceFormValue(scalar.value, scalar.metadata)) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'follow' expects an AEON reference form"),
    };
  }

  const target = referenceTargetAddress(scalar.value, options.parse?.address);
  if (!target.ok) return target;
  if (!target.address.isExact) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_REFERENCE_TARGET', "Function 'follow' requires an exact reference target path"),
    };
  }

  const resolved = resolveAddress(target.address, namespace, options.resolve);
  if (!resolved.ok) return { ok: false, error: resolved.errors[0] };
  if (resolved.bindings.length === 0) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_MISSING_REFERENCE_TARGET', "Function 'follow' target resolved no binding"),
    };
  }

  return {
    ok: true,
    value: {
      type: 'bindingSet',
      bindings: resolved.bindings,
    },
  };
}

function isReferenceFormValue(value, metadata) {
  if (metadata?.kind === 'referenceForm' || metadata?.category === 'referenceForm') return true;
  return value?.type === 'CloneReference' || value?.type === 'PointerReference';
}

function referenceTargetAddress(value, parseOptions) {
  const source = referenceTargetAddressSource(value);
  if (source === null) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_REFERENCE_TARGET', "Function 'follow' received a reference without a target path"),
    };
  }
  const parsed = parseAddress(source, parseOptions);
  if (!parsed.ok) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_REFERENCE_TARGET', "Function 'follow' received an invalid reference target path", {
        cause: parsed.errors[0],
      }),
    };
  }
  return { ok: true, address: parsed.address };
}

function referenceTargetAddressSource(value) {
  const pathSource = referencePathSource(value);
  if (pathSource === null) return null;
  if (pathSource.startsWith('$')) return pathSource;
  if (pathSource.startsWith('?')) return null;
  if (pathSource.startsWith('.') || pathSource.startsWith('[')) return `$${pathSource}`;
  return `$.${pathSource}`;
}

function referencePathSource(value) {
  if (Array.isArray(value?.path)) return renderReferencePathSegments(value.path);
  if (typeof value?.path === 'string') return value.path;
  if (typeof value?.target === 'string') return value.target;
  if (typeof value?.canonical === 'string') {
    if (value.canonical.startsWith('~>')) return value.canonical.slice(2);
    if (value.canonical.startsWith('~')) return value.canonical.slice(1);
  }
  return null;
}

function renderReferencePathSegments(path) {
  return path.map((segment, index) => {
    if (typeof segment === 'number') return `[${segment}]`;
    if (typeof segment === 'string' && IDENTIFIER_RE.test(segment)) {
      return index === 0 ? segment : `.${segment}`;
    }
    return `${index === 0 ? '' : '.'}[${quotePayload(String(segment))}]`;
  }).join('');
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

  return objectFromBindingSets(keys.value.bindings, values.value.bindings, namespace, 'objectFrom');
}

function evaluateFieldsFromExpression(expression, currentBinding, namespace, options) {
  if (expression.arguments.length < 3) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'fieldsFrom' expects headers, values, and at least one field name"),
    };
  }

  const keyResolution = unwrapResolutionExpression(expression.arguments[0]);
  const valueResolution = unwrapResolutionExpression(expression.arguments[1]);
  if (!keyResolution || !valueResolution) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'fieldsFrom' expects resolution expression header and value arguments"),
    };
  }

  const requested = [];
  for (const argument of expression.arguments.slice(2)) {
    const evaluated = evaluateQueryExpressionValue(argument, currentBinding, namespace, options);
    if (!evaluated.ok) return evaluated;
    const scalar = expectScalarQueryValue(evaluated.value, namespace);
    if (!scalar.ok) return scalar;
    if (typeof scalar.value !== 'string') {
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', "Function 'fieldsFrom' expects string field names"),
      };
    }
    if (requested.includes(scalar.value)) {
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', `Function 'fieldsFrom' received duplicate requested field '${scalar.value}'`),
      };
    }
    requested.push(scalar.value);
  }

  const keys = evaluateResolutionExpression(keyResolution, currentBinding, namespace, options);
  if (!keys.ok) return keys;
  const values = evaluateResolutionExpression(valueResolution, currentBinding, namespace, options);
  if (!values.ok) return values;

  return objectFromBindingSets(keys.value.bindings, values.value.bindings, namespace, 'fieldsFrom', new Set(requested));
}

function objectFromBindingSets(keyBindings, valueBindings, namespace, functionName, requestedFields = null) {
  if (keyBindings.length !== valueBindings.length) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_CARDINALITY', `Function '${functionName}' expected key and value binding sets with equal length`),
    };
  }

  const output = {};
  const fieldMetadata = {};
  const observedRequestedFields = new Set();
  for (let index = 0; index < keyBindings.length; index += 1) {
    const keyScalar = getBindingScalarValue(namespace, keyBindings[index]);
    if (!keyScalar.ok) return keyScalar;
    if (typeof keyScalar.value !== 'string') {
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', `Function '${functionName}' expects string key bindings`),
      };
    }
    if (requestedFields && !requestedFields.has(keyScalar.value)) continue;
    if (Object.hasOwn(output, keyScalar.value)) {
      return {
        ok: false,
        error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_FUNCTION_CALL', `Function '${functionName}' received duplicate key '${keyScalar.value}'`),
      };
    }

    const valueScalar = getBindingScalarValue(namespace, valueBindings[index]);
    if (!valueScalar.ok) return valueScalar;
    output[keyScalar.value] = valueScalar.value;
    observedRequestedFields.add(keyScalar.value);
    if (valueScalar.metadata) fieldMetadata[keyScalar.value] = valueScalar.metadata;
  }
  if (requestedFields) {
    for (const field of requestedFields) {
      if (!observedRequestedFields.has(field)) {
        return {
          ok: false,
          error: queryEvaluateError('SANSA_QUERY_EVALUATE_MISSING_SCALAR', `Function '${functionName}' could not find requested field '${field}'`),
        };
      }
    }
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
    return scalarBoolean(isConcreteValueScalar({
      value: value.value,
      ...(value[QUERY_VALUE_METADATA_PROPERTY]?.kind === undefined ? {} : { kind: value[QUERY_VALUE_METADATA_PROPERTY].kind }),
    }));
  }
  if (value.type === 'object') return scalarBoolean(true);
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
    if (scalar.error.code === 'SANSA_QUERY_EVALUATE_MISSING_SCALAR' && isContainerBinding(namespace, value.bindings[0])) {
      return scalarBoolean(true);
    }
    if (scalar.error.code === 'SANSA_QUERY_EVALUATE_MISSING_SCALAR') return scalarBoolean(false);
    return scalar;
  }
  return scalarBoolean(isConcreteValueScalar(scalar));
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

function isConcreteValueScalar(info) {
  if (isNanScalar(info) || isExplicitNullScalar(info) || isExplicitAbsenceScalar(info)) return false;
  if (info.kind === 'missing' || info.category === 'missing') return false;
  if (info.category === 'bindingSet' || info.kind === 'bindingSet') return false;
  if (info.value === undefined && !['container', 'referenceForm', 'sansaAddress', 'lexicalStructuredScalar', 'temporal', 'toggle'].includes(info.category)) {
    return false;
  }
  return true;
}

function scalarBoolean(value) {
  return scalarQueryValue(value);
}

function queryLiteralMetadata(expression) {
  switch (expression.kind) {
    case 'toggle':
      return { kind: 'toggle', category: 'toggle' };
    case 'hex':
      return { kind: 'hex', category: 'hex' };
    case 'radix':
      return { kind: 'radix', category: 'radix' };
    case 'encoding':
      return { kind: 'encoding', category: 'encoding' };
    case 'separator':
      return { kind: 'separator', category: 'separator' };
    case 'date':
    case 'time':
    case 'datetime':
    case 'zrut':
      return { kind: expression.kind, category: 'temporal', semanticType: expression.kind };
    case 'null':
      return { kind: 'null', category: 'explicitNull', nullReason: expression.nullReason };
    default:
      return undefined;
  }
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
      ? compareQueryScalars(expression.operator, bindingScalar, scalarValue, options)
      : compareQueryScalars(expression.operator, scalarValue, bindingScalar, options);
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
      const descriptor = scalarInfoToValueDescriptor(queryScalarToInfo({
        value: scalar.value,
        metadata: scalar.metadata,
      }));
      const orderable = evaluateValueSemanticsOperation('compare', {
        left: descriptor,
        right: descriptor,
      }, {
        valueSemantics: options.valueSemantics,
      });
      if (!orderable.ok) {
        return {
          ok: false,
          error: queryEvaluateError(
            'SANSA_QUERY_EVALUATE_INVALID_COMPARISON',
            queryComparisonMessage(orderable.reason, '<'),
            { candidateAddress: getBindingAddress(binding) },
          ),
        };
      }
      keys.push({ value: scalar.value, descriptor, direction: key.direction });
    }
    keyed.push({ binding, keys, index });
  }

  for (let keyIndex = 0; keyIndex < orderBy.keys.length; keyIndex += 1) {
    const expected = keyed[0]?.keys[keyIndex].descriptor;
    const mismatched = expected
      ? keyed.find((entry) => !evaluateValueSemanticsOperation('compare', {
        left: expected,
        right: entry.keys[keyIndex].descriptor,
      }, {
        valueSemantics: options.valueSemantics,
      }).ok)
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
      const comparison = compareOrderKeyScalars(left.keys[index], right.keys[index], options.valueSemantics);
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

function compareOrderKeyScalars(left, right, valueSemantics) {
  const compared = evaluateValueSemanticsOperation('compare', {
    left: left.descriptor,
    right: right.descriptor,
  }, {
    valueSemantics,
  });
  if (!compared.ok) return 0;
  if (compared.relation === 'less') return -1;
  if (compared.relation === 'greater') return 1;
  return 0;
}

function comparePrimitiveOrderValues(left, right, valueSemantics) {
  if (typeof left === 'string') return getValueSemanticsProfile(valueSemantics).compareStrings(left, right);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function getValueSemanticsProfile(valueSemantics) {
  if (!valueSemantics) return aeonValueSemanticsDefaultProfile;
  if (valueSemantics === 'default' || valueSemantics === DEFAULT_VALUE_SEMANTICS_PROFILE_ID) {
    return aeonValueSemanticsDefaultProfile;
  }
  if (valueSemantics === CODEPOINT_STRING_PROFILE_ID) {
    return aeonValueSemanticsDefaultProfile;
  }
  if (valueSemantics === FRENCH_STRING_PROFILE_ID) {
    return createFrenchValueSemanticsProfile();
  }
  if (valueSemantics === NATURAL_ASCII_STRING_PROFILE_ID || valueSemantics === 'natural-ascii') {
    return createNaturalAsciiValueSemanticsProfile();
  }
  if (valueSemantics === 'fr' || valueSemantics === 'fr-FR') {
    return createFrenchValueSemanticsProfile({ locale: valueSemantics });
  }
  if (typeof valueSemantics === 'string') {
    return createIntlValueSemanticsProfile({ locale: valueSemantics });
  }
  if (valueSemantics.profile) return getValueSemanticsProfile(valueSemantics.profile);
  const hasCompareStrings = typeof valueSemantics.compareStrings === 'function';
  const hasLowerString = typeof valueSemantics.lowerString === 'function';
  const hasUpperString = typeof valueSemantics.upperString === 'function';
  const hasCompareTemporal = typeof valueSemantics.compareTemporal === 'function';
  if (hasCompareStrings && hasLowerString && hasUpperString) {
    return {
      ...aeonValueSemanticsDefaultProfile,
      ...valueSemantics,
      compareStrings: (left, right) => normalizeComparison(valueSemantics.compareStrings(left, right)),
      compareTemporal: typeof valueSemantics.compareTemporal === 'function'
        ? (left, right) => normalizeComparison(valueSemantics.compareTemporal(left, right))
        : aeonValueSemanticsDefaultProfile.compareTemporal,
    };
  }
  if (hasCompareStrings || hasLowerString || hasUpperString) {
    throw new Error('Custom value-semantics profiles must define compareStrings, lowerString, and upperString together.');
  }
  if (hasCompareTemporal) {
    return {
      ...aeonValueSemanticsDefaultProfile,
      ...valueSemantics,
      compareTemporal: (left, right) => normalizeComparison(valueSemantics.compareTemporal(left, right)),
    };
  }
  if (
    valueSemantics.locale
  ) {
    return createIntlValueSemanticsProfile(valueSemantics);
  }
  throw new Error('Unsupported value-semantics profile input.');
}

function normalizeComparison(value) {
  if (value < 0) return -1;
  if (value > 0) return 1;
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

function compareStringsByNaturalAsciiOrder(left, right) {
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    const leftCode = left.codePointAt(leftIndex);
    const rightCode = right.codePointAt(rightIndex);
    if (isAsciiDigitCodePoint(leftCode) && isAsciiDigitCodePoint(rightCode)) {
      const leftRun = readAsciiDigitRun(left, leftIndex);
      const rightRun = readAsciiDigitRun(right, rightIndex);
      const comparedNumber = compareAsciiDigitRuns(leftRun.text, rightRun.text);
      if (comparedNumber !== 0) return comparedNumber;
      leftIndex = leftRun.end;
      rightIndex = rightRun.end;
      continue;
    }
    if (leftCode < rightCode) return -1;
    if (leftCode > rightCode) return 1;
    leftIndex += codePointWidth(leftCode);
    rightIndex += codePointWidth(rightCode);
  }

  if (leftIndex < left.length) return 1;
  if (rightIndex < right.length) return -1;
  return 0;
}

function readAsciiDigitRun(value, start) {
  let end = start;
  while (end < value.length && isAsciiDigitCodePoint(value.codePointAt(end))) end += 1;
  return { text: value.slice(start, end), end };
}

function compareAsciiDigitRuns(left, right) {
  const leftTrimmed = left.replace(/^0+/, '') || '0';
  const rightTrimmed = right.replace(/^0+/, '') || '0';
  if (leftTrimmed.length < rightTrimmed.length) return -1;
  if (leftTrimmed.length > rightTrimmed.length) return 1;
  const lexical = compareStringsByUnicodeScalarValue(leftTrimmed, rightTrimmed);
  if (lexical !== 0) return lexical;
  if (left.length < right.length) return -1;
  if (left.length > right.length) return 1;
  return 0;
}

function compareTemporalByCanonicalValue(left, right) {
  return compareStringsByUnicodeScalarValue(String(left.payload ?? ''), String(right.payload ?? ''));
}

function isAsciiDigitCodePoint(codePoint) {
  return codePoint >= 0x30 && codePoint <= 0x39;
}

function codePointWidth(codePoint) {
  return codePoint > 0xffff ? 2 : 1;
}

export function evaluateValueSemanticsOperation(operation, input = {}, options = {}) {
  try {
    const profile = getValueSemanticsProfile(options.valueSemantics ?? input.valueSemantics ?? input.profile);
    switch (operation) {
      case 'equal':
      case 'notEqual':
        return evaluateValueSemanticsEquality(operation, input.left, input.right, profile);
      case 'compare':
        return evaluateValueSemanticsOrdering(input.left, input.right, profile);
      case 'isValue':
        return {
          ok: true,
          outcome: 'value',
          value: isConcreteValueScalar(valueDescriptorToScalarInfo(input.value)),
        };
      default:
        return valueSemanticsDiagnostic(
          'unsupported_operation',
          `Unsupported value-semantics operation '${String(operation)}'`,
        );
    }
  } catch (error) {
    return valueSemanticsDiagnostic('invalid_value_descriptor', error.message);
  }
}

function evaluateValueSemanticsEquality(operation, leftDescriptor, rightDescriptor, profile) {
  const left = valueDescriptorToScalarInfo(leftDescriptor);
  const right = valueDescriptorToScalarInfo(rightDescriptor);
  if (isNanScalar(left) || isNanScalar(right) || isExplicitNullScalar(left) || isExplicitNullScalar(right) || isExplicitAbsenceScalar(left) || isExplicitAbsenceScalar(right)) {
    return valueSemanticsDiagnostic('not_equality_comparable', 'Value category is not equality-comparable in the minimum profile');
  }
  if (left.category === 'missing' || right.category === 'missing' || left.category === 'bindingSet' || right.category === 'bindingSet') {
    return valueSemanticsDiagnostic('not_equality_comparable', 'Evaluation state or non-scalar value is not equality-comparable');
  }
  if (!sameMinimumEqualityDomain(left, right)) {
    return valueSemanticsDiagnostic('mixed_categories', 'Mixed categories do not compare by implicit coercion');
  }
  const value = compareMinimumEquality(operation, left, right, profile);
  return {
    ok: true,
    outcome: 'value',
    value,
  };
}

function evaluateValueSemanticsOrdering(leftDescriptor, rightDescriptor, profile) {
  const left = valueDescriptorToScalarInfo(leftDescriptor);
  const right = valueDescriptorToScalarInfo(rightDescriptor);
  if (isNanScalar(left) || isNanScalar(right) || isExplicitNullScalar(left) || isExplicitNullScalar(right) || isExplicitAbsenceScalar(left) || isExplicitAbsenceScalar(right)) {
    return valueSemanticsDiagnostic('not_orderable', 'Value category is not orderable in the minimum profile');
  }
  if (left.category === 'missing' || right.category === 'missing' || left.category === 'container' || right.category === 'container' || left.category === 'bindingSet' || right.category === 'bindingSet') {
    return valueSemanticsDiagnostic('not_orderable', 'Evaluation state or non-scalar value is not orderable');
  }
  if (typeof left.value === 'boolean' && typeof right.value === 'boolean') {
    return valueSemanticsDiagnostic('not_orderable', 'Boolean ordering is not part of the minimum profile');
  }
  if (!sameMinimumOrderingDomain(left, right)) {
    return valueSemanticsDiagnostic('mixed_categories', 'Mixed categories do not order by implicit coercion');
  }
  const comparison = compareMinimumOrdering(left, right, profile);
  return {
    ok: true,
    outcome: 'value',
    relation: comparison < 0 ? 'less' : comparison > 0 ? 'greater' : 'equal',
  };
}

function valueDescriptorToScalarInfo(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new Error('Value descriptor must be an object');
  }
  switch (descriptor.category) {
    case 'finiteNumber': {
      const value = Number(descriptor.value);
      if (!Number.isFinite(value)) throw new Error('finiteNumber descriptor must contain a finite numeric value');
      return { category: 'finiteNumber', value };
    }
    case 'positiveInfinity':
      return { category: 'positiveInfinity', value: Infinity, kind: 'infinity' };
    case 'negativeInfinity':
      return { category: 'negativeInfinity', value: -Infinity, kind: 'infinity' };
    case 'nan':
      return { category: 'nan', value: Number.NaN, kind: 'nan' };
    case 'string':
      return { category: 'string', value: String(descriptor.value ?? '') };
    case 'boolean':
      return { category: 'boolean', value: Boolean(descriptor.value) };
    case 'toggle':
      return { category: 'toggle', value: String(descriptor.value ?? '') };
    case 'hex':
      return { category: 'hex', value: String(descriptor.value ?? '') };
    case 'radix':
      return {
        category: 'radix',
        value: {
          payload: String(descriptor.value ?? ''),
          semanticType: descriptor.semanticType ?? 'radix',
        },
      };
    case 'encoding':
      return { category: 'encoding', value: String(descriptor.value ?? '') };
    case 'separator':
      return { category: 'separator', value: String(descriptor.value ?? '') };
    case 'sansaAddress':
      return { category: 'sansaAddress', value: sansaAddressSemanticValue(descriptor.value) };
    case 'referenceForm':
      return { category: 'referenceForm', value: descriptor.value ?? descriptor };
    case 'temporal':
      return {
        category: 'temporal',
        value: {
          payload: String(descriptor.value ?? ''),
          semanticType: descriptor.semanticType ?? 'temporal',
        },
      };
    case 'lexicalStructuredScalar':
      return { category: 'lexicalStructuredScalar', value: String(descriptor.value ?? '') };
    case 'explicitNull':
      return { category: 'explicitNull', value: null, kind: 'null', nullReason: descriptor.reason };
    case 'explicitAbsence':
      return { category: 'explicitAbsence', value: undefined, kind: 'absence', nullReason: descriptor.reason };
    case 'missing':
      return { category: 'missing', value: undefined, kind: 'missing' };
    case 'container':
      return {
        category: 'container',
        containerKind: descriptor.containerKind ?? descriptor.value?.containerKind,
        value: descriptor.value,
        kind: 'container',
      };
    case 'bindingSet':
      return { category: 'bindingSet', value: descriptor, kind: 'bindingSet' };
    default:
      throw new Error(`Unsupported value category '${String(descriptor.category)}'`);
  }
}

function scalarInfoToValueDescriptor(info) {
  if (isExplicitNullScalar(info)) {
    return { category: 'explicitNull', reason: info.nullReason };
  }
  if (isExplicitAbsenceScalar(info)) {
    return { category: 'explicitAbsence', reason: info.nullReason };
  }
  if (isNanScalar(info)) {
    return { category: 'nan' };
  }
  if (isInfinityScalar(info)) {
    return info.value === -Infinity
      ? { category: 'negativeInfinity' }
      : { category: 'positiveInfinity' };
  }
  const semanticCategory = VALUE_SEMANTICS_METADATA_CATEGORIES.includes(info.category)
    ? info.category
    : VALUE_SEMANTICS_METADATA_CATEGORIES.includes(info.kind)
      ? info.kind
      : undefined;
  if (semanticCategory) {
    const category = normalizeValueSemanticsCategory(semanticCategory);
    return {
      category,
      value: info.value,
      ...(info.semanticType === undefined ? {} : { semanticType: info.semanticType }),
      ...(info.containerKind === undefined ? {} : { containerKind: info.containerKind }),
    };
  }
  if (typeof info.value === 'number') {
    return Number.isFinite(info.value)
      ? { category: 'finiteNumber', value: String(info.value) }
      : { category: 'nan' };
  }
  if (typeof info.value === 'string') {
    return { category: 'string', value: info.value };
  }
  if (typeof info.value === 'boolean') {
    return { category: 'boolean', value: info.value };
  }
  if (info.kind === 'missing' || info.category === 'missing') {
    return { category: 'missing' };
  }
  if (info.kind === 'bindingSet' || info.category === 'bindingSet') {
    return { category: 'bindingSet', count: info.count };
  }
  return { category: 'container', value: info.value };
}

function sameMinimumEqualityDomain(left, right) {
  if (isValueSemanticsNumeric(left) && isValueSemanticsNumeric(right)) return true;
  if (left.category === 'container' || right.category === 'container') {
    return left.category === 'container'
      && right.category === 'container'
      && (left.containerKind ?? 'container') === (right.containerKind ?? 'container');
  }
  if (left.category === 'temporal' || right.category === 'temporal') {
    return left.category === 'temporal'
      && right.category === 'temporal'
      && sameTemporalDomain(left, right);
  }
  return left.category === right.category && [
    'string',
    'boolean',
    'toggle',
    'hex',
    'radix',
    'encoding',
    'separator',
    'sansaAddress',
    'referenceForm',
  ].includes(left.category);
}

function sameMinimumOrderingDomain(left, right) {
  if (isValueSemanticsNumeric(left) && isValueSemanticsNumeric(right)) return true;
  if (left.category === 'temporal' || right.category === 'temporal') {
    return left.category === 'temporal'
      && right.category === 'temporal'
      && sameTemporalDomain(left, right);
  }
  return left.category === right.category && ['string', 'encoding', 'separator', 'sansaAddress'].includes(left.category);
}

function isValueSemanticsNumeric(info) {
  return info.category === 'finiteNumber' || info.category === 'positiveInfinity' || info.category === 'negativeInfinity';
}

function sameTemporalDomain(left, right) {
  return temporalSemanticType(left) === temporalSemanticType(right);
}

function temporalSemanticType(info) {
  return String(info.value?.semanticType ?? info.semanticType ?? 'temporal');
}

function compareMinimumEquality(operation, left, right, profile) {
  if (isValueSemanticsNumeric(left) && isValueSemanticsNumeric(right)) {
    return operation === 'equal' ? left.value === right.value : left.value !== right.value;
  }
  const equals = (() => {
    if (left.category === 'string' && right.category === 'string') return profile.compareStrings(left.value, right.value) === 0;
    if (left.category === 'temporal' && right.category === 'temporal') return profile.compareTemporal(left.value, right.value) === 0;
    if (left.category === 'container' && right.category === 'container') return structurallyEqualContainers(left, right, profile);
    return structurallyEqualValues(left.value, right.value, profile);
  })();
  return operation === 'equal' ? equals : !equals;
}

function compareMinimumOrdering(left, right, profile) {
  if (left.category === 'temporal' && right.category === 'temporal') {
    return profile.compareTemporal(left.value, right.value);
  }
  if (left.category !== 'string' && ['encoding', 'separator', 'sansaAddress'].includes(left.category)) {
    return compareStringsByUnicodeScalarValue(String(left.value), String(right.value));
  }
  return comparePrimitiveOrderValues(left.value, right.value, profile);
}

function normalizeValueSemanticsCategory(category) {
  if (category === 'sansa') return 'sansaAddress';
  if (category === 'cloneReference' || category === 'pointerReference') return 'referenceForm';
  if (['date', 'time', 'datetime', 'zrut'].includes(category)) return 'temporal';
  return category;
}

function sansaAddressSemanticValue(value) {
  if (typeof value === 'string') return value;
  if (value?.canonical !== undefined) return String(value.canonical);
  if (value?.address?.canonical !== undefined) return String(value.address.canonical);
  if (typeof value?.address === 'string') return value.address;
  return String(value ?? '');
}

function structurallyEqualContainers(left, right, profile) {
  if ((left.containerKind ?? 'container') !== (right.containerKind ?? 'container')) return false;
  return structurallyEqualValues(left.value, right.value, profile);
}

function structurallyEqualValues(left, right, profile) {
  if (Object.is(left, right)) return true;
  if (typeof left === 'string' && typeof right === 'string') return profile.compareStrings(left, right) === 0;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => structurallyEqualValues(value, right[index], profile));
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) return false;
    if (!structurallyEqualValues(left[leftKeys[index]], right[rightKeys[index]], profile)) return false;
  }
  return true;
}

function isConcreteValueDescriptor(descriptor) {
  const info = valueDescriptorToScalarInfo(descriptor);
  return isConcreteValueScalar(info);
}

function isExplicitAbsenceScalar(info) {
  return info.kind === 'absence' || info.category === 'explicitAbsence';
}

function valueSemanticsDiagnostic(reason, message) {
  return {
    ok: false,
    outcome: 'diagnostic',
    reason,
    error: {
      code: `AEON_VALUE_SEMANTICS_${reason.toUpperCase()}`,
      reason,
      message,
    },
  };
}

function compareQueryScalars(operator, left, right, options = {}) {
  const leftDescriptor = scalarInfoToValueDescriptor(queryScalarToInfo(left));
  const rightDescriptor = scalarInfoToValueDescriptor(queryScalarToInfo(right));
  const operation = ['==', '!='].includes(operator) ? (operator === '==' ? 'equal' : 'notEqual') : 'compare';
  const evaluated = evaluateValueSemanticsOperation(operation, {
    left: leftDescriptor,
    right: rightDescriptor,
  }, {
    valueSemantics: options.valueSemantics,
  });
  if (!evaluated.ok) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_COMPARISON', queryComparisonMessage(evaluated.reason, operator)),
    };
  }
  const value = (() => {
    if (operator === '==') return evaluated.value;
    if (operator === '!=') return evaluated.value;
    if (operator === '<') return evaluated.relation === 'less';
    if (operator === '<=') return evaluated.relation === 'less' || evaluated.relation === 'equal';
    if (operator === '>') return evaluated.relation === 'greater';
    if (operator === '>=') return evaluated.relation === 'greater' || evaluated.relation === 'equal';
    return false;
  })();
  return { ok: true, value: { type: 'scalar', value } };
}

function queryScalarToInfo(scalar) {
  if (scalar && typeof scalar === 'object' && Object.hasOwn(scalar, 'value')) {
    const metadata = scalar.metadata ?? {};
    return {
      value: scalar.value,
      ...(metadata.kind === undefined ? {} : { kind: metadata.kind }),
      ...(metadata.category === undefined ? {} : { category: metadata.category }),
      ...(metadata.semanticType === undefined ? {} : { semanticType: metadata.semanticType }),
      ...(metadata.containerKind === undefined ? {} : { containerKind: metadata.containerKind }),
      ...(metadata.nullReason === undefined ? {} : { nullReason: metadata.nullReason }),
    };
  }
  return { value: scalar };
}

function queryComparisonMessage(reason, operator) {
  if (reason === 'mixed_categories') return 'Cross-type comparison is not supported by this evaluator slice';
  if (reason === 'not_equality_comparable') return 'NaN, null, and absence values are not equality-comparable in this evaluator slice';
  if (reason === 'not_orderable' && ['<', '<=', '>', '>='].includes(operator)) return 'Ordering comparison is not defined for this value category';
  return 'Invalid scalar comparison';
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
  if (value.type === 'scalar') {
    return { ok: true, value: value.value, metadata: value[QUERY_VALUE_METADATA_PROPERTY] };
  }
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
    return { ok: true, value: scalar.value, metadata: scalar.metadata };
  }
  return {
    ok: false,
    error: queryEvaluateError('SANSA_QUERY_EVALUATE_EXPECTED_SCALAR', 'Expected scalar query value'),
  };
}

function expectComparableQueryValue(value, namespace) {
  if (value.type === 'object') {
    return {
      ok: true,
      value: value.value,
      metadata: { kind: 'container', category: 'container', containerKind: 'object' },
    };
  }
  if (value.type !== 'bindingSet') return expectScalarQueryValue(value, namespace);
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
  return getBindingComparableValue(namespace, value.bindings[0]);
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

function getBindingComparableValue(namespace, binding) {
  const scalar = getBindingScalarValue(namespace, binding);
  if (scalar.ok && !(scalar.value === undefined && isContainerBinding(namespace, binding))) return scalar;
  if (!isContainerBinding(namespace, binding)) return scalar;
  const container = materializeContainerComparableValue(namespace, binding);
  if (!container.ok) return container;
  return {
    ok: true,
    value: container.value,
    metadata: {
      kind: 'container',
      category: 'container',
      containerKind: container.containerKind,
    },
  };
}

function materializeContainerComparableValue(namespace, binding, seen = new Set()) {
  if (seen.has(binding)) {
    return {
      ok: false,
      error: queryEvaluateError('SANSA_QUERY_EVALUATE_INVALID_COMPARISON', 'Cyclic containers are not structurally comparable'),
    };
  }
  seen.add(binding);
  const containerKind = containerKindFromBinding(namespace, binding) ?? 'container';
  const children = getChildren(namespace, binding);
  const positional = ['list', 'tuple'].includes(containerKind);

  if (positional) {
    const values = [];
    for (const child of children) {
      const childValue = materializeBindingComparableValue(namespace, child, seen);
      if (!childValue.ok) {
        seen.delete(binding);
        return childValue;
      }
      values.push(childValue.value);
    }
    seen.delete(binding);
    return { ok: true, value: values, containerKind };
  }

  if (containerKind === 'node') {
    const values = [];
    for (const child of children) {
      const childValue = materializeBindingComparableValue(namespace, child, seen);
      if (!childValue.ok) {
        seen.delete(binding);
        return childValue;
      }
      values.push(childValue.value);
    }
    const attributes = materializeAttributeComparableValue(namespace, binding, seen);
    if (!attributes.ok) {
      seen.delete(binding);
      return attributes;
    }
    const tag = getBindingNodeTag(namespace, binding);
    seen.delete(binding);
    return {
      ok: true,
      value: {
        ...(tag === undefined ? {} : { tag }),
        ...(attributes.value === undefined ? {} : { attributes: attributes.value }),
        children: values,
      },
      containerKind,
    };
  }

  const object = {};
  for (const child of children) {
    const name = getBindingName(namespace, child);
    if (typeof name !== 'string') continue;
    const childValue = materializeBindingComparableValue(namespace, child, seen);
    if (!childValue.ok) {
      seen.delete(binding);
      return childValue;
    }
    object[name] = childValue.value;
  }
  seen.delete(binding);
  return { ok: true, value: object, containerKind };
}

function materializeAttributeComparableValue(namespace, binding, seen) {
  const attributeSpace = getBindingAttributeSpace(namespace, binding);
  if (!attributeSpace) return { ok: true, value: undefined };
  const attributes = {};
  for (const attribute of getChildren(namespace, attributeSpace)) {
    const name = getBindingName(namespace, attribute);
    if (typeof name !== 'string') continue;
    const attributeValue = materializeBindingComparableValue(namespace, attribute, seen);
    if (!attributeValue.ok) return attributeValue;
    attributes[name] = attributeValue.value;
  }
  return { ok: true, value: attributes };
}

function materializeBindingComparableValue(namespace, binding, seen) {
  const scalar = getBindingScalarValue(namespace, binding);
  if (scalar.ok && !(scalar.value === undefined && isContainerBinding(namespace, binding))) {
    return { ok: true, value: scalar.value };
  }
  if (!isContainerBinding(namespace, binding)) return scalar;
  return materializeContainerComparableValue(namespace, binding, seen);
}

function getBindingScalarInfo(namespace, binding) {
  const kind = getBindingScalarKind(namespace, binding);
  const semanticType = getBindingSemanticType(namespace, binding);
  const nullReason = getBindingNullReason(namespace, binding);
  if (typeof namespace.value === 'function') {
    return { ok: true, value: namespace.value(binding), kind, semanticType, nullReason };
  }
  if (Object.hasOwn(binding, 'value')) return { ok: true, value: binding.value, kind, semanticType, nullReason };
  if (Object.hasOwn(binding, 'scalar')) return { ok: true, value: binding.scalar, kind, semanticType, nullReason };
  return {
    ok: false,
    error: queryEvaluateError('SANSA_QUERY_EVALUATE_MISSING_SCALAR', 'Binding does not expose a scalar value'),
  };
}

function containerKindFromBinding(namespace, binding) {
  const rawKind = typeof namespace.representationKind === 'function'
    ? namespace.representationKind(binding)
    : binding.representationKind ?? binding.kind ?? binding.type ?? binding.literalKind ?? binding.valueKind;
  const kind = typeof rawKind === 'string' ? lowerFirst(rawKind) : undefined;
  if (['object', 'obj', 'o', 'envelope', 'objectNode'].includes(kind)) return 'object';
  if (['list', 'listNode'].includes(kind)) return 'list';
  if (['tuple', 'tupleLiteral'].includes(kind)) return 'tuple';
  if (['node', 'nodeLiteral'].includes(kind)) return 'node';
  if (Array.isArray(binding.children)) return 'container';
  return undefined;
}

function isContainerBinding(namespace, binding) {
  return containerKindFromBinding(namespace, binding) !== undefined;
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

function getBindingSemanticType(namespace, binding) {
  const actual = typeof namespace.semanticType === 'function'
    ? namespace.semanticType(binding)
    : binding.semanticType ?? binding.datatype;
  return typeof actual === 'string' ? actual : undefined;
}

function getBindingNullReason(namespace, binding) {
  if (typeof namespace.nullReason === 'function') return namespace.nullReason(binding);
  return binding.nullReason;
}

function getBindingNodeTag(namespace, binding) {
  if (typeof namespace.nodeTag === 'function') return namespace.nodeTag(binding);
  if (typeof namespace.tag === 'function') return namespace.tag(binding);
  return binding.nodeTag ?? binding.tag;
}

function getBindingAttributeSpace(namespace, binding) {
  if (typeof namespace.attributeSpace === 'function') return namespace.attributeSpace(binding);
  return binding.attributeSpace ?? binding.attributes;
}

function queryValueMetadata(value, namespace) {
  if (value.type === 'scalar') return value[QUERY_VALUE_METADATA_PROPERTY];
  if (value.type !== 'bindingSet' || value.bindings.length !== 1) return undefined;
  const info = getBindingScalarInfo(namespace, value.bindings[0]);
  return info.ok ? scalarMetadataFromInfo(info) : undefined;
}

function queryValueAddress(value) {
  if (value.type !== 'bindingSet' || value.bindings.length !== 1) return undefined;
  return getBindingAddress(value.bindings[0]);
}

function scalarMetadataFromInfo(info) {
  const metadata = {};
  if (info.kind !== undefined) metadata.kind = info.kind;
  if (info.semanticType !== undefined) metadata.semanticType = info.semanticType;
  if (info.nullReason !== undefined) metadata.nullReason = info.nullReason;
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function applyResolveSelector(selector, bindings, namespace, selectorIndex, policy = {}) {
  switch (selector.type) {
    case 'member':
      return { ok: true, bindings: bindings.flatMap((binding) => selectMember(namespace, binding, selector.name)) };
    case 'position':
      return { ok: true, bindings: bindings.flatMap((binding) => selectPosition(namespace, binding, selector.index)) };
    case 'positionRange':
      return { ok: true, bindings: bindings.flatMap((binding) => selectPositionRange(namespace, binding, selector.start, selector.end)) };
    case 'parent':
      return selectParents(namespace, bindings, selectorIndex, policy);
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

function selectParents(namespace, bindings, selectorIndex, policy) {
  if (policy.parentTraversal === 'forbid') {
    return {
      ok: false,
      error: resolveError(
        'SANSA_RESOLVE_PARENT_TRAVERSAL_FORBIDDEN',
        'Parent traversal is forbidden by resolver policy',
        selectorIndex,
      ),
    };
  }

  const rootBindings = bindings.filter((binding) => binding === policy.effectiveRoot);
  if (rootBindings.length > 0 && policy.failOnParentFromEffectiveRoot) {
    return {
      ok: false,
      error: resolveError(
        'SANSA_RESOLVE_BOUNDARY_ESCAPE_FORBIDDEN',
        'Parent traversal would escape the effective resolution root',
        selectorIndex,
      ),
    };
  }

  const traversable = bindings.filter((binding) => binding !== policy.effectiveRoot);
  if (traversable.length === 0) return { ok: true, bindings: [] };
  if (typeof namespace.parent === 'function') {
    return { ok: true, bindings: traversable.map((binding) => namespace.parent(binding)).filter(Boolean) };
  }
  if (traversable.some((binding) => Object.prototype.hasOwnProperty.call(binding, 'parent'))) {
    return { ok: true, bindings: traversable.map((binding) => binding.parent).filter(Boolean) };
  }
  if (traversable.length === 0) return { ok: true, bindings: [] };
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
    if (char === '#') return this.parseHex();
    if (char === '%') return this.parseRadix();
    if (char === '&') return this.parseEncoding();
    if (char === '^') return this.parseSeparator();
    if (char === '!') return this.parseNull();
    if (isDigit(char) && this.startsTemporalLiteral()) return this.parseTemporal();
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
    if (['yes', 'no', 'on', 'off'].includes(name)) {
      return {
        type: 'literalExpression',
        kind: 'toggle',
        value: name,
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

  parseHex() {
    const start = this.index;
    this.index += 1;
    const payload = this.readSimpleLiteralPayload();
    if (!/^[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/.test(payload)) {
      this.fail('Invalid hex literal', 'SANSA_QUERY_INVALID_HEX_LITERAL', start);
    }
    const value = payload.replaceAll('_', '').toLowerCase();
    return {
      type: 'literalExpression',
      kind: 'hex',
      value,
      canonical: `#${value}`,
    };
  }

  parseRadix() {
    const start = this.index;
    this.index += 1;
    const payload = this.readSimpleLiteralPayload();
    if (!/^[+-]?(?:[0-9A-Za-z&!](?:_?[0-9A-Za-z&!])*)(?:\.(?:[0-9A-Za-z&!](?:_?[0-9A-Za-z&!])*))?$|^[+-]?\.(?:[0-9A-Za-z&!](?:_?[0-9A-Za-z&!])*)$/.test(payload)) {
      this.fail('Invalid radix literal', 'SANSA_QUERY_INVALID_RADIX_LITERAL', start);
    }
    const value = payload.replaceAll('_', '');
    return {
      type: 'literalExpression',
      kind: 'radix',
      value,
      canonical: `%${value}`,
    };
  }

  parseEncoding() {
    const start = this.index;
    this.index += 1;
    const payload = this.readSimpleLiteralPayload();
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(payload)) {
      this.fail('Invalid encoding literal', 'SANSA_QUERY_INVALID_ENCODING_LITERAL', start);
    }
    return {
      type: 'literalExpression',
      kind: 'encoding',
      value: payload,
      canonical: `&${payload}`,
    };
  }

  parseSeparator() {
    const start = this.index;
    this.index += 1;
    const payload = this.readStructuredLiteralPayload();
    if (payload.length === 0) {
      this.fail('Invalid separator literal', 'SANSA_QUERY_INVALID_SEPARATOR_LITERAL', start);
    }
    return {
      type: 'literalExpression',
      kind: 'separator',
      value: payload,
      canonical: `^${payload}`,
    };
  }

  parseNull() {
    const start = this.index;
    this.index += 1;
    const reason = this.peek() === '"'
      ? this.parseQuotedPayload()
      : this.readIdentifier();
    if (reason.length === 0) {
      this.fail('Invalid null literal', 'SANSA_QUERY_INVALID_NULL_LITERAL', start);
    }
    return {
      type: 'literalExpression',
      kind: 'null',
      value: null,
      nullReason: reason,
      canonical: IDENTIFIER_RE.test(reason) ? `!${reason}` : `!${quotePayload(reason)}`,
    };
  }

  parseTemporal() {
    const start = this.index;
    const source = this.readSimpleLiteralPayload();
    const kind = source.includes('T')
      ? source.includes('&')
        ? 'zrut'
        : 'datetime'
      : source.includes(':')
        ? 'time'
        : 'date';
    if (!isQueryTemporalLiteral(source, kind)) {
      this.fail('Invalid temporal literal', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL', start);
    }
    return {
      type: 'literalExpression',
      kind,
      value: source,
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

  startsTemporalLiteral() {
    const rest = this.input.slice(this.index);
    return /^\d{4}-\d{2}-\d{2}(?:T|(?=$|[\s,)}\]]))/.test(rest)
      || /^\d{2}:(?:\d{2})?(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?(?=$|[\s,)}\]])/.test(rest);
  }

  readSimpleLiteralPayload() {
    const start = this.index;
    while (!this.atEnd()) {
      const char = this.peek();
      if (isLayout(char) || char === ',' || char === ')' || char === '}' || char === ']') break;
      this.index += 1;
    }
    const payload = this.input.slice(start, this.index);
    if (payload.length === 0) {
      this.fail('Expected literal payload', 'SANSA_QUERY_EXPECTED_LITERAL_PAYLOAD', start);
    }
    return payload;
  }

  readStructuredLiteralPayload() {
    const start = this.index;
    let quote = null;
    while (!this.atEnd()) {
      const char = this.peek();
      if (quote) {
        if (char === '\\') {
          this.index += 2;
          continue;
        }
        if (char === quote) quote = null;
        this.index += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        this.index += 1;
        continue;
      }
      if (isLayout(char) || char === ',' || char === ')' || char === '}' || char === ']') break;
      this.index += 1;
    }
    const payload = this.input.slice(start, this.index);
    if (quote) {
      this.fail('Unterminated structured scalar literal', 'SANSA_QUERY_UNTERMINATED_EXPRESSION', start);
    }
    return payload;
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

function isQueryTemporalLiteral(source, kind) {
  const date = String.raw`\d{4}-\d{2}-\d{2}`;
  const time = String.raw`\d{2}:(?:\d{2})?(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?`;
  const zone = String.raw`[A-Za-z0-9_+\-/]+(?:/[A-Za-z0-9_+\-]+)*`;
  if (kind === 'date') return new RegExp(`^${date}$`).test(source);
  if (kind === 'time') return new RegExp(`^${time}$`).test(source);
  if (kind === 'datetime') return new RegExp(`^${date}T${time}$`).test(source);
  if (kind === 'zrut') return new RegExp(`^${date}T${time}&${zone}$`).test(source);
  return false;
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
  const chars = Array.from(pattern);
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (char === '\\' && ['*', '?', '\\'].includes(chars[index + 1])) {
      source += escapeRegExp(chars[index + 1]);
      index += 1;
      continue;
    }
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
