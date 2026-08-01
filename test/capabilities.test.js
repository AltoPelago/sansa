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
