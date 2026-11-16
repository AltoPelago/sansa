import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runPropertyVector} from './property-resolve-fixture.mjs';
const suite = JSON.parse(readFileSync(new URL('../fixtures/property-resolve-candidate-v1.json', import.meta.url)));
for (const vector of suite.tests) test(vector.id, () => runPropertyVector(vector));
