import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseAddress, renderAddress } from '../src/index.js';

function parseOk(source) {
  const result = parseAddress(source);
  assert.equal(result.ok, true, JSON.stringify(result.errors ?? []));
  return result.address;
}

function parseBad(source, code) {
  const result = parseAddress(source);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, code);
}

test('parses root-only addresses', () => {
  assert.equal(parseOk('$').root.kind, 'absolute');
  assert.equal(parseOk('?').root.kind, 'contextual');
});

test('parses exact structural selectors', () => {
  const address = parseOk('$.inventory[0].["display.name"].@.<"pdf">');
  assert.equal(address.isExact, true);
  assert.deepEqual(address.selectors.map((selector) => selector.type), [
    'member',
    'position',
    'member',
    'attributeSpace',
    'localSpace',
  ]);
  assert.equal(address.canonical, '$.inventory[0].["display.name"].@.<"pdf">');
  assert.equal(renderAddress(address), address.canonical);
});

test('parses position range selectors as non-exact selectors', () => {
  const bounded = parseOk('$.items[2..5]');
  assert.equal(bounded.isExact, false);
  assert.deepEqual(bounded.selectors.at(-1), { type: 'positionRange', start: 2, end: 5 });
  assert.equal(bounded.canonical, '$.items[2..5]');

  const openEnd = parseOk('$.items[2..]');
  assert.deepEqual(openEnd.selectors.at(-1), { type: 'positionRange', start: 2, end: null });
  assert.equal(openEnd.canonical, '$.items[2..]');

  const openStart = parseOk('$.items[..5]');
  assert.deepEqual(openStart.selectors.at(-1), { type: 'positionRange', start: null, end: 5 });
  assert.equal(openStart.canonical, '$.items[..5]');
});

test('canonicalizes identifier-safe quoted member names', () => {
  const address = parseOk('$.["name"]');
  assert.equal(address.canonical, '$.name');
});

test('parses expanded address expressions', () => {
  const address = parseOk('$.items.*#text%stringLiteral.("item?*").**');
  assert.equal(address.isExact, false);
  assert.deepEqual(address.selectors.map((selector) => selector.type), [
    'member',
    'directExpansion',
    'semanticTypeFilter',
    'representationKindFilter',
    'namePattern',
    'descendantExpansion',
  ]);
});

test('parses qualified address literals', () => {
  const address = parseOk('$.result:number|nan');
  assert.equal(address.qualifierExpression.terms.length, 2);
  assert.equal(address.canonical, '$.result:number|nan');
});

test('parses qualifier parameters and quoted arguments', () => {
  const address = parseOk('$.inventory:csv[","]');
  assert.equal(address.qualifierExpression.terms[0].arguments[0].kind, 'quoted');
  assert.equal(address.qualifierExpression.terms[0].arguments[0].value, ',');
  assert.equal(address.canonical, '$.inventory:csv[","]');
});

test('parses repeated qualifier arguments', () => {
  const address = parseOk('$.key:string[","]["."]');
  const args = address.qualifierExpression.terms[0].arguments;
  assert.deepEqual(args.map((arg) => arg.value), [',', '.']);
  assert.equal(address.canonical, '$.key:string[","]["."]');
});

test('parses nested qualifier terms without nested unions', () => {
  const address = parseOk('$.inventory:list<string>');
  const term = address.qualifierExpression.terms[0];
  assert.equal(term.name, 'list');
  assert.equal(term.parameters[0].name, 'string');
  assert.equal(term.parameterGroups.length, 1);
});

test('parses repeated qualifier parameter groups', () => {
  const address = parseOk('$.key:tuple<x><y>');
  const term = address.qualifierExpression.terms[0];
  assert.deepEqual(term.parameters.map((param) => param.name), ['x', 'y']);
  assert.deepEqual(term.parameterGroups.map((group) => group.map((param) => param.name)), [['x'], ['y']]);
  assert.equal(address.canonical, '$.key:tuple<x><y>');
});

test('rejects whitespace outside quoted payloads', () => {
  parseBad('$.bad name', 'SANSA_UNEXPECTED_WHITESPACE');
});

test('rejects leading-zero indexes', () => {
  parseBad('$.items[01]', 'SANSA_LEADING_ZERO_INDEX');
  parseBad('$.items[01..2]', 'SANSA_LEADING_ZERO_INDEX');
  parseBad('$.items[1..02]', 'SANSA_LEADING_ZERO_INDEX');
});

test('rejects empty position ranges', () => {
  parseBad('$.items[..]', 'SANSA_EMPTY_POSITION_RANGE');
});

test('rejects raw comma in qualifier arguments', () => {
  parseBad('$.inventory:csv[,]', 'SANSA_INVALID_QUALIFIER_ARGUMENT_CHAR');
});

test('rejects nested qualifier unions', () => {
  parseBad('$.value:list<string|number>', 'SANSA_INVALID_QUALIFIER');
});

test('rejects empty quoted member and local-space names', () => {
  parseBad('$.[""]', 'SANSA_EMPTY_MEMBER_NAME');
  parseBad('$.<"">', 'SANSA_EMPTY_LOCAL_SPACE_NAME');
});

test('fixture cases match parser behavior', () => {
  const fixture = JSON.parse(readFileSync(new URL('../fixtures/address-v1.json', import.meta.url), 'utf8'));
  for (const entry of fixture.cases) {
    const result = parseAddress(entry.source);
    assert.equal(result.ok, entry.valid, entry.id);
    if (entry.valid) {
      assert.equal(result.address.canonical, entry.canonical, entry.id);
      assert.equal(result.address.isExact, entry.exact, entry.id);
      if (entry.root) {
        assert.equal(result.address.root.kind, entry.root, entry.id);
      }
      if (entry.selectors) {
        assert.deepEqual(result.address.selectors.map((selector) => selector.type), entry.selectors, entry.id);
      }
      if (entry.qualifierTerms) {
        assert.deepEqual(
          result.address.qualifierExpression?.terms.map((term) => term.name),
          entry.qualifierTerms,
          entry.id
        );
      }
    } else {
      assert.equal(result.errors[0].code, entry.error, entry.id);
    }
  }
});
