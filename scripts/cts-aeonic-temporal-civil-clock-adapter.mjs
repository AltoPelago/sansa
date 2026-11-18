#!/usr/bin/env node
import { evaluateAeonicCivilClockStructuredJson, evaluateAeonicCivilClockText } from '../src/aeonic-temporal-civil-clock.js';
import { parseRationalArithmeticEnvelope } from '../src/aeonic-rational-json.js';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const scalar = (v) => typeof v === 'string' && !/[\uD800-\uDFFF]/u.test(v);
const closed = (v, names) => Object.keys(v).every((k) => names.includes(k));
try {
  const args = process.argv.slice(2);
  const choice = args.length === 0 ? 'all' : args.length === 2 && args[0] === '--capability-set' ? args[1] : null;
  if (!['all', 'relations', 'arithmetic'].includes(choice)) throw new Error('Use --capability-set all|relations|arithmetic');
  const capabilities = choice === 'all' ? ['relations', 'arithmetic'] : [choice];
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = parseRationalArithmeticEnvelope(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  if (!object(input) || !['lane', 'case_id', 'fixture', 'policy'].every((k) => Object.hasOwn(input, k)) ||
      input.lane !== 'aeonic-temporal-civil-clock' || !scalar(input.case_id) || !input.case_id.length ||
      !object(input.fixture) || !object(input.policy) || !closed(input.policy, ['resourceLimits'])) throw new Error('Malformed CTS envelope');
  const fixture = input.fixture, structured = Object.hasOwn(fixture, 'request');
  if (!closed(fixture, ['request', 'requestText']) || structured === Object.hasOwn(fixture, 'requestText') ||
      (!structured && !scalar(fixture.requestText))) throw new Error('Invalid fixture binding');
  const evaluate = structured ? evaluateAeonicCivilClockStructuredJson : evaluateAeonicCivilClockText;
  const result = evaluate(structured ? fixture.request : fixture.requestText, { ...input.policy, capabilities });
  const ok = result.outcome === 'value';
  process.stdout.write(JSON.stringify({ ok, errors: ok ? [] : [{ code: result.reason, path: null, span: null, phase: null }], warnings: [], result }) + '\n');
} catch (error) {
  process.stderr.write('CTS harness failure: ' + error.message + '\n'); process.exitCode = 1;
}
