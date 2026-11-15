/** Shared host-cursor grammar. Cursors own lexical decoding, limits and diagnostics. */
const memberSelector = (name, quoted) => ({ type: 'member', name, quoted });
const positionSelector = index => ({ type: 'position', index });

// Native SANSA and host cursors share this grammar dispatch.
function dotReader(char) {
  switch (char) {
    case '@': return attribute;
    case '^': return parent;
    case '*': return expansion;
    case '[': return quotedMember;
    case '<': return localSpace;
    case '(': return namePattern;
    case '\\': return childIdentity;
    default: return null;
  }
}
export function parseDotSelectorFromCursor(cursor, member = memberSelector) {
  cursor.consume('.');
  const reader = dotReader(cursor.peekSyntax());
  return reader ? reader(cursor, member) : member(cursor.parseIdentifier('member selector'), false);
}
function childIdentity(cursor, member) {
  // Structural-reference hosts retain their existing identifier rejection.
  return typeof cursor.parseChildIdentity === 'function'
    ? cursor.parseChildIdentity()
    : member(cursor.parseIdentifier('member selector'), false);
}
function attribute(cursor) { cursor.consume('@'); return { type: 'attributeSpace' }; }
function parent(cursor) { cursor.consume('^'); return { type: 'parent' }; }
function expansion(cursor) {
  cursor.consume('*');
  return { type: cursor.match('*') ? 'descendantExpansion' : 'directExpansion' };
}
function quotedMember(cursor, member) {
  cursor.consume('[');
  const name = cursor.parseQuotedPayload();
  cursor.consume(']');
  return member(name, true);
}
function localSpace(cursor) {
  cursor.consume('<');
  const name = cursor.parseQuotedPayload();
  if (!name.length) cursor.fail('Local address-space names must not be empty', 'SANSA_EMPTY_LOCAL_SPACE_NAME');
  cursor.consume('>');
  return { type: 'localSpace', name };
}
function namePattern(cursor) {
  cursor.consume('('); const pattern = cursor.parseQuotedPayload(); cursor.consume(')');
  return { type: 'namePattern', pattern };
}
export function parsePositionSelectorFromCursor(cursor, position = positionSelector) {
  cursor.consume('[');
  const selectorStart = cursor.index;
  const start = cursor.parseOptionalPositionIndex();
  if (cursor.matchRangeSeparator()) {
    const end = cursor.parseOptionalPositionIndex();
    if (start === null && end === null) cursor.fail('Position ranges must include a start or end index', 'SANSA_EMPTY_POSITION_RANGE', selectorStart);
    cursor.consume(']');
    return { type: 'positionRange', start, end };
  }
  if (start === null) cursor.fail('Expected positional index', 'SANSA_EXPECTED_INDEX');
  cursor.consume(']');
  return position(start);
}

/** Validate the original decimal spelling and bound before number conversion.
 * Hosts provide native diagnostics; the default is SANSA's portable ceiling. */
export function validatePositionIndex(raw, maxPositionIndex = 999_999, fail) {
  if (!/^[0-9]+$/.test(raw)) return fail('Expected unsigned decimal positional index', 'SANSA_EXPECTED_INDEX');
  if (raw.length > 1 && raw[0] === '0') return fail('Positional indexes must not contain leading zeroes', 'SANSA_LEADING_ZERO_INDEX');
  const bound = String(maxPositionIndex);
  if (raw.length > bound.length || (raw.length === bound.length && raw > bound)) {
    return fail(`Position indexes must be less than or equal to ${maxPositionIndex}`, 'SANSA_POSITION_INDEX_LIMIT_EXCEEDED');
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return fail(`Position indexes must be less than or equal to ${maxPositionIndex}`, 'SANSA_POSITION_INDEX_LIMIT_EXCEEDED');
  return value;
}
