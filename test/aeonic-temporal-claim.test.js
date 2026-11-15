import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AEONIC_TEMPORAL_CIVIL_DATE_DEFAULT_RESOURCE_LIMITS } from '../src/index.js';

test('civil-date claims retain actual frozen evidence for both complete independent capabilities', () => {
  const claim = JSON.parse(readFileSync('conformance/aeonic-temporal-claims.json', 'utf8'));
  assert.deepEqual(claim.claims.map(c => c.capability), ['Aeonic.Operations.Temporal.CivilDate.Relations', 'Aeonic.Operations.Temporal.CivilDate.Calendar']);
  const verification = claim.verification;
  assert.deepEqual(verification.test_resource_limits, AEONIC_TEMPORAL_CIVIL_DATE_DEFAULT_RESOURCE_LIMITS);
  for (const [file, hash] of Object.entries(verification.implementation_files_sha256)) assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), hash, file);
  for (const [choice, path] of Object.entries(verification.reports)) {
    const report = JSON.parse(readFileSync('conformance/' + path, 'utf8'));
    assert.equal(report.status, 'passed'); assert.equal(report.stable_conformance_claim, true); assert.equal(report.semantic_execution, true);
    assert.equal(report.target_status, 'immutable-local'); assert.equal(report.target, claim.claims[0].snapshot_id);
    assert.equal(report.sut_executions, { all: 296, relations: 171, calendar: 125 }[choice]);
    assert.equal(report.assertions, { all: 310, relations: 185, calendar: 125 }[choice]);
    assert.deepEqual(report.capabilities, choice === 'all' ? ['calendar', 'relations'] : [choice]);
    assert.deepEqual(report.failures, []);
    for (const [key, hash] of Object.entries(verification.artifact_sha256)) assert.equal(report[key], hash, key);
    assert.deepEqual(report.helper_hashes, verification.helper_sha256);
  }
  const capacity = JSON.parse(readFileSync('conformance/' + verification.capacity_report, 'utf8'));
  assert.equal(capacity.status, 'passed'); assert.equal(capacity.checks, 18);
});
