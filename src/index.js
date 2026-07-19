const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const QUALIFIER_ARG_RE = /^[A-Za-z0-9!#$%&*+\-.:;=?@^_|~<>]+$/;

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
    return { ok: true, address: parser.parse() };
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
    return { ok: true, query: parser.parse() };
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
    return { ok: true, expression: parser.parse() };
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
  const lines = [`from ${renderAddress(query.from.address)}`];
  if (query.where) lines.push(`where ${renderQueryExpression(query.where.ast)}`);
  if (query.orderBy) {
    lines.push(`order by ${query.orderBy.keys.map((key) => `${renderQueryExpression(key.ast)} ${key.direction}`).join(', ')}`);
  }
  if (query.offset) lines.push(`offset ${query.offset.value}`);
  if (query.limit) lines.push(`limit ${query.limit.value}`);
  lines.push(`select ${renderQueryExpression(query.select.ast)}`);
  return lines.join('\n');
}

export function renderQueryExpression(expression) {
  switch (expression.type) {
    case 'literalExpression':
      return expression.kind === 'string' ? quotePayload(expression.value) : String(expression.value);
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

function applyResolveSelector(selector, bindings, namespace, selectorIndex) {
  switch (selector.type) {
    case 'member':
      return { ok: true, bindings: bindings.flatMap((binding) => selectMember(namespace, binding, selector.name)) };
    case 'position':
      return { ok: true, bindings: bindings.flatMap((binding) => selectPosition(namespace, binding, selector.index)) };
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
  constructor(input, options) {
    this.input = input;
    this.options = options;
    this.index = 0;
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
    const start = this.index;
    while (isDigit(this.peek())) this.index += 1;
    if (this.index === start) this.fail('Expected positional index', 'SANSA_EXPECTED_INDEX');
    const raw = this.input.slice(start, this.index);
    if (raw.length > 1 && raw.startsWith('0')) {
      this.fail('Positional indexes must not contain leading zeroes', 'SANSA_LEADING_ZERO_INDEX', start);
    }
    this.consume(']');
    return { type: 'position', index: Number(raw) };
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
}

class QueryParser {
  constructor(input, options) {
    this.input = input;
    this.options = options;
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
    if (/\s/.test(expression)) {
      this.fail("Expected a single SANSA address after 'from'", 'SANSA_QUERY_INVALID_FROM_ADDRESS', clause.bodyStart);
    }
    const result = parseAddress(expression, this.options.address);
    if (!result.ok) {
      const first = result.errors[0];
      this.fail(first.message, first.code, clause.bodyStart + first.index);
    }
    return { type: 'fromClause', address: result.address };
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
    return { type: `${name}Clause`, value: Number(value) };
  }

  parseClauseExpression(expression, offset) {
    try {
      return parseQueryExpressionOrThrow(expression, this.options.expression);
    } catch (error) {
      if (error instanceof SansaParseError) {
        this.fail(error.message, error.code, offset + error.index);
      }
      throw error;
    }
  }

  fail(message, code, index) {
    throw new SansaParseError(message, index, code);
  }
}

class QueryExpressionParser {
  constructor(input, options) {
    this.input = normalizeQueryExpression(stripQueryComments(String(input)));
    this.options = options;
    this.index = 0;
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
    const parseSource = source.startsWith('.') ? `?${source}` : source;
    const result = parseAddress(parseSource, this.options.address);
    if (!result.ok) {
      const first = result.errors[0];
      this.fail(first.message, first.code, start + first.index - (source.startsWith('.') ? 1 : 0));
    }
    const scope = source.startsWith('.')
      ? 'current'
      : result.address.root.kind;
    const canonical = source.startsWith('.')
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
    if (source.length === 0 || source === '.') {
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
