import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const capabilities = JSON.parse(readFileSync(new URL('../docs/capabilities.json', import.meta.url), 'utf8'));

function experimentalCapability(id) {
  return capabilities.experimentalCapabilities.find((capability) => capability.id === id);
}

test('capability manifest keeps instruction aliases separate from mutate plan operations', () => {
  const instruction = experimentalCapability('sansa.instruction.prototype.v1');
  const mutate = experimentalCapability('sansa.mutate.plan.v1');

  assert.ok(instruction, 'missing instruction capability metadata');
  assert.ok(mutate, 'missing mutate plan capability metadata');
  assert.ok(instruction.verbs.includes('append'));
  assert.deepEqual(instruction.aliases, [
    {
      sourceVerb: 'append',
      canonicalVerb: 'insert',
      placement: 'last',
    },
  ]);
  assert.deepEqual(mutate.operations, ['create', 'replace', 'remove', 'insert', 'move']);
});

test('capability manifest exposes structured one-hop Graph as experimental', () => {
  const graph = experimentalCapability('sansa.graph.structured.one-hop.v1');
  assert.ok(graph, 'missing Graph capability metadata');
  assert.deepEqual(graph.entryPoints, ['traverseGraph', 'traverseGraphSequence']);
  assert.ok(graph.semantics.includes('mandatory explicit budgets'));
  assert.ok(graph.semantics.includes('explicit schema-version applicability'));
  assert.ok(graph.semantics.includes('source and target semantic-type constraints'));
  assert.ok(graph.semantics.includes('per-source edge cardinality constraints'));
  assert.ok(graph.semantics.includes('same-namespace traversal only'));
  assert.ok(graph.semantics.includes('explicit bounded multi-hop declaration sequences'));
  assert.ok(graph.semantics.includes('explicit omit-or-error cycle policy'));
  assert.ok(graph.semantics.includes('index-neutral traversal through optional namespace lookup acceleration'));
  assert.ok(graph.boundaries.includes('target adapters own index health, rebuild, and scan fallback'));
  assert.ok(graph.semantics.includes('explicit Query-before and contextual Query/Transform-after composition'));
  assert.ok(graph.boundaries.includes('traversal conveys location, never authorization'));
  assert.ok(graph.boundaries.includes('Graph authorization does not authorize composed Query reads'));
});
