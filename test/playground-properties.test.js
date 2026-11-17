import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

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
