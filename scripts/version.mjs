#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const expectedPackageName = '@altopelago/sansa';
const packagePath = path.join(repositoryRoot, 'package.json');
const capabilitiesPath = path.join(repositoryRoot, 'docs', 'capabilities.json');
const changelogPath = path.join(repositoryRoot, 'CHANGELOG.md');
const transactionPath = path.join(repositoryRoot, '.sansa-version-transaction');
const journalPath = path.join(transactionPath, 'journal.json');
const journalNextPath = path.join(transactionPath, 'journal.next');
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const transactionStates = new Set(['staging', 'prepared', 'committed']);

const transactionTargets = [
  {
    label: 'package.json',
    path: packagePath,
    next: path.join(transactionPath, 'package.next'),
    backup: path.join(transactionPath, 'package.backup'),
    restore: path.join(transactionPath, 'package.restore'),
  },
  {
    label: 'docs/capabilities.json',
    path: capabilitiesPath,
    next: path.join(transactionPath, 'capabilities.next'),
    backup: path.join(transactionPath, 'capabilities.backup'),
    restore: path.join(transactionPath, 'capabilities.restore'),
  },
];

function fail(message) {
  console.error(`Version validation failed: ${message}`);
  process.exitCode = 1;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function semverParts(version) {
  const withoutBuild = version.split('+', 1)[0];
  const separator = withoutBuild.indexOf('-');
  const core = (separator === -1 ? withoutBuild : withoutBuild.slice(0, separator))
    .split('.')
    .map((part) => BigInt(part));
  const prerelease = separator === -1
    ? null
    : withoutBuild.slice(separator + 1).split('.');
  return { core, prerelease };
}

function compareSemver(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] < b.core[index]) return -1;
    if (a.core[index] > b.core[index]) return 1;
  }
  if (a.prerelease === null && b.prerelease === null) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return BigInt(leftPart) < BigInt(rightPart) ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

async function exists(file) {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function unlinkIfPresent(file) {
  try {
    await unlink(file);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function assertRegularFile(file, label) {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file and must not be a symbolic link`);
  }
  return metadata;
}

async function assertTransactionDirectory() {
  const metadata = await lstat(transactionPath);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(
      `${path.relative(repositoryRoot, transactionPath)} must be a directory and must not be a symbolic link`,
    );
  }
}

async function assertKnownTransactionArtifacts() {
  const knownArtifacts = new Set([
    path.basename(journalPath),
    path.basename(journalNextPath),
    ...transactionTargets.flatMap((target) => [
      path.basename(target.next),
      path.basename(target.backup),
      path.basename(target.restore),
    ]),
  ]);
  const unknown = (await readdir(transactionPath))
    .filter((artifact) => !knownArtifacts.has(artifact));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown recovery artifacts are present (${unknown.join(', ')}); preserve ${path.relative(repositoryRoot, transactionPath)} for manual inspection`,
    );
  }
}

async function readJson(file, label) {
  await assertRegularFile(file, label);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${errorMessage(error)}`);
  }
}

async function writeDurableNew(file, source, mode) {
  const handle = await open(file, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, mode);
  try {
    await handle.writeFile(source);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncFile(file) {
  const handle = await open(file, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeJournal(state) {
  await unlinkIfPresent(journalNextPath);
  await writeDurableNew(
    journalNextPath,
    `${JSON.stringify({ schemaVersion: 1, state })}\n`,
    0o600,
  );
  await rename(journalNextPath, journalPath);
}

async function readJournal() {
  if (!await exists(journalPath)) return null;
  let journal;
  try {
    await assertRegularFile(journalPath, 'Version recovery journal');
    journal = JSON.parse(await readFile(journalPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Recovery journal is unreadable; preserve ${path.relative(repositoryRoot, transactionPath)} for manual inspection: ${errorMessage(error)}`,
    );
  }
  if (journal?.schemaVersion !== 1 || !transactionStates.has(journal.state)) {
    throw new Error(
      `Recovery journal has an unsupported shape; preserve ${path.relative(repositoryRoot, transactionPath)} for manual inspection`,
    );
  }
  return journal;
}

