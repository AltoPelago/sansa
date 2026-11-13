import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAddress, parseQuery, resolveAddress} from '../src/index.js';
import {rowsFromNamespace, scopedNamespace, selectionRows} from '../tools/playground/namespace.mjs';
import {playgroundImports} from '../scripts/playground.mjs';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';

function fixture() {
  const first = {address: '$.group.items[0]', identity: 'first', value: 'hello', children: []};
  const second = {address: '$.group.items[1]', identity: 'second', value: 'world', children: []};
  const items = {address: '$.group.items', name: 'items', children: [first, second]};
  const group = {address: '$.group', name: 'group', identity: 'group1', children: [items]};
  const root = {address: '$', children: [group]};
  const namespace = {root, children: b => b.children, identity: b => b.identity};
  return {namespace, first, second, items, group};
}

test('playground returns actual bindings and canonical paths after identity selection and reorder', () => {
  const {namespace, first, items} = fixture();
  const select = () => resolveAddress('$.group.items.\\first\\', namespace);
  assert.equal(select().bindings[0], first);
  items.children.reverse();
  first.address = '$.group.items[1]';
  const result = select();
  const rows = selectionRows(result, rowsFromNamespace(namespace));
  assert.equal(rows[0].binding, first);
  assert.equal(rows[0].path, '$.group.items[1]');
});

test('scope root itself is excluded from child identity matching', () => {
  const {namespace, items} = fixture();
  const scoped = scopedNamespace(namespace, '$.group');
  assert.deepEqual(resolveAddress('$.\\group1\\', scoped).bindings, []);
  assert.equal(resolveAddress('$.items', scoped).bindings[0], items);
  assert.equal(resolveAddress('$', scoped).bindings[0], scoped.root);
});

test('scope must resolve one structural binding, not an identity or expansion', () => {
  const {namespace} = fixture();
  for (const scope of ['$.\\group1\\', '$.*', '$.missing', '?']) {
    assert.throws(() => scopedNamespace(namespace, scope));
  }
});

test('real Resolve enforces inspection/ambiguity diagnostics and returns no partial selection', () => {
  const {namespace, second} = fixture();
  const parsed = parseAddress('$.group.items.\\first\\').address;
  const limited = resolveAddress(parsed, namespace, {maxIdentityInspections: 1});
  assert.equal(limited.ok, false);
  assert.equal(limited.errors[0].code, 'SANSA_RESOLVE_IDENTITY_LIMIT_EXCEEDED');
  assert.deepEqual(limited.bindings, []);
  second.identity = 'first';
  const ambiguous = resolveAddress(parsed, namespace);
  assert.equal(ambiguous.errors[0].identity, 'first');
  assert.deepEqual(ambiguous.bindings, []);
});

test('browser import map handles conditional package exports and source cursor subpath', t => {
  const root = mkdtempSync(join(tmpdir(), 'sansa-playground-map-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  for (const [dir, pkg] of Object.entries({
    runtime: {name: '@altopelago/aeon-runtime', exports: {types: './dist/runtime.d.ts', import: './dist/runtime.js'}},
    sdk: {name: '@altopelago/aeon-sdk', exports: {'.': {import: './dist/index.js'}, './sansa': {import: './dist/sansa.js'}}},
  })) {
    const target = join(root, 'implementations/typescript/packages', dir);
    mkdirSync(target, {recursive: true});
    writeFileSync(join(target, 'package.json'), JSON.stringify(pkg));
  }
  const {imports} = playgroundImports(root);
  assert.equal(imports['@aeon/runtime'], '/aeon/runtime/runtime.js');
  assert.equal(imports['@altopelago/aeon-sdk/sansa'], '/aeon/sdk/sansa.js');
  assert.equal(imports['@altopelago/sansa'], '/src/index.js');
  assert.equal(imports['@altopelago/sansa/parsing/selector-cursor'], '/src/selector-cursor.js');
});

test('website source composer keeps structural IDs on member, list and attribute rows', () => {
  const context = vm.createContext({window: {}, Map});
  vm.runInContext(readFileSync(new URL('../tools/playground/aeon-source-composer.js', import.meta.url), 'utf8'), context);
  const events = [
    {path: '$.group', structuralId: 'group1', value: {type: 'ObjectNode', bindings: []}},
    {path: '$.group.items[0]', structuralId: 'item1', value: {type: 'StringLiteral', value: 'hello'},
      attributes: {unit: {structuralId: 'unit1', value: {type: 'StringLiteral', value: 'cm'}}}},
  ];
  context.input = {aes: events};
  const rows = vm.runInContext('sourceRowsFromRuntimeResult(input)', context);
  assert.equal(rows.find(r => r.path === '$.group').identity, 'group1');
  assert.equal(rows.find(r => r.path === '$.group.items[0]').identity, 'item1');
  assert.equal(rows.find(r => r.identity === 'unit1')?.identity, 'unit1');
});

test('shipped playground examples load and have valid address and Query expressions', () => {
  const context = vm.createContext({window: {}, document: {querySelector: () => ({innerHTML: ''})}});
  vm.runInContext(readFileSync(new URL('../tools/playground/examples.mjs', import.meta.url), 'utf8'), context);
  const examples = Object.values(context.window.SansaPlaygroundExamples);
  assert.equal(examples.length, 11);
  for (const example of examples) {
    assert.equal(parseAddress(example.address).ok, true, example.label);
    if (example.view === 'query') assert.equal(parseQuery(example.query).ok, true, example.label);
  }
});
