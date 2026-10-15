import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareTemporalClaims, parseInstruction, parseQuery, parseQueryExpression, planMutation, validateMutationPlanTarget } from '../src/index.js';
import { namespaceFromAeonSource } from '../tools/query-web/runtime.mjs';

const fixture = JSON.parse(readFileSync(new URL('../implementations/rust/crates/sansa-runtime/tests/fixtures/aeon-014-values.json', import.meta.url), 'utf8'));
const child = { address: '$.value', name: 'value', representationKind: 'StringLiteral', value: 'old', children: [] };
const root = { address: '$', representationKind: 'ObjectLiteral', children: [child] };
child.parent = root;
const namespace = { root, children: (binding) => binding.children, parent: (binding) => binding.parent };

function target(value, datatype, kind) {
  const result = planMutation({ op: 'replace', target: '$.value', value, datatype, ...(kind === undefined ? {} : { kind }) }, namespace);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return validateMutationPlanTarget(result.plan, 'aeon');
}

function validTemporals() {
  const values = fixture.dates.map((source) => ({ source, kind: 'date' }));
  for (const clock of fixture.clocks.filter((clock) => clock.includes(':'))) {
    for (const anchor of fixture.anchors) values.push({ source: clock + anchor, kind: 'time' });
  }
  for (const date of fixture.dates) for (const clock of fixture.clocks) {
    for (const anchor of fixture.anchors) for (const context of fixture.contexts) {
      values.push({ source: `${date}T${clock}${anchor}${context}`, kind: context ? 'wtc' : 'datetime' });
    }
  }
  return values;
}

test('AEON calendar/clock matrix reaches Query, Instruction, and AEON target validation', () => {
  for (const { source, kind } of validTemporals()) {
    const parsed = parseQueryExpression(source);
    assert.equal(parsed.ok, true, source);
    assert.equal(parsed.expression.kind, kind, source);
    assert.equal(parsed.expression.value, source);
    assert.equal(parsed.expression.canonical, source);
    assert.equal(parseQuery(`from $.value\nselect ${source}`).ok, true, source);
    assert.equal(parseInstruction(`replace $.value with :${kind}, ${source}`).ok, true, source);
    assert.equal(target(source, kind).ok, true, source);
  }
  for (const source of fixture.invalid) {
    assert.equal(parseQueryExpression(source).ok, false, source);
    assert.equal(parseInstruction(`replace $.value with ${source}`).ok, false, source);
    const kind = source.includes('T') ? (source.includes('&') ? 'wtc' : 'datetime') : source.includes(':') ? 'time' : 'date';
    assert.equal(target(source, kind).ok, false, source);
    assert.equal(parseQueryExpression(`temporalRelation(${source}, ${source})`).ok, false, source);
  }
  for (const [source, kind] of [['2024-\n', 'date'], ['10: //comment', 'time'], ['2024-T10: ', 'datetime'], ['2024-T10:&local\r', 'wtc']]) {
    assert.equal(target(source, kind).ok, false, JSON.stringify(source));
  }
});

