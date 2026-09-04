#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, parse, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageJSON = JSON.parse(await readFile(
  fileURLToPath(new URL('../package.json', import.meta.url)),
  'utf8',
));

const usage = `Create a tested, framework-neutral FountainJS extension.

Usage:
  fountainjs-editor create-extension <directory> [options]
  fountainjs-editor doctor <extensions-module>

Options:
  --name <name>       Runtime extension name (defaults to directory name)
  --package <name>    npm package name (defaults to directory name)
  --dry-run           Print the files without writing them
  --help              Show this help
`;

function fail(message) {
  console.error(`FountainJS extension scaffold: ${message}\n\n${usage}`);
  process.exitCode = 1;
}

function readArguments(argv) {
  const values = [...argv];
  if (values[0] === 'create-extension') values.shift();
  const parsed = { directory: '', extensionName: '', packageName: '', dryRun: false, help: false };
  while (values.length) {
    const value = values.shift();
    if (value === '--help' || value === '-h') parsed.help = true;
    else if (value === '--dry-run') parsed.dryRun = true;
    else if (value === '--name' || value === '--package') {
      const option = values.shift();
      if (!option || option.startsWith('-')) throw new Error(`${value} requires a value.`);
      if (value === '--name') parsed.extensionName = option;
      else parsed.packageName = option;
    } else if (value?.startsWith('-')) throw new Error(`Unknown option: ${value}`);
    else if (!parsed.directory) parsed.directory = value ?? '';
    else throw new Error(`Unexpected argument: ${value}`);
  }
  return parsed;
}

function runtimeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/g, '');
}

function className(value) {
  const parts = value.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const name = parts.map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`).join('');
  return /^\d/.test(name) ? `Extension${name}` : name || 'Custom';
}

function filesFor(extensionName, npmName) {
  const symbol = `${className(extensionName)}Extension`;
  const nodeName = extensionName.replace(/[-.:]/g, '_');
  return new Map([
    ['package.json', `${JSON.stringify({
      name: npmName,
      version: '0.1.0',
      description: `A FountainJS extension for ${extensionName}.`,
      license: 'MIT',
      type: 'module',
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
      files: ['dist', 'README.md', 'LICENSE'],
      scripts: { build: 'tsc -p tsconfig.json', test: 'vitest run', doctor: 'fountainjs-editor doctor ./fountain.extensions.mjs', check: 'tsc -p tsconfig.json && vitest run && fountainjs-editor doctor ./fountain.extensions.mjs' },
      peerDependencies: { 'fountainjs-editor': `^${packageJSON.version}` },
      devDependencies: { 'fountainjs-editor': `^${packageJSON.version}`, typescript: '^7.0.0', vitest: '^5.0.0' },
    }, null, 2)}\n`],
    ['tsconfig.json', `${JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
        declaration: true, outDir: 'dist', rootDir: 'src', skipLibCheck: true,
      },
      include: ['src'],
    }, null, 2)}\n`],
    ['src/index.ts', `import {
  FOUNTAIN_EXTENSION_API_VERSION,
  defineExtension,
  insertBlock,
} from 'fountainjs-editor';

/** A complete example node and command. Rename them to match your feature. */
export const ${symbol} = defineExtension({
  name: '${extensionName}',
  manifest: {
    version: '0.1.0',
    apiVersion: FOUNTAIN_EXTENSION_API_VERSION,
    displayName: '${className(extensionName)}',
    description: 'Replace this with one clear sentence about the capability.',
    license: 'MIT',
    requires: ['fountain-core'],
  },
  nodes: {
    ${nodeName}: {
      group: 'block',
      content: 'inline*',
      attrs: { tone: { default: 'note' } },
      toDOM: (node) => ['aside', { 'data-${extensionName}': '', 'data-tone': node.attrs.tone }, 0],
    },
  },
  commands: {
    insert${className(extensionName)}: (editor, text = '') => insertBlock(editor, '${nodeName}', {}, text),
  },
});
`],
    ['test/extension.test.ts', `import { describe, expect, it } from 'vitest';
import { assertExtensionConformance } from 'fountainjs-editor/testing';
import { ${symbol} } from '../src/index.js';

