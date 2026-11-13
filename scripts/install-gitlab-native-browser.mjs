import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath, lstat, unlink } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { babelParse, parse as parseSFC } from 'vue/compiler-sfc';
import { prepareGitLabDiagramSandbox } from '../integrations/gitlab/services/diagram_sandbox_patch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const restore = process.argv[3] === '--restore';
if (
  (process.argv.length !== 3 && !(process.argv.length === 4 && restore)) ||
  !isAbsolute(process.argv[2])
)
  throw new Error(
    'Usage: node scripts/install-gitlab-native-browser.mjs /absolute/gitlab-source [--restore]',
  );
const source = await realpath(process.argv[2]);
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
if (
  git('rev-parse', 'HEAD') !== pin.commit ||
  (await realpath(git('rev-parse', '--show-toplevel'))) !== source
)
  throw new Error('Use the exact matching GitLab source root.');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const output = resolve(root, 'artifacts/gitlab-native-browser-install');
await mkdir(output, { recursive: true });
const hostPath = 'app/assets/javascripts/content_editor/components/content_editor.vue';
const preparedHash = 'cdd3091a8a8cddccbd9b48c231edb38197f73a26fd8e35d9932b90d3579d6bad';
const rendererPath = 'app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue';
const rendererHash = '697704a24572acc75d9f4d5b6225f3ad9c32a3b32410fabc09a6743d8aa0fca9';
const babelPath = 'babel.config.js';
const babelHash = 'ff971fbc61f7c207b23f2834d135bc4741e651820ef289f87b6b61ac35350e54';
const sandboxPath = 'app/assets/javascripts/lib/mermaid_sandbox.js';
const sandboxHash = 'c174dee8be4203bea76c88778156ea5c00f976d758915c2627ec65a2f5872ab9';
if ((await lstat(resolve(source, hostPath))).isSymbolicLink())
  throw new Error('Refusing a symlinked ContentEditor.');
