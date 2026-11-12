import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const number = (value) => ({ number: { category: 'finiteNumber', value } });
const envelope = () => ({ lane: 'aeonic-arithmetic', case_id: 'binding-test', fixture: {
  request: { operation: 'add', input: { left: number('1'), right: number('2') } },
}, policy: {} });
for (const [name, executable, args] of [
  ['JavaScript', 'node', ['scripts/cts-aeonic-arithmetic-adapter.mjs']],
]) {
  const run = (input) => spawnSync(executable, args, { input: JSON.stringify(input), encoding: 'utf8' });
  test(`${name} arithmetic adapter rejects invalid trusted limit containers`, () => {
    for (const resourceLimits of [null, [], 1, false, { maxCoefficientDigits: true }, { maxCoefDigits: 10 }]) {
      const input = envelope(); input.policy.resourceLimits = resourceLimits;
      const result = run(input);
      assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.match(result.stderr, /harness failure/i);
    }
  });
  test(`${name} arithmetic adapter distinguishes operation limits from harness errors`, () => {
    for (const policy of [{}, { resourceLimits: {} }, { resourceLimits: { maxRequestBytes: 0 } }]) {
      const input = envelope(); input.policy = policy;
      const result = run(input); assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      if (policy.resourceLimits?.maxRequestBytes === 0) {
        assert.equal(output.ok, false); assert.equal(output.result.reason, 'resource_limit');
        assert.ok(!Object.hasOwn(output.result, 'value'));
      } else assert.equal(output.result.value.number.coefficient, '3');
    }
  });
  test(`${name} arithmetic adapter rejects ambiguous fixtures and accepts transport extensions`, () => {
    const bad = envelope(); bad.fixture.requestText = '{}';
    assert.notEqual(run(bad).status, 0);
    const good = envelope(); good.vendorExtension = { format: 1 };
    assert.equal(run(good).status, 0);
  });
  test(`${name} arithmetic adapter validates exact JSON limit tokens`, () => {
    for (const token of ['-1e-400', '1e-400', '9007199254740990.5', '0.99999999999999999999']) {
      const input = envelope(); input.policy.resourceLimits = { maxOutputCharacters: 'RAW_TOKEN' };
      const raw = JSON.stringify(input).replace('"RAW_TOKEN"', token);
      const result = spawnSync(executable, args, { input: raw, encoding: 'utf8' });
      assert.notEqual(result.status, 0, token); assert.equal(result.stdout, '');
      const escaped = raw.replace('resourceLimits', 'resource\\u004cimits').replace('policy', 'pol\\u0069cy');
      assert.notEqual(spawnSync(executable, args, { input: escaped, encoding: 'utf8' }).status, 0, token);
    }
    for (const token of ['100.0', '1e2', '0.001e5', '9007199254740991', '-0.000e999999999999999999999999', '0e-999999999999999999999999']) {
      const input = envelope(); input.policy.resourceLimits = { maxOutputCharacters: 'RAW_TOKEN' };
      const raw = JSON.stringify(input).replace('"RAW_TOKEN"', token);
      assert.equal(spawnSync(executable, args, { input: raw, encoding: 'utf8' }).status, 0, token);
    }
  });
  test(`${name} arithmetic adapter guards deep structured input before serialization`, () => {
    const request = '{"operation":"add","input":{"left":{"number":{"category":"container","payload":' + '['.repeat(2000) + '0' + ']'.repeat(2000) + '}},"right":{}}}';
    const input = '{"lane":"aeonic-arithmetic","case_id":"deep","fixture":{"request":' + request + '},"policy":{}}';
    const result = spawnSync(executable, args, { input, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).result.reason, 'resource_limit');
  });
}
