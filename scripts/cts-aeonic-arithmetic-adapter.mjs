#!/usr/bin/env node
import { evaluateAeonicArithmeticStructuredJson, evaluateAeonicArithmeticText } from '../src/aeonic-arithmetic.js';
import { parseArithmeticEnvelope } from '../src/aeonic-arithmetic-binding.js';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const scalar = (v) => typeof v === 'string' && !/[\uD800-\uDFFF]/u.test(v);
const closed = (v, names) => Object.keys(v).every((k) => names.includes(k));
try {
  if (process.argv.length !== 2) throw new Error('Unknown adapter argument');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = parseArithmeticEnvelope(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  if (!object(input) || !['lane', 'case_id', 'fixture', 'policy'].every((k) => Object.hasOwn(input, k)) ||
      input.lane !== 'aeonic-arithmetic' || !scalar(input.case_id) || !input.case_id.length ||
      !object(input.fixture) || !object(input.policy) || !closed(input.policy, ['resourceLimits'])) throw new Error('Malformed CTS envelope');
  const fixture = input.fixture, structured = Object.hasOwn(fixture, 'request');
  if (!closed(fixture, ['request', 'requestText']) || structured === Object.hasOwn(fixture, 'requestText') ||
      (!structured && !scalar(fixture.requestText))) throw new Error('Invalid fixture binding');
  const evaluate = structured ? evaluateAeonicArithmeticStructuredJson : evaluateAeonicArithmeticText;
  const result = evaluate(structured ? fixture.request : fixture.requestText, input.policy);
  const ok = result.outcome === 'value';
  process.stdout.write(JSON.stringify({ ok, errors: ok ? [] : [{ code: result.reason, path: null, span: null, phase: null }], warnings: [], result }) + '\n');
} catch (error) {
  process.stderr.write('CTS harness failure: ' + error.message + '\n'); process.exitCode = 1;
}
