import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const profile = 'aeonic.operations.arithmetic.rational.v1';
function run(logical, { text = false, limits = {}, escaped = false } = {}) {
  const fixture = text ? JSON.stringify({ requestText: logical }) : '{"request":' + logical + '}';
  let envelope = '{"lane":"aeonic-rational-arithmetic","case_id":"raw-number","fixture":' + fixture
    + ',"policy":{"resourceLimits":' + JSON.stringify(limits) + '}}';
  if (escaped) envelope = envelope.replace('"fixture"', '"fixt\\u0075re"').replace('"request"', '"requ\\u0065st"');
  const child = spawnSync(process.execPath, ['scripts/cts-aeonic-rational-arithmetic-adapter.mjs'], { input: envelope, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout).result;
}
function request(token, deferred = false) {
  return JSON.stringify({ operation: 'add', input: {
    context: { profile }, left: { number: { category: deferred ? 'container' : 'finiteNumber', value: 'TOKEN' } },
    right: { number: { category: 'finiteNumber', value: '0' } },
  } }).replace('"TOKEN"', token);
}

test('structured CTS JSON numbers preserve diagnostics across host overflow and rounding', () => {
  for (const token of ['-0', '1e400', '-1e400', '1e-400', '9'.repeat(400), '1.0000000000000001', '0e999999']) {
    for (const deferred of [false, true]) {
      const logical = request(token, deferred);
      const result = run(logical);
      assert.deepEqual(result, run(logical, { text: true }));
      assert.equal(result.reason, deferred ? 'unsupported_domain' : 'invalid_operand');
      assert.equal(result.context.stage, deferred ? 5 : 4);
    }
  }
  assert.deepEqual(run('1e400'), { outcome: 'diagnostic', reason: 'invalid_operand', context: { stage: 2, path: null } });
  assert.equal(run(request('1e400', true), { escaped: true }).reason, 'unsupported_domain');
  const unsupported = request('1e400').replace(profile, 'unknown-profile');
  assert.equal(run(unsupported).reason, 'unsupported_profile');
});

test('structured CTS logical byte admission counts original JSON numeric tokens', () => {
  for (const token of ['-0', '1e-400', '1.0000000000000001', '[1e400,{"nested":-1e400}]']) {
    const logical = request(token, true);
    const options = { limits: { maxRequestBytes: Buffer.byteLength(logical) - 1 } };
    assert.deepEqual(run(logical, options), { outcome: 'diagnostic', reason: 'resource_limit', context: { stage: 1, path: null } });
    assert.deepEqual(run(logical, { ...options, text: true }), run(logical, options));
    assert.equal(run(logical, { limits: { maxRequestBytes: Buffer.byteLength(logical) } }).reason, 'unsupported_domain');
  }
});
