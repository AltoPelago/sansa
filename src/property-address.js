// Internal preparation support. Recognition/rendering do not authorize execution.
const MAX_SELECTORS = 256;
const MAX_PAYLOAD = 4096;
const MAX_CANONICAL = 65536;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const IDENTITY = /^[A-Za-z0-9_-]+$/;
const NUMBER = /^[+-]?(?:(?:0|[1-9][0-9]*)(?:\.[0-9]+)?|\.[0-9]+)$/;

export class PropertyAddressError extends Error {
  constructor(message, code = 'SANSA_RESOLVE_INVALID_ADDRESS', details = {}) {
    super(message);
    this.code = code;
    Object.assign(this, details);
  }
}
export function propertyLimit(limitKind, limit) {
  throw new PropertyAddressError('Property address preparation bound exceeded', 'SANSA_PROPERTY_LIMIT_EXCEEDED', {limitKind, limit, observed: limit + 1});
}
// Only unquoted suffix syntax before qualifiers is a property candidate.
export function hasPropertySyntax(source) {
  if (!source.includes('&')) return false;
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted && ch === '\\') { i++; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === ':') return false;
    if (!quoted && ch === '&') return true;
  }
  return false;
}
function data(object, key, optional = false) {
  if (!object || typeof object !== 'object') throw new PropertyAddressError('Expected plain address data');
  const prototype = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(object)) throw new PropertyAddressError('Expected plain address data');
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor && optional) return undefined;
  if (!descriptor || !('value' in descriptor)) throw new PropertyAddressError('Address data must not contain accessors');
  return descriptor.value;
}
function array(value) {
  if (!Array.isArray(value)) throw new PropertyAddressError('Expected address array');
  return value;
}
export function hasPropertyAst(address) {
  const selectors = data(address, 'selectors', true);
  if (!Array.isArray(selectors)) return false;
  for (let i = 0; i < selectors.length; i++) {
    const selector = data(selectors, String(i));
    if (data(selector, 'type') === 'propertyFilter') return true;
  }
  return false;
}
function scalarCount(value, limit, kind) {
  if (typeof value !== 'string') throw new PropertyAddressError('Expected address string');
  let count = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code >= 0xd800 && code <= 0xdfff) throw new PropertyAddressError('Invalid Unicode scalar', 'SANSA_INVALID_UNICODE_SCALAR');
    if (++count > limit) propertyLimit(kind, limit);
  }
  return value;
}
// Bounded, iterative canonical rendering of plain caller data. Ignore caller flags.
export function renderPropertyAddress(address, quote, number) {
  if (data(address, 'type') !== 'SansaAddress') throw new PropertyAddressError('Invalid address type');
  const root = data(address, 'root');
  if (data(root, 'type') !== 'root' || !['absolute', 'contextual'].includes(data(root, 'kind'))) throw new PropertyAddressError('Invalid root');
  const selectors = array(data(address, 'selectors'));
  if (selectors.length > MAX_SELECTORS) propertyLimit('selectors', MAX_SELECTORS);
  let output = '';
  let length = 0;
  const emit = value => {
    for (const ch of scalarCount(value, MAX_CANONICAL, 'canonicalScalars')) {
      if (++length > MAX_CANONICAL) propertyLimit('canonicalScalars', MAX_CANONICAL);
      output += ch;
    }
  };
  const text = (object, field) => scalarCount(data(object, field), MAX_CANONICAL, 'canonicalScalars');
  const identifier = value => { if (!IDENTIFIER.test(value)) throw new PropertyAddressError('Invalid identifier'); return value; };
  const position = value => { if (!Number.isSafeInteger(value) || value < 0) throw new PropertyAddressError('Invalid position'); return String(value); };
  const quoted = value => quote(scalarCount(value, MAX_CANONICAL, 'canonicalScalars'));
  emit(data(root, 'kind') === 'absolute' ? '$' : '?');
  for (let i = 0; i < selectors.length; i++) {
    const s = data(selectors, String(i));
    switch (data(s, 'type')) {
      case 'member': {
        const name = text(s, 'name');
        emit(IDENTIFIER.test(name) ? '.' + name : '.[' + quoted(name) + ']'); break;
      }
      case 'childIdentity': {
        const identity = text(s, 'identity');
        if (!IDENTITY.test(identity)) throw new PropertyAddressError('Invalid identity');
        emit('.\\' + identity + '\\'); break;
      }
      case 'position': emit('[' + position(data(s, 'index')) + ']'); break;
      case 'positionRange': {
        const start = data(s, 'start'), end = data(s, 'end');
        if (start == null && end == null) throw new PropertyAddressError('Empty range');
        emit('[' + (start == null ? '' : position(start)) + '..' + (end == null ? '' : position(end)) + ']'); break;
      }
      case 'parent': emit('.^'); break;
      case 'attributeSpace': emit('.@'); break;
      case 'directExpansion': emit('.*'); break;
      case 'descendantExpansion': emit('.**'); break;
      case 'localSpace': { const name = text(s, 'name'); if (!name) throw new PropertyAddressError('Empty local space'); emit('.<' + quoted(name) + '>'); break; }
      case 'namePattern': emit('.(' + quoted(text(s, 'pattern')) + ')'); break;
      case 'semanticTypeFilter': emit('#' + identifier(text(s, 'name'))); break;
      case 'representationKindFilter': emit('%' + identifier(text(s, 'name'))); break;
      case 'propertyFilter': {
        const property = data(s, 'property');
        if (!['key', 'tag'].includes(property)) throw new PropertyAddressError('Unknown property');
        emit('&' + property + '(' + quoted(scalarCount(data(s, 'value'), MAX_PAYLOAD, 'payloadScalars')) + ')'); break;
      }
      default: throw new PropertyAddressError('Unknown selector');
    }
  }
  const qualifier = data(address, 'qualifierExpression', true);
  if (qualifier) {
    if (data(qualifier, 'type') !== 'QualifierExpression') throw new PropertyAddressError('Invalid qualifier type');
    const terms = array(data(qualifier, 'terms'));
    if (!terms.length) throw new PropertyAddressError('Empty qualifier');
    emit(':');
    const stack = [], ancestors = new Set();
    const pushList = (items, separator, kind) => {
      if (stack.length + items.length * 2 > MAX_CANONICAL) propertyLimit('canonicalScalars', MAX_CANONICAL);
      for (let i = items.length - 1; i >= 0; i--) {
        stack.push([kind, data(items, String(i))]);
        if (i) stack.push(['text', separator]);
      }
    };
    pushList(terms, '|', 'term');
    while (stack.length) {
      if (stack.length > MAX_CANONICAL) propertyLimit('canonicalScalars', MAX_CANONICAL);
      const [kind, item] = stack.pop();
      if (kind === 'text') { emit(item); continue; }
      if (kind === 'leave') { ancestors.delete(item); continue; }
      if (kind === 'argument') {
        const type = data(item, 'kind'), value = data(item, 'value');
        if (type === 'quoted') emit(quoted(value));
        else if (type === 'number' && typeof value === 'number' && Number.isFinite(value)) emit(number(value));
        else if (type === 'token' && NUMBER.test(scalarCount(value, MAX_CANONICAL, 'canonicalScalars'))) emit(value);
        else throw new PropertyAddressError('Invalid qualifier argument');
        continue;
      }
      if (data(item, 'type') !== 'QualifierTerm') throw new PropertyAddressError('Invalid qualifier term');
      if (ancestors.has(item)) throw new PropertyAddressError('Cyclic qualifier');
      ancestors.add(item); stack.push(['leave', item]);
      emit(identifier(text(item, 'name')));
      const args = array(data(item, 'arguments'));
      if (args.length) { stack.push(['text', ']']); pushList(args, ',', 'argument'); stack.push(['text', '[']); }
      let groups = data(item, 'parameterGroups', true);
      if (groups === undefined) { const parameters = array(data(item, 'parameters')); groups = parameters.length ? [parameters] : []; }
      array(groups);
      if (groups.length > MAX_CANONICAL) propertyLimit('canonicalScalars', MAX_CANONICAL);
      for (let i = groups.length - 1; i >= 0; i--) {
        const group = array(data(groups, String(i)));
        if (!group.length) throw new PropertyAddressError('Empty qualifier group');
        stack.push(['text', '>']); pushList(group, ',', 'term'); stack.push(['text', '<']);
        if (stack.length > MAX_CANONICAL) propertyLimit('canonicalScalars', MAX_CANONICAL);
      }
    }
  }
  return output;
}
// The existing cursor decodes payloads. Only nested control flow changes here.
export function parsePropertyQualifiers(cursor) {
  const terms = [];
  const makeTerm = () => ({type:'QualifierTerm', name:cursor.parseIdentifier('qualifier type name'), parameters:[], parameterGroups:[], arguments:[]});
  let term = makeTerm(); terms.push(term);
  const stack = [{term, state:'parameters'}];
  while (stack.length) {
    const frame = stack.at(-1);
    if (frame.state === 'parameters') {
      if (cursor.match('<')) {
        frame.group = []; frame.term.parameterGroups.push(frame.group); frame.state = 'group';
        const child = makeTerm(); frame.group.push(child); stack.push({term:child,state:'parameters'}); continue;
      }
      if (cursor.match('[')) {
        frame.term.arguments.push(cursor.parseQualifierArgument());
        while (cursor.match(',')) frame.term.arguments.push(cursor.parseQualifierArgument());
        cursor.consume(']');
        if (cursor.peek() === '[') cursor.fail('Qualifier clarifiers must use a single bracketed list','SANSA_INVALID_QUALIFIER');
      }
      const next = cursor.peek();
      if (next && !['|', ',', '>'].includes(next)) cursor.fail('Unexpected character in qualifier expression','SANSA_INVALID_QUALIFIER');
      stack.pop();
      if (!stack.length && cursor.match('|')) { term = makeTerm(); terms.push(term); stack.push({term,state:'parameters'}); }
    } else {
      if (cursor.peek() === '|') cursor.fail('Nested qualifier unions are not supported','SANSA_INVALID_QUALIFIER');
      if (cursor.match(',')) { const child = makeTerm(); frame.group.push(child); stack.push({term:child,state:'parameters'}); continue; }
      cursor.consume('>'); frame.term.parameters.push(...frame.group); frame.state = 'parameters';
    }
  }
  return {type:'QualifierExpression',terms};
}
