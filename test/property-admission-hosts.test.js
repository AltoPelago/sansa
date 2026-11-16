import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateQuery, lowerInstruction, parseAddress, parseInstruction, parseQuery, resolveAddress} from '../src/index.js';

test('closed Query consumer denies text and native property addresses before namespace root access', () => {
  for (const root of ['$', '?']) for (const suffix of ['&key("x")', '.missing&tag("x")']) {
    const source = root + suffix;
    for (const input of [source, parseAddress(source).address]) {
      let reads = 0;
      const forbidden = () => { reads++; throw new Error('namespace must not be read'); };
      const host = {root: forbidden, children: forbidden};
      Object.defineProperty(host, 'contextualRoot', {get: forbidden});
      for (const namespace of [host, {}, undefined]) {
        const query = parseQuery('from $\nselect true').query;
        query.select.ast = {type:'resolutionExpression',scope:'absolute',address:typeof input==='string'?parseAddress(input).address:input};
        const result = evaluateQuery(query, namespace);
        assert.equal(result.ok, false);
        assert.equal(result.errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_SELECTOR');
        assert.equal(result.errors[0].phase, 'policy');
      }
      assert.equal(reads, 0);
    }
  }
  let reads = 0;
  const root = {address: '$', children: []};
  const host = {root() { reads++; return root; }};
  assert.equal(resolveAddress('$', host).ok, true);
  assert.equal(reads, 1);
  assert.equal(resolveAddress('$', {}).errors[0].code, 'SANSA_RESOLVE_MISSING_ROOT');
  assert.equal(resolveAddress('?', {}).errors[0].code, 'SANSA_RESOLVE_UNSUPPORTED_CONTEXTUAL_ROOT');
});

const query = expression => parseQuery(`from $.missing\nselect ${expression}`).query;
const cases = [
  [() => query('(true)'), q => [q.select.ast, 'expression']],
  [() => query('$.x'), q => [q.select.ast, 'address']],
  [() => query('true and true'), q => [q.select.ast, 'left']],
  [() => query('true and true'), q => [q.select.ast, 'right']],
  [() => query('not true'), q => [q.select.ast, 'argument']],
  [() => query('exists($.x)'), q => [q.select.ast, 'argument']],
  [() => query('any($.x)'), q => [q.select.ast, 'argument']],
  [() => query('count($.x)'), q => [q.select.ast, 'arguments']],
  [() => query('count($.x)'), q => [q.select.ast.arguments, '0']],
  [() => query('count($.x)'), q => [q.select.ast, 'name']],
  [() => query('{x = true}'), q => [q.select.ast, 'fields']],
  [() => query('{x = true}'), q => [q.select.ast.fields, '0']],
  [() => query('{x = true}'), q => [q.select.ast.fields[0], 'expression']],
  [() => query('{x = true}'), q => [q.select.ast.fields[0], 'name']],
  [() => query('true'), q => [q.select.ast, 'type']],
  [() => query('true'), q => [q.select, 'ast']],
  [() => query('true'), q => [q, 'select']],
  [() => query('true'), q => [q.from, 'address']],
  [() => query('true'), q => [q.from, 'source']],
  [() => parseQuery('from $.missing\nwhere true\nselect true').query, q => [q.where, 'ast']],
  [() => parseQuery('from $.missing\norder by true\nselect true').query, q => [q.orderBy, 'keys']],
  [() => parseQuery('from $.missing\norder by true\nselect true').query, q => [q.orderBy.keys, '0']],
  [() => parseQuery('from $.missing\norder by true\nselect true').query, q => [q.orderBy.keys[0], 'ast']],
];

function rejectsAccessor(make, slot, evaluate) {
  assert.equal(evaluate(make(), {root: {children: []}}).ok, true, 'plain-data control');
  for (const throws of [false, true]) {
    const ast = make();
    const [object, key] = slot(ast);
    const value = object[key];
    let reads = 0;
    Object.defineProperty(object, key, {get() { reads++; if (throws) throw new Error('caller getter'); return value; }});
    let hostReads = 0;
    const host = {root() { hostReads++; return {children: []}; }, children() { hostReads++; return []; }};
    const result = evaluate(ast, host);
    assert.equal(result.ok, false, key);
    assert.equal(result.errors[0].code, 'SANSA_RESOLVE_INVALID_ADDRESS', key);
    assert.equal(reads, 0, key);
    assert.equal(hostReads, 0, key);
    assert.equal(JSON.parse(JSON.stringify(result)).ok, false);
  }
}

test('Query admission rejects expression, child-array and projection accessors without invoking them', () => {
  for (const [make, slot] of cases) rejectsAccessor(make, slot, evaluateQuery);
  const malformed = [null, {type: 'functionCallExpression', name: 'count', arguments: {}}, {type: 'projectionExpression', fields: [null]}];
  for (const expression of malformed) {
    const ast = query('true'); ast.select.ast = expression;
    assert.equal(evaluateQuery(ast, {}).ok, false);
  }
});

test('Instruction admission rejects requirement, mutation-role and nested expression accessors', () => {
  const instruction = () => parseInstruction('from $.missing\nwhere (true)\nrequire true\nremove ?').instruction;
  const slots = [
    i => [i.where.ast, 'expression'], i => [i.where, 'ast'], i => [i, 'where'],
    i => [i, 'requires'], i => [i.requires, '0'], i => [i.requires[0], 'ast'], i => [i.requires[0], 'expression'],
    i => [i, 'mutation'], i => [i.mutation, 'target'], i => [i.mutation.target, 'address'],
    i => [i.from, 'address'],
  ];
  for (const slot of slots) rejectsAccessor(instruction, slot, lowerInstruction);
  for (const [make, slot] of cases.slice(0, 15)) {
    const makeInstruction = () => { const i = instruction(); i.where.ast = make().select.ast; return i; };
    const instructionSlot = i => slot({select: {ast: i.where.ast}});
    rejectsAccessor(makeInstruction, instructionSlot, lowerInstruction);
  }
});
