import { readFileSync } from 'node:fs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const packagePath = argument('--package') ?? new URL('../package.json', import.meta.url);
const changelogPath = argument('--changelog') ?? new URL('../CHANGELOG.md', import.meta.url);
const packageJSON = JSON.parse(readFileSync(packagePath, 'utf8'));
const changelog = readFileSync(changelogPath, 'utf8');

const version = packageJSON.version;
if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
  throw new Error(`package.json has an invalid publishable semantic version: ${String(version)}`);
}

const tag = argument('--tag') ?? (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
if (process.argv.includes('--tag') && !tag) throw new Error('--tag requires a value.');
if (tag && tag !== `v${version}`) {
  throw new Error(`Release tag ${tag} does not match package version ${version}; expected v${version}.`);
}

const heading = new RegExp(`^## ${escapeRegExp(version)}(?:\\s|—|-)`, 'm');
if (!heading.test(changelog)) {
  throw new Error(`CHANGELOG.md has no release heading for ${version}. Move the release notes out of Unreleased before publishing.`);
}

const unreleased = /^## Unreleased\s*([\s\S]*?)(?=^## \d)/m.exec(changelog)?.[1] ?? '';
if (tag && /\S/.test(unreleased.replace(/^### .*$/gm, '').replace(/^\s*[-*]\s*$/gm, ''))) {
  throw new Error('CHANGELOG.md still contains unreleased entries. Move them under the versioned release heading before publishing.');
}

console.log(`Release metadata verified for ${tag ?? `package ${version}`}.`);
