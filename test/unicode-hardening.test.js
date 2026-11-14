import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { aeonValueSemanticsDefaultProfile, createIntlValueSemanticsProfile,
  evaluateValueSemanticsOperation, evaluateQuery, resolveAddress } from '../src/index.js';
const vectors = JSON.parse(readFileSync(new URL('../fixtures/unicode-hardening-v1.json', import.meta.url)));
const namespace = { root: { address: '$', children: [] }, children: b => b.children };
for (const vector of vectors.mapping_cases) test(vector.id + ' direct and Query', () => {
  const profile = vector.locale === 'default' ? aeonValueSemanticsDefaultProfile : createIntlValueSemanticsProfile({ locale: vector.locale });
  if (vector.locale !== 'default') assert.ok(Intl.Collator.supportedLocalesOf([vector.locale]).length, `required locale ${vector.locale} unavailable`);
  assert.equal(profile[`${vector.operation}String`](vector.input), vector.expected);
  const result = evaluateQuery(`from $\nselect ${vector.operation}(${JSON.stringify(vector.input)})`, namespace, { valueSemantics: profile });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.results[0].value.value, vector.expected);
});
for (const vector of vectors.identity_pairs) test(vector.id + ' equality and literal-member selection', () => {
  const children = [vector.left, vector.right].map((name, index) => ({ name, value: index, address: `$[${index}]`, children: [] }));
  const ns = { root: { address: '$', children }, children: b => b.children };
  const equality = evaluateValueSemanticsOperation('equal', { left: { category: 'string', value: vector.left }, right: { category: 'string', value: vector.right } });
  assert.equal(equality.ok, true); assert.equal(equality.value, false);
  for (const [index, name] of [vector.left, vector.right].entries()) {
    const result = resolveAddress(`$.[${JSON.stringify(name)}]`, ns);
    assert.equal(result.ok, true, JSON.stringify(result)); assert.deepEqual(result.bindings, [children[index]]); assert.equal(result.bindings[0], children[index]);
  }
});
for (const pattern of ['?', '*', 'plain', 'plain?', '*\n']) test('Unicode glob whole-name ' + JSON.stringify(pattern), () => {
  const children = vectors.wildcard_names.map((name, index) => ({ name, address: `$[${index}]`, children: [] }));
  const ns = { root: { address: '$', children }, children: b => b.children };
  const wanted = children.filter(b => pattern === '*' || (pattern === '?' ? [...b.name].length === 1 : pattern === 'plain' ? b.name === 'plain' : pattern === 'plain?' ? b.name === 'plain\n' : b.name.endsWith('\n')));
  const result = resolveAddress(`$.(${JSON.stringify(pattern)})`, ns);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.deepEqual(result.bindings, wanted);
  const query = evaluateQuery(`from $.(${JSON.stringify(pattern)})\nselect ?`, ns);
  assert.equal(query.ok, true, JSON.stringify(query)); assert.equal(query.results.length, wanted.length);
});
test('explicit Turkish profile preserves complete equality/order/mapping contract', () => {
  const p = createIntlValueSemanticsProfile({ locale: 'tr', sensitivity: 'base' });
  for (const [a, b] of [['I', 'ı'], ['İ', 'i']]) {
    assert.equal(p.compareStrings(a, b), 0); assert.equal(p.lowerString(a), p.lowerString(b));
    const r = evaluateValueSemanticsOperation('equal', { left: { category: 'string', value: a }, right: { category: 'string', value: b } }, { valueSemantics: p });
    assert.equal(r.ok, true); assert.equal(r.value, true);
  }
  assert.notEqual(p.compareStrings('I', 'i'), 0);
  assert.throws(() => createIntlValueSemanticsProfile({ locale: 'not_a_locale' }), RangeError);
  const r = evaluateQuery('from $\nselect lower("I")', namespace, { valueSemantics: { lowerString: s => s.toLowerCase() } });
  assert.equal(r.ok, false); // Incomplete profiles must not silently borrow default comparison.
});
test('default identity and casing are independent of fresh process locale', context => {
  const entry = new URL('../src/index.js', import.meta.url).href;
  const program = `import { aeonValueSemanticsDefaultProfile as p, evaluateValueSemanticsOperation as op } from ${JSON.stringify(entry)}; console.log(JSON.stringify({locale:new Intl.Collator().resolvedOptions().locale,ambientCasing:'I'.toLocaleLowerCase(),lower:p.lowerString('Iİ'),equal:op('equal',{left:{category:'string',value:'I'},right:{category:'string',value:'ı'}}).value}));`;
  const observations = [];
  for (const locale of ['C', 'en_US.UTF-8', 'tr_TR.UTF-8', 'az_AZ.UTF-8']) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', program], { env: { ...process.env, LANG: locale, LC_ALL: locale }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); const observed=JSON.parse(r.stdout); context.diagnostic(JSON.stringify({requested:locale,collatorLocale:observed.locale,ambientCasing:observed.ambientCasing})); observations.push({lower:observed.lower,equal:observed.equal});
  }
  for (const observed of observations) assert.deepEqual(observed, { lower: 'ii\u0307', equal: false });
});

test('all dotted/dotless-I default equality pairs remain exact through direct and Query APIs', () => {
  for (const a of vectors.exact_equality_values) for (const b of vectors.exact_equality_values) {
    const direct = evaluateValueSemanticsOperation('equal', { left: { category: 'string', value: a }, right: { category: 'string', value: b } });
    assert.equal(direct.ok, true); assert.equal(direct.value, a === b);
    const query = evaluateQuery(`from $\nselect ${JSON.stringify(a)} == ${JSON.stringify(b)}`, namespace);
    assert.equal(query.ok, true, JSON.stringify(query)); assert.equal(query.results[0].value.value, a === b);
  }
});
test('Intl fallback is explicit provider behavior, not a native capability claim', () => {
  assert.equal(Intl.Collator.supportedLocalesOf(['zz-ZZ']).length, 0);
  const profile = createIntlValueSemanticsProfile({ locale: 'zz-ZZ' });
  assert.equal(profile.lowerString('Iİ'), 'Iİ'.toLocaleLowerCase('zz-ZZ'));
  assert.equal(profile.compareStrings('a', 'b'), Math.sign(new Intl.Collator('zz-ZZ').compare('a', 'b')));
});