const current = await readFile(resolve(source, hostPath), 'utf8');
let previous;
try {
  previous = JSON.parse(await readFile(resolve(output, 'install.json')));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (previous && previous.source !== source)
  throw new Error('The retained install belongs to a different checkout.');
if (previous) {
  const allowed = new Set([
    hostPath,
    rendererPath,
    babelPath,
    'app/assets/javascripts/content_editor/components/fountain_editor_surface.vue',
    'app/assets/javascripts/content_editor/components/fountain_formatting_toolbar.vue',
    'app/assets/javascripts/content_editor/services/fountain_runtime.js',
    'app/assets/javascripts/content_editor/services/fountain_runtime.css',
  ]);
  if ([2, 3, 4, 5, 6, 7].includes(previous.formatVersion)) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_link_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_link_menu.stories.js');
  } else if (previous.formatVersion !== undefined) throw new Error('Unknown retained install format.');
  if ([3, 4, 5, 6, 7].includes(previous.formatVersion)) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_code_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_code_menu.stories.js');
  }
  if ([4, 5, 6, 7].includes(previous.formatVersion)) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_alert_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_alert_menu.stories.js');
  }
  if ([5, 6, 7].includes(previous.formatVersion)) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_media_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_media_menu.stories.js');
  }
  if ([6, 7].includes(previous.formatVersion)) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_reference_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_reference_menu.stories.js');
  }
  if (previous.formatVersion === 7) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_diagram_preview.vue');
    allowed.add(sandboxPath);
  }
  if (Object.keys(previous.files).length !== allowed.size) throw new Error('Incomplete retained install manifest.');
  if (Object.keys(previous.files).some(path => !allowed.has(path))) throw new Error('Unrecognized path in retained install.');
}
if (restore) {
  if (!previous || previous.restored) throw new Error('No active retained install to restore.');
  for (const [path, digest] of Object.entries(previous.files)) {
    const target = resolve(source, path);
    if (
      (await realpath(target)) !== target ||
      (await lstat(target)).isSymbolicLink() ||
      hash(await readFile(target)) !== digest
    )
      throw new Error(`Refusing to restore over changed file ${path}.`);
  }
  const prepared = await readFile(resolve(output, 'prepared-content-editor.vue'));
  if (hash(prepared) !== preparedHash) throw new Error('Retained prepared component has changed.');
  const preparedRenderer = await readFile(resolve(output, 'prepared-markdown-editor.vue'));
  if (hash(preparedRenderer) !== rendererHash)
    throw new Error('Retained prepared renderer has changed.');
  const preparedBabel = await readFile(resolve(output, 'prepared-babel.config.js'));
  if (hash(preparedBabel) !== babelHash)
    throw new Error('Retained Babel configuration has changed.');
  let preparedSandbox;
  if (previous.files[sandboxPath]) {
    preparedSandbox = await readFile(resolve(output, 'prepared-mermaid-sandbox.js'));
    if (hash(preparedSandbox) !== sandboxHash) throw new Error('Retained Mermaid sandbox has changed.');
  }
  await writeFile(resolve(source, hostPath), prepared);
  await writeFile(resolve(source, rendererPath), preparedRenderer);
  await writeFile(resolve(source, babelPath), preparedBabel);
  if (preparedSandbox) await writeFile(resolve(source, sandboxPath), preparedSandbox);
  for (const path of Object.keys(previous.files))
    if (![hostPath, rendererPath, babelPath, sandboxPath].includes(path)) await unlink(resolve(source, path));
  await writeFile(
    resolve(output, 'install.json'),
    JSON.stringify({ ...previous, restored: true }, null, 2) + '\n',
  );
  console.log(
    'Restored the exact prepared GitLab component and removed only verified installer-owned files. Rebuild its frontend before deployment.',
  );
  process.exit(0);
}
let original = current;
if (hash(current) !== preparedHash) {
  if (!previous || previous.files[hostPath] !== hash(current))
    throw new Error('ContentEditor has unrecognized edits; refusing to overwrite it.');
  original = await readFile(resolve(output, 'prepared-content-editor.vue'), 'utf8');
  if (hash(original) !== preparedHash)
    throw new Error('The retained prepared component does not match its expected digest.');
}
const currentRenderer = await readFile(resolve(source, rendererPath), 'utf8');
let originalRenderer = currentRenderer;
if (hash(currentRenderer) !== rendererHash) {
  if (!previous || previous.files[rendererPath] !== hash(currentRenderer))
    throw new Error('MarkdownEditor has unrecognized edits.');
  originalRenderer = await readFile(resolve(output, 'prepared-markdown-editor.vue'), 'utf8');
  if (hash(originalRenderer) !== rendererHash)
    throw new Error('The retained renderer does not match its expected digest.');
}
const script = parseSFC(original).descriptor.script.content;
const currentBabel = await readFile(resolve(source, babelPath), 'utf8');
let originalBabel = currentBabel;
if (hash(currentBabel) !== babelHash) {
  if (!previous || previous.files[babelPath] !== hash(currentBabel))
    throw new Error('Babel configuration has unrecognized edits.');
  originalBabel = await readFile(resolve(output, 'prepared-babel.config.js'), 'utf8');
  if (hash(originalBabel) !== babelHash)
    throw new Error('Retained Babel configuration does not match.');
}
const ast = babelParse(script, { sourceType: 'module' });
const definition = ast.program.body.find(
  (node) => node.type === 'ExportDefaultDeclaration',
).declaration;
const props = definition.properties.find((node) => node.key.name === 'props').value;
const propsSource = script.slice(props.start, props.end);
const runtime = resolve(root, 'artifacts/gitlab-native-runtime');
const manifest = JSON.parse(await readFile(resolve(runtime, 'build.json')));
const bundle = await readFile(resolve(runtime, 'fountain-runtime.mjs'));
if (hash(bundle) !== manifest.sha256)
  throw new Error('Rebuild the native runtime; its digest differs.');
for (const [path, digest] of Object.entries(manifest.inputs)) {
  if (hash(await readFile(resolve(root, path))) !== digest)
    throw new Error(`Rebuild the native runtime after changing ${path}.`);
}
const files = new Map();
const currentSandbox = await readFile(resolve(source, sandboxPath), 'utf8');
let originalSandbox = currentSandbox;
if (hash(currentSandbox) !== sandboxHash) {
  if (!previous || previous.files[sandboxPath] !== hash(currentSandbox)) throw new Error('Mermaid sandbox has unrecognized edits.');
  originalSandbox = await readFile(resolve(output, 'prepared-mermaid-sandbox.js'), 'utf8');
  if (hash(originalSandbox) !== sandboxHash) throw new Error('Retained Mermaid sandbox does not match the pin.');
}
files.set(sandboxPath, prepareGitLabDiagramSandbox(originalSandbox));
if (originalBabel.split('exclude: /node_modules/,').length !== 2)
  throw new Error('Inspect the pinned third-party Babel boundary.');
// The generated library is third-party code, even though installed under app/.
files.set(
  babelPath,
  originalBabel.replace(
    'exclude: /node_modules/,',
    String.raw`exclude: /node_modules|[/\\]content_editor[/\\]services[/\\]fountain_runtime\.js$/,`,
  ),
);
const rendererSignature = 'renderMarkdown(markdown) {';
const rendererFlag = 'no_header_anchors: !this.supportsTableOfContents,';
const rendererRequest = 'return axios\n        .post(url, { text: markdown })';
if (
  ![rendererSignature, rendererFlag, rendererRequest].every(
    (value) => originalRenderer.split(value).length === 2,
  )
)
  throw new Error('Inspect the pinned renderer adapter sites.');
