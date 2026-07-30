import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseQuery, parseQueryExpression, renderQuery, renderQueryExpression } from '../src/index.js';

const ctsRoot = process.env.AEONITE_CTS_ROOT
  ? resolve(process.env.AEONITE_CTS_ROOT)
  : fileURLToPath(new URL('../../../aeonite-org/aeonite-cts/cts/', import.meta.url));

function parseOk(source) {
  const result = parseQuery(source);
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  return result.query;
}

function parseBad(source, code) {
  const result = parseQuery(source);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, code);
}

function parseExpressionOk(source) {
  const result = parseQueryExpression(source);
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  return result.expression;
}

function parseExpressionBad(source, code) {
  const result = parseQueryExpression(source);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, code);
}

function queryFromSource(query) {
  return query.from.source === 'expression'
    ? query.from.expression
    : query.from.address.canonical;
}

test('parses minimal query clauses', () => {
  const query = parseOk('from $.users.*\nselect .name');
  assert.equal(query.from.source, 'address');
  assert.equal(query.from.address.canonical, '$.users.*');
  assert.equal(query.select.expression, '.name');
  assert.equal(query.select.ast.type, 'resolutionExpression');
  assert.equal(query.select.ast.scope, 'current');
  assert.deepEqual(query.clauses, ['from', 'select']);
  assert.equal(renderQuery(query), query.canonical);
});

test('parses position ranges in query resolution expressions', () => {
  const query = parseOk('from $.inventory.items[0..1]\nselect .roles[0..]');
  assert.equal(query.from.source, 'address');
  assert.equal(query.from.address.canonical, '$.inventory.items[0..1]');
  assert.equal(query.select.expression, '.roles[0..]');
  assert.equal(query.canonical, 'from $.inventory.items[0..1]\nselect .roles[0..]');
});

test('parses dynamic path source clauses', () => {
  const query = parseOk('from path($.<"params">.source)\nselect .sku');
  assert.equal(query.from.source, 'expression');
  assert.equal(query.from.expression, 'path($.<"params">.source)');
  assert.equal(query.from.ast.type, 'functionCallExpression');
  assert.equal(query.from.ast.name, 'path');
  assert.equal(query.canonical, 'from path($.<"params">.source)\nselect .sku');
});

test('parses all stage-zero clauses', () => {
  const query = parseOk([
    'from $.users.*',
    'where .active == true',
    'order by .lastName desc, .firstName',
    'offset 20',
    'limit 10',
    'select { name = .name status = .status }',
  ].join('\n'));

  assert.deepEqual(query.orderBy.keys.map((key) => ({
    type: key.type,
    expression: key.expression,
    direction: key.direction,
    astType: key.ast.type,
  })), [
    { type: 'orderKey', expression: '.lastName', direction: 'desc', astType: 'resolutionExpression' },
    { type: 'orderKey', expression: '.firstName', direction: 'asc', astType: 'resolutionExpression' },
  ]);
  assert.equal(query.offset.value, 20);
  assert.equal(query.limit.value, 10);
  assert.equal(query.where.ast.type, 'binaryExpression');
  assert.equal(query.select.ast.type, 'projectionExpression');
  assert.equal(query.canonical, [
    'from $.users.*',
    'where .active == true',
    'order by .lastName desc, .firstName asc',
    'offset 20',
    'limit 10',
    'select { name = .name status = .status }',
  ].join('\n'));
});

test('accepts query offset and limit at the local safe-integer boundary', () => {
  const query = parseOk('from $.users.*\noffset 9007199254740991\nlimit 9007199254740991\nselect .name');
  assert.equal(query.offset.value, 9007199254740991);
  assert.equal(query.limit.value, 9007199254740991);
});

