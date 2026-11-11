#!/usr/bin/env node
import { evaluateAeonicComparisonText } from '../src/index.js';
import { evaluateAeonicComparisonStructuredJson } from '../src/aeonic-comparison.js';
import { parseStrictJson } from '../src/aeonic-json.js';

const scalar = (value) => typeof value === 'string' && !/[\uD800-\uDFFF]/u.test(value);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const closed = (value, keys) => Object.keys(value).every(key => keys.includes(key));
try {
  if (process.argv.length !== 2) throw new Error('Unexpected adapter argument');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const envelope = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  if (!object(envelope) || !closed(envelope, ['lane', 'case_id', 'fixture', 'policy']) ||
      envelope.lane !== 'aeonic-operations' || !scalar(envelope.case_id) || !envelope.case_id ||
      !object(envelope.fixture) || !object(envelope.policy) || !closed(envelope.policy, ['resourceLimits'])) {
    throw new Error('Malformed CTS input envelope');
  }
  const fixture = envelope.fixture;
  const structured = Object.hasOwn(fixture, 'request');
  if (!closed(fixture, ['request', 'requestText']) || structured === Object.hasOwn(fixture, 'requestText') ||
      !structured && !scalar(fixture.requestText)) throw new Error('Invalid comparison fixture binding');
  const evaluate = structured ? evaluateAeonicComparisonStructuredJson : evaluateAeonicComparisonText;
  const result = evaluate(structured ? fixture.request : fixture.requestText, { resourceLimits: envelope.policy.resourceLimits });
  const ok = result.outcome === 'value';
  process.stdout.write(JSON.stringify({ ok, errors: ok ? [] : [{ code: result.reason, path: null, span: null, phase: null }], warnings: [], result }) + '\n');
} catch (error) {
  process.stderr.write(`Aeonic comparison CTS harness failure: ${error.message}\n`);
  process.exitCode = 1;
}
