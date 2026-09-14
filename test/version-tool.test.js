import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceToolPath = fileURLToPath(new URL('../scripts/version.mjs', import.meta.url));
const transactionDirectory = '.sansa-version-transaction';

function fixtureSources(version = '1.2.3') {
  return {
    package: [
      '{',
      '  "name": "@altopelago/sansa",',
      `  "version": "${version}",`,
      '  "description": "formatting must survive"',
      '}',
      '',
    ].join('\n'),
    capabilities: [
      '{',
      '  "implementation": "@altopelago/sansa",',
      `  "version": "${version}",`,
      '  "entryPoints": ["one", "two"]',
      '}',
      '',
    ].join('\n'),
    changelog: `# Changelog\n\n## ${version} - 2026-09-14\n`,
  };
}

function createFixture(t, version = '1.2.3') {
  const root = mkdtempSync(join(tmpdir(), 'sansa-version-tool-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'docs'));
  copyFileSync(sourceToolPath, join(root, 'scripts', 'version.mjs'));
  const sources = fixtureSources(version);
  writeFileSync(join(root, 'package.json'), sources.package);
  writeFileSync(join(root, 'docs', 'capabilities.json'), sources.capabilities);
  writeFileSync(join(root, 'CHANGELOG.md'), sources.changelog);
  return { root, sources };
}

function runVersion(root, args) {
  return spawnSync(process.execPath, [join(root, 'scripts', 'version.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function readFixture(root) {
  return {
    package: readFileSync(join(root, 'package.json'), 'utf8'),
    capabilities: readFileSync(join(root, 'docs', 'capabilities.json'), 'utf8'),
  };
}

function createTransaction(root, state, originals) {
  const transaction = join(root, transactionDirectory);
  mkdirSync(transaction);
  writeFileSync(
    join(transaction, 'journal.json'),
    `${JSON.stringify({ schemaVersion: 1, state })}\n`,
  );
  writeFileSync(join(transaction, 'package.backup'), originals.package);
  writeFileSync(join(transaction, 'capabilities.backup'), originals.capabilities);
  return transaction;
}

test('version check accepts consistent isolated release metadata', (t) => {
  const { root } = createFixture(t);
  const result = runVersion(root, ['check']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /Version consistency passed: @altopelago\/sansa@1\.2\.3/);
});

test('version check reports metadata mismatches and missing changelog headings', (t) => {
  const { root } = createFixture(t);
  writeFileSync(
    join(root, 'docs', 'capabilities.json'),
    fixtureSources('1.2.4').capabilities,
  );
  writeFileSync(join(root, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n');
  const result = runVersion(root, ['check']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match package version "1\.2\.3"/);
  assert.match(result.stderr, /exactly one dated release heading for 1\.2\.3/);
});

test('version check rejects malformed JSON without a stack trace', (t) => {
  const { root } = createFixture(t);
  writeFileSync(join(root, 'package.json'), '{');
  const result = runVersion(root, ['check']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Version validation failed: package\.json is not valid JSON:/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test('version check rejects duplicate top-level version fields', (t) => {
  const { root, sources } = createFixture(t);
  writeFileSync(
    join(root, 'package.json'),
    sources.package.replace(
      '  "version": "1.2.3",',
      '  "version": "1.2.3",\n  "version": "1.2.3",',
    ),
  );
  const result = runVersion(root, ['check']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /exactly one top-level version/);
});

test('version check refuses symbolic-link metadata targets', {
  skip: process.platform === 'win32',
}, (t) => {
  const { root } = createFixture(t);
  const packagePath = join(root, 'package.json');
  const realPackagePath = join(root, 'package.real.json');
  renameSync(packagePath, realPackagePath);
  symlinkSync('package.real.json', packagePath);
  const result = runVersion(root, ['check']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not be a symbolic link/);
});

test('version set updates both files while preserving surrounding formatting', (t) => {
  const { root, sources } = createFixture(t);
  const result = runVersion(root, ['set', '1.3.0']);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(readFixture(root), {
    package: sources.package.replace('"1.2.3"', '"1.3.0"'),
    capabilities: sources.capabilities.replace('"1.2.3"', '"1.3.0"'),
  });
  assert.equal(existsSync(join(root, transactionDirectory)), false);
});

test('version set rejects invalid input without changing either file', (t) => {
  const { root, sources } = createFixture(t);
  const result = runVersion(root, ['set', 'v1.3.0']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /without a leading "v"/);
  assert.deepEqual(readFixture(root), {
    package: sources.package,
    capabilities: sources.capabilities,
  });
});

test('version set rejects downgrades and equal-precedence build changes', (t) => {
  const { root, sources } = createFixture(t);

  for (const version of ['1.2.2', '1.2.3+replacement']) {
    const result = runVersion(root, ['set', version]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must have higher SemVer precedence/);
    assert.deepEqual(readFixture(root), {
      package: sources.package,
      capabilities: sources.capabilities,
    });
  }
});

test('version commands fail closed while a transaction is pending', (t) => {
  const { root } = createFixture(t);
  const transaction = join(root, transactionDirectory);
  mkdirSync(transaction);
  writeFileSync(
    join(transaction, 'journal.json'),
    `${JSON.stringify({ schemaVersion: 1, state: 'staging' })}\n`,
  );

  for (const args of [['check'], ['set', '1.3.0']]) {
    const result = runVersion(root, args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /npm run version:recover/);
  }
});

test('version recovery rolls a prepared partial update back as a pair', (t) => {
  const { root, sources } = createFixture(t);
  createTransaction(root, 'prepared', sources);
  writeFileSync(
    join(root, 'package.json'),
    sources.package.replace('"1.2.3"', '"1.3.0"'),
  );
  const result = runVersion(root, ['recover']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /restored the pre-transaction version files/);
  assert.deepEqual(readFixture(root), {
    package: sources.package,
    capabilities: sources.capabilities,
  });
  assert.equal(existsSync(join(root, transactionDirectory)), false);
});

test('version recovery keeps a committed pair and removes backups', (t) => {
  const { root, sources } = createFixture(t);
  const updated = {
    package: sources.package.replace('"1.2.3"', '"1.3.0"'),
    capabilities: sources.capabilities.replace('"1.2.3"', '"1.3.0"'),
  };
  writeFileSync(join(root, 'package.json'), updated.package);
  writeFileSync(join(root, 'docs', 'capabilities.json'), updated.capabilities);
  createTransaction(root, 'committed', sources);
  const result = runVersion(root, ['recover']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /kept the committed version files/);
  assert.deepEqual(readFixture(root), updated);
  assert.equal(existsSync(join(root, transactionDirectory)), false);
});

test('version recovery is harmless when no transaction exists', (t) => {
  const { root, sources } = createFixture(t);
  const result = runVersion(root, ['recover']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No interrupted version transaction was found/);
  assert.deepEqual(readFixture(root), {
    package: sources.package,
    capabilities: sources.capabilities,
  });
});

test('version recovery removes known staging artifacts without a journal', (t) => {
  const { root, sources } = createFixture(t);
  const transaction = join(root, transactionDirectory);
  mkdirSync(transaction);
  writeFileSync(join(transaction, 'package.next'), 'staged but not committed');
  const result = runVersion(root, ['recover']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /restored the pre-transaction version files/);
  assert.deepEqual(readFixture(root), {
    package: sources.package,
    capabilities: sources.capabilities,
  });
  assert.equal(existsSync(transaction), false);
});

test('version recovery preserves unknown artifacts for manual inspection', (t) => {
  const { root } = createFixture(t);
  const transaction = join(root, transactionDirectory);
  mkdirSync(transaction);
  writeFileSync(join(transaction, 'unexpected'), 'do not delete');
  const result = runVersion(root, ['recover']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown recovery artifacts are present/);
  assert.equal(readFileSync(join(transaction, 'unexpected'), 'utf8'), 'do not delete');
});

test('version recovery preserves an unreadable journal for manual inspection', (t) => {
  const { root } = createFixture(t);
  const transaction = join(root, transactionDirectory);
  mkdirSync(transaction);
  writeFileSync(join(transaction, 'journal.json'), '{');
  const result = runVersion(root, ['recover']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Recovery journal is unreadable/);
  assert.equal(readFileSync(join(transaction, 'journal.json'), 'utf8'), '{');
});

test('version set automatically rolls back a mid-commit write failure', {
  skip: process.platform === 'win32',
}, (t) => {
  const { root, sources } = createFixture(t);
  const docs = join(root, 'docs');
  chmodSync(docs, 0o555);
  let result;
  try {
    result = runVersion(root, ['set', '1.3.0']);
  } finally {
    chmodSync(docs, 0o755);
  }

  assert.equal(result.status, 1);
  assert.match(result.stderr, /original version files were restored/);
  assert.deepEqual(readFixture(root), {
    package: sources.package,
    capabilities: sources.capabilities,
  });
  assert.equal(existsSync(join(root, transactionDirectory)), false);
});
