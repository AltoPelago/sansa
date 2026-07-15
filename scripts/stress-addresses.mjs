#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseAddress } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const suites = [
  {
    name: 'valid',
    file: resolve(root, 'stress-tests/address/valid.sansa-cases'),
    shouldParse: true,
  },
  {
    name: 'invalid',
    file: resolve(root, 'stress-tests/address/invalid.sansa-cases'),
    shouldParse: false,
  },
];

let failures = 0;
let total = 0;

for (const suite of suites) {
  const cases = readCases(suite.file);
  for (const testCase of cases) {
    total += 1;
    const result = parseAddress(testCase.source);
    if (suite.shouldParse && !result.ok) {
      failures += 1;
      const first = result.errors[0];
      console.error(`[FAIL] ${suite.name} case ${testCase.index}: expected parse success`);
      console.error(`       source: ${JSON.stringify(testCase.source)}`);
      console.error(`       error: ${first.code} ${first.message}`);
    }
    if (!suite.shouldParse && result.ok) {
      failures += 1;
      console.error(`[FAIL] ${suite.name} case ${testCase.index}: expected parse failure`);
      console.error(`       source: ${JSON.stringify(testCase.source)}`);
      console.error(`       canonical: ${result.address.canonical}`);
    }
  }
}

if (failures > 0) {
  console.error(`SANSA address stress failed: ${failures}/${total} cases failed`);
  process.exit(1);
}

console.log(`SANSA address stress passed: ${total} cases`);

function readCases(file) {
  const raw = readFileSync(file, 'utf8');
  return raw
    .split(/^---[ \t]*$/m)
    .map((chunk) => chunk
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n')
      .trim())
    .filter((source) => source.length > 0)
    .map((source, index) => ({ source, index: index + 1 }));
}
