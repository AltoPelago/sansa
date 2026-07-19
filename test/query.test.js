import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseQuery, parseQueryExpression, renderQuery, renderQueryExpression } from '../src/index.js';

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

test('parses minimal query clauses', () => {
  const query = parseOk('from $.users.*\nselect .name');
  assert.equal(query.from.address.canonical, '$.users.*');
  assert.equal(query.select.expression, '.name');
  assert.equal(query.select.ast.type, 'resolutionExpression');
  assert.equal(query.select.ast.scope, 'current');
  assert.deepEqual(query.clauses, ['from', 'select']);
  assert.equal(renderQuery(query), query.canonical);
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
});

test('parses query expressions into canonical AST nodes', () => {
  const boolean = parseExpressionOk('not .active or .role == "admin"');
  assert.equal(boolean.type, 'binaryExpression');
  assert.equal(boolean.operator, 'or');
  assert.equal(renderQueryExpression(boolean), 'not .active or .role == "admin"');

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

  const projection = parseExpressionOk('{ name = .name status = lookup($.statuses, .status) }');
  assert.equal(projection.type, 'projectionExpression');
  assert.deepEqual(projection.fields.map((field) => field.name), ['name', 'status']);
  assert.equal(renderQueryExpression(projection), '{ name = .name status = lookup($.statuses, .status) }');
});

test('rejects invalid query expression forms', () => {
  parseExpressionBad('', 'SANSA_QUERY_EXPECTED_EXPRESSION');
  parseExpressionBad('thing', 'SANSA_QUERY_UNEXPECTED_EXPRESSION_TOKEN');
  parseExpressionBad('any(.roles.*, "admin")', 'SANSA_QUERY_INVALID_FUNCTION_CALL');
  parseExpressionBad('exists(.roles, .sku)', 'SANSA_QUERY_INVALID_FUNCTION_CALL');
  parseExpressionBad('absent("roles")', 'SANSA_QUERY_INVALID_FUNCTION_CALL');
  parseExpressionBad('{ name = }', 'SANSA_QUERY_INVALID_PROJECTION');
  parseExpressionBad('( .name', 'SANSA_QUERY_UNTERMINATED_EXPRESSION');
});

test('query CTS cases match parser behavior', () => {
  const suite = JSON.parse(readFileSync(
    new URL('../../../aeonite-org/aeonite-cts/cts/sansa/v1/suites/04-query-parser.json', import.meta.url),
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
    assert.equal(result.query.from.address.canonical, entry.expected.from, entry.id);
    assert.equal(result.query.select.expression, entry.expected.select, entry.id);
    assert.deepEqual(result.query.clauses, entry.expected.clauses, entry.id);
  }
});
