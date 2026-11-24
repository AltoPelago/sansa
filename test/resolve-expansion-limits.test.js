import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAddress, resolveAddress, evaluateQuery } from '../src/index.js';

for (const width of [32, 96]) {
  for (const selector of ['$.*', '$.**']) {
    for (const parsed of [false, true]) {
      test(`${selector} bounds lazy expansion (${width} children, ${parsed ? 'AST' : 'text'})`, () => {
        for (const limit of [0, 1, width]) {
          const root = { address: '$' };
          const children = Array.from({ length: width }, (_, i) => ({ address: `$[${i}]` }));
          let yielded = 0;
          let closed = 0;
          const namespace = { root, children(binding) {
            if (binding !== root) return [];
            return (function* () {
              try { for (const child of children) { yielded++; yield child; } }
              finally { closed++; }
            })();
          } };
          const address = parsed ? parseAddress(selector).address : selector;
          const result = resolveAddress(address, namespace, { maxBindings: limit });
          assert.equal(yielded, Math.min(width, limit + 1));
          assert.equal(closed, 1);
          if (limit < width) {
            assert.equal(result.ok, false);
            assert.deepEqual(result.bindings, []);
            assert.equal(result.errors[0].code, 'SANSA_RESOLVE_BINDING_LIMIT_EXCEEDED');
            assert.equal(result.errors[0].limit, limit);
            assert.equal(result.errors[0].observed, limit + 1);
            assert.equal(result.errors[0].selectorIndex, 0);
          } else {
            assert.equal(result.ok, true);
            assert.deepEqual(result.bindings, children);
            children.forEach((child, i) => assert.equal(result.bindings[i], child));
          }
        }
      });
    }
  }
}

for (const selector of ['$.*', '$.**']) {
  test(`${selector} does not request a throwing tail after the over-limit child`, () => {
    const root = { address: '$' };
    let reads = 0;
    let closed = 0;
    const result = resolveAddress(selector, { root, children(binding) {
      if (binding !== root) return [];
      return (function* () {
        try {
          reads++; yield { address: '$[0]' };
          reads++; yield { address: '$[1]' };
          reads++; throw new Error('tail must not execute');
        } finally { closed++; }
      })();
    } }, { maxBindings: 1 });
    assert.equal(result.ok, false);
    assert.deepEqual(result.bindings, []);
    assert.equal(result.errors[0].observed, 2);
    assert.equal(reads, 2);
    assert.equal(closed, 1);
  });
}

test('recursive expansion preserves depth-first ordering, binding identity and repeated occurrences', () => {
  const leaf = { address: '$.a.leaf' };
  const a = { address: '$.a', children: [leaf] };
  const b = { address: '$.b' };
  const namespace = { root: { address: '$', children: [a, b, a] } };
  const result = resolveAddress('$.**', namespace, { maxBindings: 5 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.bindings.map(b => b.address), ['$.a', '$.a.leaf', '$.b', '$.a', '$.a.leaf']);
  [a, leaf, b, a, leaf].forEach((binding, i) => assert.equal(result.bindings[i], binding));
});

test('direct expansion shares the intermediate allowance across parent branches', () => {
  const a = { address: '$[0]' }, b = { address: '$[1]' };
  const root = { address: '$', children: [a, b] };
  const reads = [];
  const closed = [];
  const result = resolveAddress('$.*.*', { root, children(binding) {
    if (binding === root) return root.children;
    return (function* () {
      try {
        for (let i = 0; i < 4; i++) { reads.push(binding.address); yield { address: `${binding.address}[${i}]` }; }
      } finally { closed.push(binding.address); }
    })();
  } }, { maxBindings: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].selectorIndex, 1);
  assert.equal(result.errors[0].observed, 3);
  assert.deepEqual(reads, ['$[0]', '$[0]', '$[0]']);
  assert.deepEqual(closed, ['$[0]']);
});

test('recursive early rejection closes every active iterator even if an inner closer throws', () => {
  const root = { address: '$' }, a = { address: '$.a' };
  const closed = [];
  const failure = new Error('inner close');
  assert.throws(() => resolveAddress('$.**', { root, children(binding) {
    if (binding !== root && binding !== a) return [];
    return (function* () {
      try {
        if (binding === root) { yield a; yield { address: '$.b' }; }
        else { yield { address: '$.a[0]' }; yield { address: '$.a[1]' }; }
      } finally { closed.push(binding.address); if (binding === a) throw failure; }
    })();
  } }, { maxBindings: 2 }), error => error === failure);
  assert.deepEqual(closed, ['$.a', '$']);
});

test('recursive tiny allowance does not descend through the unselected deep tail', () => {
  let acquired = 0;
  const result = resolveAddress('$.**', { root: { depth: 0 }, children(binding) {
    acquired++;
    return binding.depth < 2048 ? [{ depth: binding.depth + 1 }] : [];
  } }, { maxBindings: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].observed, 2);
  assert.equal(acquired, 2);
});

test('Query forwards the Resolve expansion allowance and discards all results', () => {
  const root = { address: '$' };
  let yielded = 0;
  let closed = 0;
  const result = evaluateQuery('from $.*\nselect .', { root, children() {
    return (function* () {
      try { for (let i = 0; i < 96; i++) { yielded++; yield { address: `$[${i}]` }; } }
      finally { closed++; }
    })();
  } }, { resolve: { maxBindings: 1 } });
  assert.equal(result.ok, false);
  assert.deepEqual(result.results, []);
  assert.equal(result.errors[0].code, 'SANSA_RESOLVE_BINDING_LIMIT_EXCEEDED');
  assert.equal(yielded, 2);
  assert.equal(closed, 1);
});