test('shared value matrix agrees with an available AEON Core runtime', async (t) => {
  const probe = await namespaceFromAeonSource('probe:string = "ok"');
  if (!probe.ok) {
    t.skip(probe.errors?.[0]?.message ?? 'AEON Core runtime unavailable');
    return;
  }
  for (const { source, kind } of validTemporals()) {
    const result = await namespaceFromAeonSource(`probe:${kind} = ${source}\n`);
    assert.equal(result.ok, true, source);
    assert.equal(result.namespace.root.children[0].value, source);
  }
  for (const source of fixture.invalid) {
    assert.equal((await namespaceFromAeonSource(`probe = ${source}\n`)).ok, false, source);
  }
  for (const payload of fixture.base64_valid) {
    assert.equal((await namespaceFromAeonSource(`probe:base64 = &${payload}\n`)).ok, true, payload);
  }
  for (const prefix of ['~', '~>']) {
    assert.equal((await namespaceFromAeonSource(`target:base64 = &Zg==\nprobe:base64 = ${prefix}target\n`)).ok, true, prefix);
  }
  for (const payload of [...fixture.base64_opaque_only, ...fixture.encoding_invalid]) {
    // Source layout follows a token; direct mutation payload whitespace does not.
    if (payload.trim() !== payload) continue;
    assert.equal((await namespaceFromAeonSource(`probe:base64 = &${payload}\n`)).ok, false, payload);
  }
  // Duplicate each representative character, including separators and zone
  // punctuation. Compare outcomes rather than assuming every duplicate is bad.
  for (const { source, kind } of [
    { source: '2024-02-29T10:20:60.100Z', kind: 'datetime' },
    { source: '2024-T10:&Europe/Belgium', kind: 'wtc' },
    { source: '10:20:30-00:00', kind: 'time' },
  ]) {
    for (let index = 0; index < source.length; index += 1) {
      const candidate = source.slice(0, index) + source[index] + source.slice(index);
      const core = await namespaceFromAeonSource(`probe:${kind} = ${candidate}\n`);
      assert.equal(parseQueryExpression(candidate).ok, core.ok, candidate);
      assert.equal(target(candidate, kind).ok, core.ok, candidate);
    }
  }
});

test('target validation distinguishes reserved base64 from opaque encoding families', () => {
  for (const payload of fixture.base64_valid) assert.equal(target(payload, 'base64').ok, true, payload);
  for (const payload of [...fixture.base64_opaque_only, ...fixture.encoding_invalid]) assert.equal(target(payload, 'base64').ok, false, payload);
  for (const payload of [...fixture.base64_valid, ...fixture.base64_opaque_only]) {
    for (const datatype of ['encoding', 'inline', 'embed']) assert.equal(target(payload, datatype).ok, true, `${datatype}:${payload}`);
  }
  for (const payload of fixture.encoding_invalid) {
    for (const datatype of ['encoding', 'inline', 'embed']) assert.equal(target(payload, datatype).ok, false, `${datatype}:${payload}`);
  }
  for (const [datatype, payload] of [['base64', 'AAA\n'], ['encoding', 'AAA\n'], ['radix', 'ff\n'], ['hex', 'ff\n']]) {
    assert.equal(target(payload, datatype).ok, false, datatype);
  }
});

test('base64 references validate addresses rather than interpreting them as encoding data', () => {
  for (const kind of ['cloneReference', 'pointerReference', 'referenceForm']) {
    for (const address of ['target', 'path.to', '$.target', '$.["literal.key"]']) {
      assert.equal(target(address, 'base64', kind).ok, true, `${kind}:${address}`);
    }
    for (const address of ['', 'target.*', 'target..child', 'target child']) {
      assert.equal(target(address, 'base64', kind).ok, false, `${kind}:${address}`);
    }
  }
  // The same text remains invalid when it really is Base64URL payload data.
  assert.equal(target('target', 'base64', 'encoding').ok, false);
});

test('symbol source families preserve payloads through Query and Instruction', () => {
  for (const source of fixture.symbols) {
    const result = parseQueryExpression(source);
    assert.equal(result.ok, true, source);
    assert.equal(result.expression.kind, 'symbol');
    assert.equal(parseInstruction(`replace $.value with :symbol, ${source}`).ok, true, source);
    assert.equal(target(result.expression.value, 'symbol').ok, true, source);
  }
  for (const source of fixture.invalid_symbols) assert.equal(parseQueryExpression(source).ok, false, source);
});

test('temporal relation fails closed for unsupported disjoint date/clock completion sets and malformed descriptors', () => {
  for (const [semanticType, payload] of [
    ['datetime', '2024-T10:'], ['wtc', '2024-02T10:&Europe'],
    ['time', '10::20'], ['time', '12:éaaaaa'], ['wtc', '2024-01-01T10:&Local'],
  ]) {
    const descriptor = { semanticType, payload };
    assert.equal(compareTemporalClaims(descriptor, descriptor), 'incomparable', payload);
  }
});
