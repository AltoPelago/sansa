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
  if (query.where) lines.push(`where ${query.where.expression}`);
  if (query.orderBy) {
    lines.push(`order by ${query.orderBy.keys.map((key) => `${key.expression} ${key.direction}`).join(', ')}`);
  }
  if (query.offset) lines.push(`offset ${query.offset.value}`);
  if (query.limit) lines.push(`limit ${query.limit.value}`);
  lines.push(`select ${query.select.expression}`);
  return lines.join('\n');
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
    return { type: `${name}Clause`, expression };
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
      return { type: 'orderKey', expression: keyExpression, direction };
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

  fail(message, code, index) {
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
