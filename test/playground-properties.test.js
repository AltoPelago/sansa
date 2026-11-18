import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {evaluateQuery, parseAddress, parseQuery, resolveAddress} from '../src/index.js';
import {rowsFromNamespace} from '../tools/playground/namespace.mjs';
import {verifyPropertySelection} from '../tools/workflows/property-playground-assertions.mjs';

const controller = readFileSync(new URL('../tools/playground/sansa-playground.js', import.meta.url), 'utf8');
const section = (start, end) => controller.slice(controller.indexOf(start), controller.indexOf(end));

test('playground property allowance is independent, bounded and passed unchanged', () => {
  let property = '10000', identity = '37';
  const context = vm.createContext({shell: {querySelector(selector) {
    return {value: selector === '[data-sansa-inspections]' ? identity : property};
  }}});
  vm.runInContext(section('  function resolveOptions()', '  function rowsMatchingAddress('), context);
  const options = () => JSON.parse(JSON.stringify(context.resolveOptions()));
  assert.deepEqual(options(), {maxIdentityInspections:37,maxPropertyInspections:10000,maxBindings:1000});
  for (const value of ['0', '1000000']) {
    property = value; assert.equal(options().maxPropertyInspections, Number(value));
  }
  for (const value of ['', ' ', '-1', '1.5', '1000001', 'NaN', 'Infinity']) {
    property = value; assert.throws(options, /Property inspections/);
  }
  property = '4'; identity = '-1'; assert.throws(options, /Identity inspections/);
  assert.match(controller, /property-inspections\]"\)\.value = example\.propertyInspections \?\? 10000/);
  assert.match(controller, /\[data-sansa-scope\], \[data-sansa-inspections\], \[data-sansa-property-inspections\]/);
});

test('property runtime and parser diagnostics retain checked accounting fields only', () => {
  const context = vm.createContext({});
  vm.runInContext(section('  function diagnosticDetails(', '  function renderDiagnostics('), context);
  const result = context.diagnosticDetails({selectorIndex:2,property:'tag',budget:'maxPropertyInspections',limitKind:'payloadScalars',limit:1,observed:2,secret:'host details'});
  assert.equal(result, 'selectorIndex=2, property=tag, budget=maxPropertyInspections, limitKind=payloadScalars, limit=1, observed=2');
  assert.ok(section('  function renderDiagnostics(', '  function renderParseError(').includes('diagnosticDetails(error)'));
  assert.ok(section('  function renderParseError(', '  async function resolveNow(').includes('diagnosticDetails(first ?? {})'));
});

function workflowFixture() {
  const first = {address:'$.first', name:'first', children:[]};
  const second = {address:'$.second', name:'second', children:[]};
  const root = {address:'$', children:[first, second]};
  const owner = {root, children:binding => binding.children, properties:{
    scope: (binding, context) => binding === context.scopeRoot ? 'root' : 'inside',
    key: binding => binding.name,
  }};
  return {owner, rows:rowsFromNamespace(owner), first, second};
}

test('property workflow verifies real text/AST Resolve and populated/empty Query Binding Sets', () => {
  const {owner, rows} = workflowFixture();
  const address = '$.*&key("first")';
  for (const input of [address, parseAddress(address).address]) {
    verifyPropertySelection(resolveAddress(input, owner), {view:'resolve', expectedPaths:['$.first']}, owner, rows, 'resolve');
  }
  for (const [select, expectedQueryPaths] of [['.&key("first")', ['$.first']], ['?&key("first")', []]]) {
    const query = `from $.*&key("first")\nselect ${select}`;
    for (const input of [query, parseQuery(query).query]) {
      verifyPropertySelection(evaluateQuery(input, owner), {view:'query', expectedCandidatePaths:['$.first'], expectedQueryPaths}, owner, rows, select);
    }
  }
});

test('property workflow rejects wrong Query paths, cloned handles and missing empty-result rows', () => {
  const {owner, rows} = workflowFixture();
  const example = {view:'query', expectedCandidatePaths:['$.first', '$.second'], expectedQueryPaths:['$.first', '$.second']};
  const evaluate = () => evaluateQuery('from $.*\nselect .', owner);
  verifyPropertySelection(evaluate(), example, owner, rows, 'control');
  for (const corrupt of [
    result => { result.results[0].candidateAddress = '$.wrong'; },
    result => { result.results[0].binding = {...result.results[0].binding}; },
    result => { result.results[0].value.bindings = [{...result.results[0].value.bindings[0]}]; },
    result => { result.results[1].value.bindings = []; },
    result => { result.results[0].value.type = 'scalar'; },
  ]) {
    const selected = evaluate(); corrupt(selected);
    assert.throws(() => verifyPropertySelection(selected, example, owner, rows, 'negative control'), {code:'ERR_ASSERTION'});
  }
  const empty = evaluateQuery('from $.first\nselect .missing', owner);
  const emptyExample = {view:'query', expectedCandidatePaths:['$.first'], expectedQueryPaths:[]};
  verifyPropertySelection(empty, emptyExample, owner, rows, 'empty control');
  empty.results = [];
  assert.throws(() => verifyPropertySelection(empty, emptyExample, owner, rows, 'missing row'), {code:'ERR_ASSERTION'});
});

test('property workflow retains Resolve path and original-handle assertions', () => {
  const {owner, rows, first} = workflowFixture();
  const example = {view:'resolve', expectedPaths:['$.first']};
  assert.throws(() => verifyPropertySelection({ok:true, bindings:[{...first}]}, example, owner, rows, 'cloned handle'), {code:'ERR_ASSERTION'});
  assert.throws(() => verifyPropertySelection(resolveAddress('$.second', owner), example, owner, rows, 'wrong path'), {code:'ERR_ASSERTION'});
});
