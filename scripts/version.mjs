#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const packagePath = path.join(repositoryRoot, 'package.json');
const capabilitiesPath = path.join(repositoryRoot, 'docs', 'capabilities.json');
const changelogPath = path.join(repositoryRoot, 'CHANGELOG.md');
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function fail(message) {
  console.error(`Version validation failed: ${message}`);
  process.exitCode = 1;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function jsonWithReplacedVersion(file, currentVersion, nextVersion) {
  const source = await readFile(file, 'utf8');
  const current = JSON.stringify(currentVersion);
  const matches = source.match(
    new RegExp(`^  "version"\\s*:\\s*${escapeRegExp(current)}`, 'gm'),
  ) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `${path.relative(repositoryRoot, file)} must contain exactly one top-level version matching ${current}`,
    );
  }
  return source.replace(
    new RegExp(`^(  "version"\\s*:\\s*)${escapeRegExp(current)}`, 'm'),
    `$1${JSON.stringify(nextVersion)}`,
  );
}

async function checkVersion() {
  const [packageManifest, capabilities, changelog] = await Promise.all([
    readJson(packagePath),
    readJson(capabilitiesPath),
    readFile(changelogPath, 'utf8'),
  ]);

  const version = packageManifest.version;
  let valid = true;

  if (typeof version !== 'string' || !semverPattern.test(version)) {
    fail(`package.json has invalid SemVer version ${JSON.stringify(version)}`);
    valid = false;
  }
  if (capabilities.implementation !== packageManifest.name) {
    fail(
      `docs/capabilities.json implementation ${JSON.stringify(capabilities.implementation)} does not match package name ${JSON.stringify(packageManifest.name)}`,
    );
    valid = false;
  }
  if (capabilities.version !== version) {
    fail(`docs/capabilities.json version ${JSON.stringify(capabilities.version)} does not match package version ${JSON.stringify(version)}`);
    valid = false;
  }
  if (typeof version === 'string') {
    const releaseHeading = new RegExp(
      `^## ${escapeRegExp(version)} - \\d{4}-\\d{2}-\\d{2}$`,
      'm',
    );
    if (!releaseHeading.test(changelog)) {
      fail(`CHANGELOG.md has no dated release heading for ${version}`);
      valid = false;
    }
  }

  if (valid) {
    console.log(`Version consistency passed: ${packageManifest.name}@${version}`);
  }
}

async function setVersion(version) {
  if (!semverPattern.test(version)) {
    throw new Error(
      `Expected a SemVer version without a leading "v", received ${JSON.stringify(version)}`,
    );
  }

  const [packageManifest, capabilities] = await Promise.all([
    readJson(packagePath),
    readJson(capabilitiesPath),
  ]);
  const [packageSource, capabilitiesSource] = await Promise.all([
    jsonWithReplacedVersion(packagePath, packageManifest.version, version),
    jsonWithReplacedVersion(capabilitiesPath, capabilities.version, version),
  ]);
  await Promise.all([
    writeFile(packagePath, packageSource),
    writeFile(capabilitiesPath, capabilitiesSource),
  ]);
  console.log(`Set ${packageManifest.name} release metadata to ${version}.`);
  console.log('Add the dated CHANGELOG.md heading, then run `npm run version:check`.');
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === 'check' && args.length === 0) {
    await checkVersion();
  } else if (command === 'set' && args.length === 1) {
    await setVersion(args[0]);
  } else {
    throw new Error(
      'Usage: node scripts/version.mjs check | node scripts/version.mjs set <version>',
    );
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