test('surfaces SANSA address portability warnings from query parsing', () => {
  const result = parseQuery('from $.users[1000000]\nselect .name', {
    address: { maxPositionIndex: 10_000_000 },
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  assert.deepEqual(
    result.warnings.map((warning) => warning.code),
    ['SANSA_NON_PORTABLE_POSITION_INDEX'],
  );
});

test('strips query comments as trivia', () => {
  const query = parseOk('/* lead */ from $.items.* // rows\nwhere .qty >= 1 /* available */\nselect .sku');
  assert.equal(query.canonical, 'from $.items.*\nwhere .qty >= 1\nselect .sku');
});

test('rejects incomplete and invalid query forms', () => {
  parseBad('', 'SANSA_QUERY_EMPTY');
  parseBad('select .name', 'SANSA_QUERY_EXPECTED_FROM');
  parseBad('from $.users.*', 'SANSA_QUERY_EXPECTED_SELECT');
  parseBad('from $.users.*\nselect .name\nwhere .active == true', 'SANSA_QUERY_SELECT_MUST_BE_TERMINAL');
  parseBad('from $.items[01]\nselect .name', 'SANSA_LEADING_ZERO_INDEX');
  parseBad('from $.users.*\nlimit 01\nselect .name', 'SANSA_QUERY_INVALID_LIMIT');
  parseBad('from $.users.*\noffset 9007199254740992\nselect .name', 'SANSA_QUERY_INVALID_OFFSET');
  parseBad('from $.users.*\nlimit 9007199254740992\nselect .name', 'SANSA_QUERY_INVALID_LIMIT');
});

test('parses query expressions into canonical AST nodes', () => {
  const boolean = parseExpressionOk('not .active or .role == "admin"');
  assert.equal(boolean.type, 'binaryExpression');
  assert.equal(boolean.operator, 'or');
  assert.equal(renderQueryExpression(boolean), 'not .active or .role == "admin"');

  const membership = parseExpressionOk('"admin" in .roles.*');
  assert.equal(membership.type, 'binaryExpression');
  assert.equal(membership.operator, 'in');
  assert.equal(renderQueryExpression(membership), '"admin" in .roles.*');

  const toggle = parseExpressionOk('yes');
  assert.equal(toggle.type, 'literalExpression');
  assert.equal(toggle.kind, 'toggle');
  assert.equal(toggle.value, 'yes');
  assert.equal(renderQueryExpression(toggle), 'yes');

  const hex = parseExpressionOk('#Ff_00_Aa');
  assert.equal(hex.type, 'literalExpression');
  assert.equal(hex.kind, 'hex');
  assert.equal(hex.value, 'ff00aa');
  assert.equal(renderQueryExpression(hex), '#ff00aa');

  const radix = parseExpressionOk('%ff00aa');
  assert.equal(radix.type, 'literalExpression');
  assert.equal(radix.kind, 'radix');
  assert.equal(radix.value, 'ff00aa');
  assert.equal(renderQueryExpression(radix), '%ff00aa');

  const encoding = parseExpressionOk('&QmFzZTY0IQ==');
  assert.equal(encoding.type, 'literalExpression');
  assert.equal(encoding.kind, 'encoding');
  assert.equal(encoding.value, 'QmFzZTY0IQ==');
  assert.equal(renderQueryExpression(encoding), '&QmFzZTY0IQ==');

  const separator = parseExpressionOk('^0.11.0');
  assert.equal(separator.type, 'literalExpression');
  assert.equal(separator.kind, 'separator');
  assert.equal(separator.value, '0.11.0');
  assert.equal(renderQueryExpression(separator), '^0.11.0');

  const date = parseExpressionOk('2026-07-25');
  assert.equal(date.type, 'literalExpression');
  assert.equal(date.kind, 'date');
  assert.equal(date.value, '2026-07-25');
  assert.equal(renderQueryExpression(date), '2026-07-25');

  const time = parseExpressionOk('09:30:00Z');
  assert.equal(time.type, 'literalExpression');
  assert.equal(time.kind, 'time');
  assert.equal(time.value, '09:30:00Z');
  assert.equal(renderQueryExpression(time), '09:30:00Z');

  const reducedTime = parseExpressionOk('09:');
  assert.equal(reducedTime.type, 'literalExpression');
  assert.equal(reducedTime.kind, 'time');
  assert.equal(reducedTime.value, '09:');
  assert.equal(renderQueryExpression(reducedTime), '09:');

  const datetime = parseExpressionOk('2026-07-25T09:30:00Z');
  assert.equal(datetime.type, 'literalExpression');
  assert.equal(datetime.kind, 'datetime');
  assert.equal(datetime.value, '2026-07-25T09:30:00Z');
  assert.equal(renderQueryExpression(datetime), '2026-07-25T09:30:00Z');

  const reducedDatetime = parseExpressionOk('2026-07-25T09Z');
  assert.equal(reducedDatetime.type, 'literalExpression');
  assert.equal(reducedDatetime.kind, 'datetime');
  assert.equal(reducedDatetime.value, '2026-07-25T09Z');
  assert.equal(renderQueryExpression(reducedDatetime), '2026-07-25T09Z');

  const zrut = parseExpressionOk('2026-07-25T09:30:00Z&Australia/Melbourne');
  assert.equal(zrut.type, 'literalExpression');
  assert.equal(zrut.kind, 'zrut');
  assert.equal(zrut.value, '2026-07-25T09:30:00Z&Australia/Melbourne');
  assert.equal(renderQueryExpression(zrut), '2026-07-25T09:30:00Z&Australia/Melbourne');

  const reducedZrut = parseExpressionOk('2026-07-25T09Z&Europe/Belgium/Brussels');
  assert.equal(reducedZrut.type, 'literalExpression');
  assert.equal(reducedZrut.kind, 'zrut');
  assert.equal(reducedZrut.value, '2026-07-25T09Z&Europe/Belgium/Brussels');
  assert.equal(renderQueryExpression(reducedZrut), '2026-07-25T09Z&Europe/Belgium/Brussels');

  const nullLiteral = parseExpressionOk('!notSet');
  assert.equal(nullLiteral.type, 'literalExpression');
  assert.equal(nullLiteral.kind, 'null');
  assert.equal(nullLiteral.value, null);
  assert.equal(nullLiteral.nullReason, 'notSet');
  assert.equal(renderQueryExpression(nullLiteral), '!notSet');

  const parentResolution = parseExpressionOk('.^.sibling');
  assert.equal(parentResolution.type, 'resolutionExpression');
  assert.equal(parentResolution.scope, 'current');
  assert.equal(renderQueryExpression(parentResolution), '.^.sibling');

  const currentBinding = parseExpressionOk('.');
  assert.equal(currentBinding.type, 'currentBindingExpression');
  assert.equal(renderQueryExpression(currentBinding), '.');

  const currentPosition = parseExpressionOk('.[1]');
  assert.equal(currentPosition.type, 'resolutionExpression');
  assert.equal(currentPosition.scope, 'current');
  assert.equal(renderQueryExpression(currentPosition), '.[1]');

  const cardinality = parseExpressionOk('any(.roles.* == "admin")');
  assert.equal(cardinality.type, 'cardinalityExpression');
  assert.equal(cardinality.operator, 'any');
  assert.equal(cardinality.argument.type, 'binaryExpression');

  const existence = parseExpressionOk('exists(.roles) and absent(.roles.*)');
  assert.equal(existence.type, 'binaryExpression');
  assert.equal(existence.operator, 'and');
  assert.equal(existence.left.type, 'existenceExpression');
  assert.equal(existence.left.operator, 'exists');
  assert.equal(existence.right.type, 'existenceExpression');
  assert.equal(existence.right.operator, 'absent');
  assert.equal(renderQueryExpression(existence), 'exists(.roles) and absent(.roles.*)');

  const projection = parseExpressionOk('{ name = .name status = resolveChild($.statuses, .status) }');
  assert.equal(projection.type, 'projectionExpression');
  assert.deepEqual(projection.fields.map((field) => field.name), ['name', 'status']);
  assert.equal(renderQueryExpression(projection), '{ name = .name status = resolveChild($.statuses, .status) }');

  const follow = parseExpressionOk('follow(.targetRef)');
  assert.equal(follow.type, 'functionCallExpression');
  assert.equal(follow.name, 'follow');
  assert.equal(renderQueryExpression(follow), 'follow(.targetRef)');
});

test('rejects invalid query expression forms', () => {
  parseExpressionBad('', 'SANSA_QUERY_EXPECTED_EXPRESSION');
  parseExpressionBad('thing', 'SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN');
  parseExpressionBad('any(.roles.*, "admin")', 'SANSA_QUERY_INVALID_FUNCTION_CALL');
  parseExpressionBad('exists(.roles, .sku)', 'SANSA_QUERY_INVALID_FUNCTION_CALL');
  parseExpressionBad('absent("roles")', 'SANSA_QUERY_INVALID_FUNCTION_CALL');
  parseExpressionBad('{ name = }', 'SANSA_QUERY_INVALID_PROJECTION');
  parseExpressionBad('( .name', 'SANSA_QUERY_UNTERMINATED_EXPRESSION');
  parseExpressionBad('#_', 'SANSA_QUERY_INVALID_HEX_LITERAL');
  parseExpressionBad('%', 'SANSA_QUERY_EXPECTED_LITERAL_PAYLOAD');
  parseExpressionBad('&bad/payload', 'SANSA_QUERY_INVALID_ENCODING_LITERAL');
  parseExpressionBad('2025-13-40', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
  parseExpressionBad('2025-02-29', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
  parseExpressionBad('24:00', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
  parseExpressionBad('23:59:60', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
  parseExpressionBad('2025-01-01T09Z&Europe/', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
  parseExpressionBad('2025-01-01T09Z&Europe//Brussels', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
  parseExpressionBad('2025-01-01T09Z&Europe/*Brussels*/', 'SANSA_QUERY_INVALID_TEMPORAL_LITERAL');
});

test('query CTS cases match parser behavior', () => {
  const suite = JSON.parse(readFileSync(
    resolve(ctsRoot, 'sansa', 'v1', 'suites', '04-query-parser.json'),
    'utf8',
  ));

  for (const entry of suite.tests) {
    const result = parseQuery(entry.input.source);
    assert.equal(result.ok, entry.expected.ok, entry.id);
    if (!entry.expected.ok) {
      assert.equal(result.errors[0].code, entry.expected.error, entry.id);
      continue;
    }
    assert.equal(result.query.canonical, entry.expected.canonical, entry.id);
    assert.equal(queryFromSource(result.query), entry.expected.from, entry.id);
    assert.equal(result.query.select.expression, entry.expected.select, entry.id);
    assert.deepEqual(result.query.clauses, entry.expected.clauses, entry.id);
  }
});
