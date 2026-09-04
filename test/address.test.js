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

test('parses parent selectors as non-exact selectors', () => {
  const address = parseOk('$.inventory.items[1].^.sku');
  assert.equal(address.isExact, false);
  assert.deepEqual(address.selectors.map((selector) => selector.type), [
    'member',
    'member',
    'position',
    'parent',
    'member',
  ]);
  assert.equal(address.canonical, '$.inventory.items[1].^.sku');

  const quotedCaret = parseOk('$.["^"]');
  assert.equal(quotedCaret.isExact, true);
  assert.deepEqual(quotedCaret.selectors.at(-1), { type: 'member', name: '^', quoted: true });
  assert.equal(quotedCaret.canonical, '$.["^"]');
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

test('parses PascalCase representation kind filters with the standard identifier grammar', () => {
  const address = parseOk('$.document[0]%NodeHead');
  assert.deepEqual(address.selectors.at(-1), { type: 'representationKindFilter', name: 'NodeHead' });
  assert.equal(address.canonical, '$.document[0]%NodeHead');

  parseBad('$.document[0]%node-head', 'SANSA_UNEXPECTED_CHARACTER');
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

test('parses multiple qualifier clarifier values', () => {
  const address = parseOk('$.key:string[",","."]');
  const args = address.qualifierExpression.terms[0].arguments;
  assert.deepEqual(args.map((arg) => arg.value), [',', '.']);
  assert.equal(address.canonical, '$.key:string[",","."]');
});

test('parses numeric qualifier clarifier values', () => {
  const address = parseOk('$.bits:radix[16]');
  const args = address.qualifierExpression.terms[0].arguments;
  assert.equal(args[0].kind, 'number');
  assert.equal(args[0].value, 16);
  assert.equal(address.canonical, '$.bits:radix[16]');
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

test('rejects position indexes above the local configured limit', () => {
  assert.equal(parseOk('$.items[999999]').canonical, '$.items[999999]');
  assert.equal(parseOk('$.items[0..999999]').canonical, '$.items[0..999999]');
  parseBad('$.items[1000000]', 'SANSA_POSITION_INDEX_LIMIT_EXCEEDED');
  parseBad('$.items[0..1000000]', 'SANSA_POSITION_INDEX_LIMIT_EXCEEDED');
  parseBad('$.items[1000000..]', 'SANSA_POSITION_INDEX_LIMIT_EXCEEDED');
});

test('warns when a raised local limit accepts non-portable position indexes', () => {
  const result = parseAddress('$.items[1000000]', { maxPositionIndex: 10_000_000 });
  assert.equal(result.ok, true);
  assert.equal(result.address.canonical, '$.items[1000000]');
  assert.deepEqual(result.warnings.map((warning) => warning.code), ['SANSA_NON_PORTABLE_POSITION_INDEX']);
  assert.equal(result.warnings[0].observed, 1000000);
  assert.equal(result.warnings[0].portableFloor, 999999);
});

test('rejects empty position ranges', () => {
  parseBad('$.items[..]', 'SANSA_EMPTY_POSITION_RANGE');
});

test('rejects raw comma in qualifier arguments', () => {
  parseBad('$.inventory:csv[,]', 'SANSA_EXPECTED_QUALIFIER_ARGUMENT');
});

test('rejects unquoted qualifier string clarifiers', () => {
  parseBad('$.version:sep[.]', 'SANSA_INVALID_QUALIFIER_ARGUMENT');
});

test('rejects repeated qualifier clarifier lists', () => {
  parseBad('$.key:string[","]["."]', 'SANSA_INVALID_QUALIFIER');
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