files.set(
  rendererPath,
  originalRenderer
    .replace(
      rendererSignature,
      'renderMarkdown(markdown, { noHeaderAnchors = false, signal } = {}) {',
    )
    .replace(rendererFlag, 'no_header_anchors: noHeaderAnchors || !this.supportsTableOfContents,')
    .replace(
      rendererRequest,
      'const request = signal ? axios.post(url, { text: markdown }, { signal }) : axios.post(url, { text: markdown });\n      return request',
    ),
);
let component = await readFile(
  resolve(root, 'integrations/gitlab/components/fountain_content_editor.vue'),
  'utf8',
);
if (!component.includes('  props: {},'))
  throw new Error('Inspect the native component prop insertion point.');
component = component
  .replace('  props: {},', `  props: ${propsSource},`)
  .replace("from '../runtime/browser'", "from '../services/fountain_runtime'");
files.set(hostPath, component);
for (const name of ['fountain_editor_surface.vue', 'fountain_formatting_toolbar.vue', 'fountain_link_menu.vue', 'fountain_link_menu.stories.js', 'fountain_code_menu.vue', 'fountain_code_menu.stories.js', 'fountain_diagram_preview.vue', 'fountain_alert_menu.vue', 'fountain_alert_menu.stories.js', 'fountain_media_menu.vue', 'fountain_media_menu.stories.js', 'fountain_reference_menu.vue', 'fountain_reference_menu.stories.js']) {
  let value = await readFile(resolve(root, `integrations/gitlab/components/${name}`), 'utf8');
  value = value
    .replace("from 'fountainjs-editor'", "from '../services/fountain_runtime'")
    .replace("from '../runtime/browser'", "from '../services/fountain_runtime'");
  files.set(`app/assets/javascripts/content_editor/components/${name}`, value);
}
files.set('app/assets/javascripts/content_editor/services/fountain_runtime.js', bundle);
// The native renderer's structural CSS is a local build input, never a CDN.
files.set(
  'app/assets/javascripts/content_editor/services/fountain_runtime.css',
  await readFile(resolve(root, 'dist/styles.css')),
);
files.set(
  hostPath,
  `\n${files.get(hostPath)}`.replace(
    '<script>',
    "<script>\nimport '../services/fountain_runtime.css';",
  ),
);
const requireUpstream = createRequire(resolve(source, 'package.json'));
const prettier = requireUpstream('prettier');
const formatOptions = await prettier.resolveConfig(resolve(source, hostPath));
for (const [path, bytes] of files) {
  if (!path.endsWith('.vue') && !path.endsWith('.stories.js') && path !== babelPath) continue;
  files.set(
    path,
    await prettier.format(bytes.toString(), {
      ...formatOptions,
      filepath: resolve(source, path),
      plugins: (formatOptions.plugins ?? []).map((plugin) => requireUpstream.resolve(plugin)),
      tailwindConfig: resolve(source, formatOptions.tailwindConfig),
    }),
  );
}
for (const [path] of files) {
  const target = resolve(source, path);
  const location = relative(source, target);
  if (isAbsolute(location) || location.startsWith('..'))
    throw new Error('Installation escaped the source root.');
  const parent = await realpath(resolve(target, '..'));
  if (parent !== resolve(target, '..'))
    throw new Error('Refusing a symlinked installation parent.');
  if ([hostPath, rendererPath, babelPath, sandboxPath].includes(path)) {
    if ((await realpath(target)) !== target) throw new Error('Refusing a symlinked host input.');
    continue;
  }
  try {
    if ((await lstat(target)).isSymbolicLink()) throw new Error(`Refusing symlink ${path}.`);
    const existing = await readFile(target);
    if (!previous || previous.files[path] !== hash(existing))
      throw new Error(`Unrecognized file at ${path}; refusing to overwrite it.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await writeFile(resolve(output, 'prepared-content-editor.vue'), original);
await writeFile(resolve(output, 'prepared-markdown-editor.vue'), originalRenderer);
await writeFile(resolve(output, 'prepared-babel.config.js'), originalBabel);
await writeFile(resolve(output, 'prepared-mermaid-sandbox.js'), originalSandbox);
for (const [path, bytes] of files) await writeFile(resolve(source, path), bytes);
await writeFile(
  resolve(output, 'install.json'),
  JSON.stringify(
    {
      formatVersion: 7,
      source,
      revision: pin.commit,
      scope:
        'Native browser integration in progress; full toolbar/providers/dialect acceptance remains open',
      nativeRuntime: manifest,
      preparedComponentSHA256: preparedHash,
      files: Object.fromEntries([...files].map(([path, bytes]) => [path, hash(bytes)])),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Installed native browser integration into matching GitLab source (${files.size} files). Build and real-service browser verification are required.`,
);
