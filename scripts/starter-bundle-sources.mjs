import assert from 'node:assert/strict';
import { globSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

// An installed tarball can match the checkout while the bundler resolves an
// older copy from an ancestor project. Audit the inputs to the served JS.
export function bundledFountainModules(outputDirectory, installedPackage) {
  const modules = new Set();
  const installed = realpathSync(installedPackage);
  for (const file of globSync('**/*.js.map', { cwd: outputDirectory })) {
    const path = resolve(outputDirectory, file);
    const map = JSON.parse(readFileSync(path, 'utf8'));
    for (const source of map.sources) {
      if (!source.replaceAll('\\', '/').includes('/node_modules/fountainjs-editor/')) continue;
      const resolved = realpathSync(resolve(dirname(path), map.sourceRoot ?? '', source));
      const local = relative(installed, resolved);
      assert(local && !local.startsWith('..') && !isAbsolute(local),
        'Browser bundle includes FountainJS from outside the installed candidate: ' + resolved);
      modules.add(local.replaceAll('\\', '/'));
    }
  }
  assert(modules.size, 'No FountainJS modules found in the browser bundle source maps.');
  return [...modules].sort();
}