async function cleanupTransaction() {
  for (const target of transactionTargets) {
    await unlinkIfPresent(target.next);
    await unlinkIfPresent(target.restore);
    await unlinkIfPresent(target.backup);
  }
  await unlinkIfPresent(journalNextPath);
  await unlinkIfPresent(journalPath);
  try {
    await rmdir(transactionPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function restorePreparedTransaction() {
  for (const target of transactionTargets) {
    if (!await exists(target.backup)) {
      throw new Error(`Recovery backup is missing for ${target.label}`);
    }
    await assertRegularFile(target.backup, `Recovery backup for ${target.label}`);
    const backup = await readFile(target.backup);
    const current = await readFile(target.path).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (current !== null && current.equals(backup)) continue;
    await unlinkIfPresent(target.restore);
    const metadata = await lstat(target.backup);
    await writeDurableNew(target.restore, backup, metadata.mode);
    await rename(target.restore, target.path);
  }
}

async function recoverVersionTransaction() {
  if (!await exists(transactionPath)) return null;
  await assertTransactionDirectory();
  await assertKnownTransactionArtifacts();

  const journal = await readJournal();
  if (journal === null) {
    const artifacts = await readdir(transactionPath);
    await cleanupTransaction();
    return artifacts.length === 0 ? 'empty' : 'staging';
  }

  if (journal.state === 'prepared') {
    await restorePreparedTransaction();
  }
  if (journal.state === 'committed') {
    for (const target of transactionTargets) {
      await assertRegularFile(target.path, target.label);
    }
  }
  await cleanupTransaction();
  return journal.state;
}

async function assertNoPendingTransaction() {
  if (await exists(transactionPath)) {
    throw new Error(
      'An interrupted version transaction is present; ensure no other version command is running, then run `npm run version:recover`',
    );
  }
}

async function jsonWithReplacedVersion(file, label, currentVersion, nextVersion) {
  const source = await readFile(file, 'utf8');
  const current = JSON.stringify(currentVersion);
  const matches = source.match(
    new RegExp(`^  "version"\\s*:\\s*${escapeRegExp(current)}`, 'gm'),
  ) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `${label} must contain exactly one top-level version matching ${current}`,
    );
  }
  return source.replace(
    new RegExp(`^(  "version"\\s*:\\s*)${escapeRegExp(current)}`, 'm'),
    `$1${JSON.stringify(nextVersion)}`,
  );
}

function releaseHeadingProblem(changelog, version) {
  const releaseHeading = new RegExp(
    `^## ${escapeRegExp(version)} - \\d{4}-\\d{2}-\\d{2}$`,
    'gm',
  );
  const matches = changelog.match(releaseHeading) ?? [];
  return matches.length === 1
    ? null
    : `CHANGELOG.md must have exactly one dated release heading for ${version}`;
}

function metadataProblems(packageManifest, capabilities, changelog = null) {
  const problems = [];
  const version = packageManifest.version;
  if (packageManifest.name !== expectedPackageName) {
    problems.push(`package.json name must be ${JSON.stringify(expectedPackageName)}`);
  }
  if (typeof version !== 'string' || !semverPattern.test(version)) {
    problems.push(`package.json has invalid SemVer version ${JSON.stringify(version)}`);
  }
  if (capabilities.implementation !== expectedPackageName) {
    problems.push(
      `docs/capabilities.json implementation must be ${JSON.stringify(expectedPackageName)}`,
    );
  }
  if (capabilities.version !== version) {
    problems.push(
      `docs/capabilities.json version ${JSON.stringify(capabilities.version)} does not match package version ${JSON.stringify(version)}`,
    );
  }
  if (changelog !== null && typeof version === 'string') {
    const problem = releaseHeadingProblem(changelog, version);
    if (problem !== null) problems.push(problem);
  }
  return problems;
}

async function loadMetadata({ includeChangelog }) {
  const [packageManifest, capabilities, changelog] = await Promise.all([
    readJson(packagePath, 'package.json'),
    readJson(capabilitiesPath, 'docs/capabilities.json'),
    includeChangelog
      ? assertRegularFile(changelogPath, 'CHANGELOG.md').then(() => readFile(changelogPath, 'utf8'))
      : Promise.resolve(null),
  ]);
  return { packageManifest, capabilities, changelog };
}

async function checkVersion() {
  await assertNoPendingTransaction();
  const metadata = await loadMetadata({ includeChangelog: true });
  const problems = metadataProblems(
    metadata.packageManifest,
    metadata.capabilities,
    metadata.changelog,
  );
  await Promise.all([
    jsonWithReplacedVersion(
      packagePath,
      'package.json',
      metadata.packageManifest.version,
      metadata.packageManifest.version,
    ),
    jsonWithReplacedVersion(
      capabilitiesPath,
      'docs/capabilities.json',
      metadata.capabilities.version,
      metadata.capabilities.version,
    ),
  ]).catch((error) => problems.push(errorMessage(error)));
  if (problems.length > 0) throw new Error(problems.join('; '));
  console.log(
    `Version consistency passed: ${metadata.packageManifest.name}@${metadata.packageManifest.version}`,
  );
}

async function writeVersionTransaction(updates) {
  try {
    await mkdir(transactionPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(
        'A version transaction is already present; ensure no other version command is running, then run `npm run version:recover`',
      );
    }
    throw error;
  }

  try {
    await writeJournal('staging');
    for (const [index, target] of transactionTargets.entries()) {
      const metadata = await assertRegularFile(target.path, target.label);
      await writeDurableNew(target.next, updates[index], metadata.mode);
      await copyFile(target.path, target.backup, fsConstants.COPYFILE_EXCL);
      await syncFile(target.backup);
    }
    await writeJournal('prepared');
    for (const target of transactionTargets) {
      await rename(target.next, target.path);
    }
    await writeJournal('committed');
    await cleanupTransaction();
  } catch (error) {
    let recoveredState;
    try {
      recoveredState = await recoverVersionTransaction();
    } catch (recoveryError) {
      throw new Error(
        `${errorMessage(error)}; automatic recovery failed: ${errorMessage(recoveryError)}`,
      );
    }
    if (recoveredState === 'committed') return;
    throw new Error(`${errorMessage(error)}; original version files were restored`);
  }
}

async function setVersion(version) {
  if (!semverPattern.test(version)) {
    throw new Error(
      `Expected a SemVer version without a leading "v", received ${JSON.stringify(version)}`,
    );
  }
  await assertNoPendingTransaction();
  const metadata = await loadMetadata({ includeChangelog: true });
  const problems = metadataProblems(
    metadata.packageManifest,
    metadata.capabilities,
    metadata.changelog,
  );
  if (problems.length > 0) {
    throw new Error(`Refusing to update inconsistent release metadata: ${problems.join('; ')}`);
  }
  if (metadata.packageManifest.version === version) {
    console.log(`${expectedPackageName} release metadata is already ${version}.`);
    return;
  }
  if (compareSemver(version, metadata.packageManifest.version) <= 0) {
    throw new Error(
      `New version ${version} must have higher SemVer precedence than current version ${metadata.packageManifest.version}`,
    );
  }

  const updates = await Promise.all([
    jsonWithReplacedVersion(
      packagePath,
      'package.json',
      metadata.packageManifest.version,
      version,
    ),
    jsonWithReplacedVersion(
      capabilitiesPath,
      'docs/capabilities.json',
      metadata.capabilities.version,
      version,
    ),
  ]);
  await writeVersionTransaction(updates);
  console.log(`Set ${expectedPackageName} release metadata to ${version}.`);
  console.log('Add the dated CHANGELOG.md heading, then run `npm run version:check`.');
}

async function recoverVersion() {
  const state = await recoverVersionTransaction();
  if (state === null) {
    console.log('No interrupted version transaction was found.');
    return;
  }
  const outcome = state === 'committed'
    ? 'kept the committed version files'
    : 'restored the pre-transaction version files';
  console.log(`Recovered version transaction (${state}); ${outcome}.`);
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === 'check' && args.length === 0) {
    await checkVersion();
  } else if (command === 'set' && args.length === 1) {
    await setVersion(args[0]);
  } else if (command === 'recover' && args.length === 0) {
    await recoverVersion();
  } else {
    throw new Error(
      'Usage: node scripts/version.mjs check | set <version> | recover',
    );
  }
} catch (error) {
  fail(errorMessage(error));
}
