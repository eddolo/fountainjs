import assert from 'node:assert/strict';
import { bundledFountainModules } from './starter-bundle-sources.mjs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const evidence = join(repository, 'artifacts/installed-starters');
const receiptPath = join(evidence, 'projects.json');
const [mode, kind] = process.argv.slice(2);
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const filesIn = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? filesIn(join(directory, entry.name)).map(file => join(entry.name, file)) : [entry.name]);
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
};

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: '' },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`, { cause: result.error });
  }
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout;
}

if (mode === 'prepare') {
  const pnpm = process.env.npm_execpath;
  assert(pnpm && existsSync(pnpm), 'Run through pnpm audit:starters:prepare so the package-manager CLI is explicit.');
  assert(existsSync(join(repository, 'dist/index.js')), 'Build the candidate before preparing installed starters.');
  const manifest = readJSON(join(repository, 'package.json'));
  const root = mkdtempSync(join(tmpdir(), 'fountain-installed-starters-'));
  assert(!inside(realpathSync(repository), realpathSync(root)), 'Starter consumers must be outside the checkout.');
  mkdirSync(evidence, { recursive: true });
  const receipt = { version: manifest.version, root, projects: {}, complete: false };
  const save = () => writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  save();
  // Pack the current candidate, not an old registry release or workspace link.
  run(process.execPath, [pnpm, 'pack', '--pack-destination', root], repository);
  const archive = join(root, `fountainjs-editor-${manifest.version}.tgz`);
  receipt.archive = { path: archive, sha256: sha256(archive) };
  cpSync(archive, join(evidence, 'candidate.tgz'));
  for (const name of ['plain-dom', 'react', 'node', 'templates']) {
    const source = join(repository, 'examples/starters', name);
    const project = join(root, name);
    cpSync(source, project, { recursive: true });
    const projectManifest = readJSON(join(project, 'package.json'));
    assert.equal(projectManifest.dependencies['fountainjs-editor'], manifest.version);
    projectManifest.dependencies['fountainjs-editor'] = `file:${archive.replaceAll('\\', '/')}`;
    writeFileSync(join(project, 'package.json'), JSON.stringify(projectManifest, null, 2) + '\n');
    console.log(`Installing ${name} outside the checkout`);
    writeFileSync(join(project, 'pnpm-workspace.yaml'), "packages:\n  - '.'\n");
    assert.equal(realpathSync(project), realpathSync(join(run(process.execPath, [pnpm, 'root', '-w'], project).trim(), '..')));
    const install = run(process.execPath, [pnpm, '--ignore-workspace', 'install', '--config.auto-install-peers=false'], project);
    writeFileSync(join(evidence, `${name}-install.log`), install);
    const installed = realpathSync(join(project, 'node_modules/fountainjs-editor'));
    assert(inside(realpathSync(project), installed), 'The package must be installed locally, not linked from the checkout.');
    assert.equal(readJSON(join(installed, 'package.json')).version, manifest.version);
    const distribution = filesIn(join(repository, 'dist'));
    for (const file of distribution) assert.equal(sha256(join(installed, 'dist', file)), sha256(join(repository, 'dist', file)), file);
    const files = filesIn(source).filter(file => file !== 'package.json');
    for (const file of files) assert.equal(sha256(join(project, file)), sha256(join(source, file)), file);
    receipt.projects[name] = { path: project, installed, identicalDistributionFiles: distribution.length, unchangedStarterFiles: files };
    if (name !== 'node') {
      const output = run(process.execPath, [pnpm, '--ignore-workspace', 'run', 'build', '--sourcemap', 'hidden'], project);
      receipt.projects[name].bundledFountainModules = bundledFountainModules(join(project, 'dist'), installed);
      writeFileSync(join(evidence, `${name}-build.log`), output);
      assert(existsSync(join(project, 'dist/index.html')));
      if (name === 'templates') writeFileSync(join(evidence,'templates-workflow.log'),
        run(process.execPath,['--test','workflow.test.mjs'],project));
    } else {
      const convert = (...args) => run(process.execPath, ['convert.mjs', ...args], project);
      const sample = readFileSync(join(project, 'sample.md'), 'utf8');
      const json = convert();
      assert.equal(JSON.parse(json).type, 'doc');
      assert.equal(convert('sample.md', 'markdown'), sample);
      const html = convert('sample.md', 'html');
      assert.match(html, /<h1[^>]*>Release notes<\/h1>/);
      writeFileSync(join(project, 'round-trip.html'), html);
      assert.equal(JSON.parse(convert('round-trip.html')).type, 'doc');
      writeFileSync(join(evidence, 'node-conversion.json'), json);
      writeFileSync(join(evidence, 'node-conversion.html'), html);
      // A developer machine may have ancestor-level packages. Block these
      // resolutions explicitly so an ambient React cannot hide a dependency.
      const probe = `import assert from 'node:assert/strict';
        import { createRequire, registerHooks } from 'node:module';
        registerHooks({ resolve(specifier, context, next) {
          if (/^(?:jsdom|react|react-dom|yjs)(?:\\/|$)/.test(specifier)) throw new Error('Optional dependency blocked: ' + specifier);
          return next(specifier, context);
        } });
        const require = createRequire(import.meta.url);
        for (const dependency of ['jsdom', 'react', 'yjs']) assert.throws(() => require.resolve(dependency), /Optional dependency blocked/);
        for (const name of ['window', 'document', 'MutationObserver']) assert.equal(typeof globalThis[name], 'undefined');
        const { Schema, CoreSchemaSpec } = await import('fountainjs-editor');
        assert.equal(new Schema(CoreSchemaSpec).nodeFromJSON(${JSON.stringify(JSON.parse(json))}).type.name, 'doc');
        process.argv = [process.execPath, 'convert.mjs', 'sample.md', 'markdown'];
        await import('./convert.mjs');
        console.log('\\nPure Node consumer: no DOM globals; jsdom, React and Yjs resolutions blocked.');`;
      writeFileSync(join(project, 'probe.mjs'), probe);
      writeFileSync(join(evidence, 'node-probe.log'), run(process.execPath, ['probe.mjs'], project));
      receipt.projects[name].conversion = { json: true, exactUntouchedMarkdown: true, html: true, htmlReimport: true, pureNodeWithOptionalPeersBlocked: true };
    }
    save();
  }
  receipt.complete = true;
  save();
  console.log(`Installed candidate starters prepared; evidence: ${receiptPath}`);
} else if (mode === 'serve' && ['plain-dom', 'react', 'templates'].includes(kind)) {
  const receipt = readJSON(receiptPath);
  assert(receipt.complete, 'Run pnpm audit:starters:prepare before starting the preview servers.');
  const project = receipt.projects[kind].path;
  assert(inside(realpathSync(receipt.root), realpathSync(project)));
  if (kind === 'templates') {
    const { createWorkspace } = await import(pathToFileURL(join(project, 'server.mjs')).href);
    createWorkspace(':memory:', join(project, 'dist')).listen(4203, '127.0.0.1');
  } else {
    const require = createRequire(join(project, 'package.json'));
    const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
    const server = await preview({ root: project, configFile: false, preview: {
      host: '127.0.0.1', port: kind === 'plain-dom' ? 4201 : 4202, strictPort: true, open: false,
    } });
    server.printUrls();
  }
} else {
  throw new Error('Usage: pnpm audit:starters:prepare, or node scripts/installed-starters.mjs serve plain-dom|react|templates');
}
