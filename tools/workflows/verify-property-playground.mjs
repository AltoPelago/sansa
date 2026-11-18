#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import {parseAddress, parseQuery, evaluateQuery, resolveAddress} from '../../src/index.js';
import {rowsFromNamespace, scopedNamespace} from '../playground/namespace.mjs';
import {verifyPropertySelection} from './property-playground-assertions.mjs';

// Explicit owner build: no SDK substitute, installation, cache or field fallback.
const root = process.argv[2];
if (!root || (process.argv[3] !== undefined && process.argv[3] !== '--installed')) throw Error('Usage: node tools/workflows/verify-property-playground.mjs /absolute/path/to/built/aeon-or-consumer [--installed]');
const prefix = process.argv[3] === '--installed' ? 'node_modules/@altopelago/aeon-' : 'implementations/typescript/packages/';
const url = path => pathToFileURL(resolve(root, prefix + path)).href;
const [{runRuntime}, {createAeonNamespace}] = await Promise.all([import(url('runtime/dist/index.js')), import(url('sdk/dist/sansa.js'))]);
const context = vm.createContext({window:{}, document:{querySelector:()=>({innerHTML:''})}});
vm.runInContext(readFileSync(new URL('../playground/examples.mjs', import.meta.url), 'utf8'), context);
const examples = JSON.parse(JSON.stringify(context.window.SansaPlaygroundExamples));
const report = {examples:[], queryPropertiesAdmitted:true, release:false, deployment:false};
for (const [id, example] of Object.entries(examples).filter(([id]) => id.startsWith('property'))) {
  const compiled = runRuntime(example.source, {mode:'transport', datatypePolicy:'reserved_only', includeAnnotations:true, output:'map'});
  assert.deepEqual(compiled.meta.errors, [], id);
  const owner = createAeonNamespace(compiled.aes);
  const namespace = scopedNamespace(owner, example.scope);
  const rows = rowsFromNamespace(owner);
  const options = {maxIdentityInspections:example.inspections,maxPropertyInspections:example.propertyInspections,maxBindings:1000};
  const isQuery = example.view === 'query';
  const parsed = isQuery ? parseQuery(example.query) : parseAddress(example.address);
  assert.equal(parsed.ok, true, id);
  for (const address of isQuery ? [example.query, parsed.query] : [example.address, parsed.address]) {
    const selected = example.view === 'query' ? evaluateQuery(address, namespace, {addressActivation:'trusted',resolve:options}) : resolveAddress(address, namespace, options);
    if (example.expectedCode) {
      assert.equal(selected.ok, false, id);
      assert.equal(selected.errors[0].code, example.expectedCode, id);
      assert.deepEqual(example.view === 'query' ? selected.results : selected.bindings, []);
      if (id === 'propertyBudget') {
        assert.equal(selected.errors[0].budget, 'maxPropertyInspections');
        assert.equal(selected.errors[0].limit, 1); assert.equal(selected.errors[0].observed, 2);
      }
    } else {
      verifyPropertySelection(selected, example, owner, rows, id);
    }
  }
  report.examples.push(id);
}
assert.equal(report.examples.length, 15);
console.log(JSON.stringify(report, null, 2));
