import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AEONIC_TEMPORAL_CIVIL_DATETIME_DEFAULT_RESOURCE_LIMITS } from '@altopelago/sansa';

test('civil date-time claim pins current entry points and complete frozen capability evidence', () => {
  const claim = JSON.parse(readFileSync('conformance/aeonic-datetime-claims.json', 'utf8')), v = claim.verification;
  assert.deepEqual(claim.claims.map(c => c.capability), ['Aeonic.Operations.Temporal.CivilDateTime.Relations', 'Aeonic.Operations.Temporal.CivilDateTime.Arithmetic']);
  assert.deepEqual(v.test_resource_limits, AEONIC_TEMPORAL_CIVIL_DATETIME_DEFAULT_RESOURCE_LIMITS);
  for (const [path, hash] of Object.entries(v.implementation_files_sha256)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), hash, path);
  for (const [cap, path] of Object.entries(v.reports)) {
    const report = JSON.parse(readFileSync('conformance/' + path, 'utf8'));
    assert.equal(report.status, 'passed'); assert.equal(report.stable_conformance_claim, true); assert.equal(report.semantic_execution, true);
    assert.equal(report.target_status, 'immutable-local'); assert.equal(report.target, claim.claims[0].snapshot_id);
    assert.equal(report.sut_executions, { all: 355, relations: 229, arithmetic: 124 }[cap]);
    assert.equal(report.assertions, { all: 380, relations: 254, arithmetic: 124 }[cap]);
    assert.deepEqual(report.capabilities, cap === 'all' ? ['arithmetic', 'relations'] : [cap]); assert.deepEqual(report.failures, []);
    for (const [key, hash] of Object.entries(v.artifact_sha256)) assert.equal(report[key], hash, key);
    assert.deepEqual(report.helper_hashes, v.helper_sha256);
  }
  const capacity = JSON.parse(readFileSync('conformance/' + v.capacity_report, 'utf8'));
  assert.equal(capacity.status, 'passed'); assert.equal(capacity.checks, 32);
});