describe('${extensionName}', () => {
  it('passes the FountainJS extension contract', () => {
    const document = {
      type: 'doc',
      content: [{ type: '${nodeName}', content: [{ type: 'text', text: 'Hello' }] }],
    } as const;
    const report = assertExtensionConformance(${symbol}, {
      documents: [{ name: '${nodeName}', document }],
      commands: [{
        name: 'insert${className(extensionName)}',
        args: ['Another block'],
        document,
        expectAccepted: true,
        expectDocumentChange: true,
      }],
    });
    expect(report.passed).toBe(true);
  });
});
`],
    ['fountain.extensions.mjs', `import { ${symbol} } from './dist/index.js';

/** Ordered third-party extensions inspected before an editor is created. */
export default [${symbol}];
`],
    ['README.md', `# ${npmName}

A framework-neutral extension for [FountainJS](https://github.com/eddolo/fountainjs).

## Develop

\`\`\`sh
npm install
npm run check
\`\`\`

The generated test validates metadata, dependency ordering, schema round-trips,
command dry-runs, real command execution, and editor cleanup. Keep fixtures for
every custom node shape and command as the extension grows.
`],
    ['LICENSE', `MIT License

Copyright (c) ${new Date().getUTCFullYear()}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`],
  ]);
}

async function runDoctor(moduleArgument) {
  if (!moduleArgument || moduleArgument.startsWith('-')) {
    fail('doctor requires a module exporting an ordered extension array.');
    return;
  }
  const modulePath = resolve(moduleArgument);
  let loaded;
  try { loaded = await import(pathToFileURL(modulePath).href); }
  catch (error) {
    fail(`Could not load ${modulePath}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const extensions = loaded.default ?? loaded.extensions;
  if (!Array.isArray(extensions)) {
    fail('The doctor module must default-export an ordered extension array.');
    return;
  }
  let testing;
  try { testing = await import('../dist/testing.js'); }
  catch {
    fail('The testing entry is unavailable. Run the FountainJS build or reinstall the package.');
    return;
  }
  const report = testing.checkExtensionCompatibility(extensions);
  console.log(`FountainJS doctor inspected ${report.extensionNames.length} extensions.`);
  report.issues.forEach((issue) => console.log(`${issue.severity.toUpperCase()} [${issue.code}] ${issue.message}`));
  if (!report.passed) process.exitCode = 1;
  else console.log('PASS No extension metadata, dependency, name, or contribution conflicts found.');
}

const rawArguments = process.argv.slice(2);
if (rawArguments[0] === 'doctor') {
  if (rawArguments[1] === '--help' || rawArguments[1] === '-h') console.log(usage);
  else if (rawArguments.length > 2) fail(`Unexpected argument: ${rawArguments[2]}`);
  else await runDoctor(rawArguments[1]);
} else {
  let options;
  try { options = readArguments(rawArguments); }
  catch (error) { fail(error instanceof Error ? error.message : String(error)); }

  if (options?.help) {
    console.log(usage);
  } else if (options) {
  if (!options.directory) fail('A target directory is required.');
  else {
    const target = resolve(options.directory);
    const root = parse(target).root;
    const defaultName = runtimeName(basename(target));
    const extensionName = options.extensionName || defaultName;
    const npmName = options.packageName || basename(target).toLowerCase();
    if (target === root || target === process.cwd()) fail('Choose a new child directory, not a filesystem or project root.');
    else if (!/^[a-z][a-z0-9._:-]{0,127}$/.test(extensionName)) fail('The runtime name must start with a lowercase letter and use lowercase letters, numbers, dot, colon, underscore, or hyphen.');
    else if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(npmName)) fail('The npm package name is invalid.');
    else {
      const files = filesFor(extensionName, npmName);
      if (options.dryRun) {
        console.log(`Would create ${target}:\n${[...files.keys()].map((file) => `- ${file}`).join('\n')}`);
      } else {
        let entries = [];
        try { entries = await readdir(target); }
        catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
        }
        if (entries.length) fail(`Refusing to overwrite non-empty directory: ${target}`);
        else {
          await mkdir(target, { recursive: true });
          for (const [file, content] of files) {
            const destination = resolve(target, file);
            await mkdir(resolve(destination, '..'), { recursive: true });
            await writeFile(destination, content, { encoding: 'utf8', flag: 'wx' });
          }
          console.log(`Created ${extensionName} in ${target}.\nNext: cd ${options.directory} && npm install && npm run check`);
        }
      }
    }
  }
  }
}
