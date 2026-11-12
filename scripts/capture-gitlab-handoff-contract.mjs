import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { babelParse } from 'vue/compiler-sfc';

const { parseComponent, compileTemplate } = createRequire(
  new URL('../tools/gitlab-bridge/package.json', import.meta.url),
)('vue/compiler-sfc');

const root = new URL('../', import.meta.url);
const checkout = process.argv[2];
if (!checkout) throw new Error('Pass the pinned GitLab checkout path.');
const pin = JSON.parse(await readFile(new URL('integrations/gitlab/upstream.json', root), 'utf8'));
const git = (args) =>
  execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', maxBuffer: 1_048_576 });
if (git(['rev-parse', 'HEAD']).trim() !== pin.commit)
  throw new Error('GitLab checkout does not match the integration pin.');
const targets = [
  [
    'host',
    'app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue',
    'onEditingModeChange',
  ],
  [
    'restored',
    'app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue',
    'onEditingModeRestored',
  ],
  [
    'component',
    'app/assets/javascripts/content_editor/components/content_editor.vue',
    'getSerializedContentForHandoff',
  ],
  [
    'submission-binding',
    'app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue',
    'setupSubmissionBinding',
  ],
  [
    'submission-value',
    'app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue',
    'getValue',
  ],
];
const files = [];
for (const [kind, path, method] of targets) {
  const original = git(['show', `HEAD:${path}`]);
  const source = await readFile(resolve(checkout, path), 'utf8');
  const sfc = parseComponent(source);
  const template = compileTemplate({
    source: sfc.template.content,
    filename: path,
    id: 'gitlab-handoff',
    isProd: true,
  });
  if (template.errors.length) throw new Error(template.errors.join('\n'));
  const ast = babelParse(sfc.script.content, { sourceType: 'module' });
  const component = ast.program.body.find(
    (node) => node.type === 'ExportDefaultDeclaration',
  )?.declaration;
  const methods = component?.properties?.find((node) => node.key?.name === 'methods')?.value;
  const selected = methods?.properties?.find(
    (node) => node.type === 'ObjectMethod' && node.key?.name === method,
  );
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  files.push({
    kind,
    path,
    originalSHA256: hash(original),
    patchedSHA256: hash(source),
    method,
    code: selected ? sfc.script.content.slice(selected.start, selected.end) : null,
  });
}
if (files.some((file) => !file.code))
  throw new Error(
    'Apply the reviewed handoff patch before capture; no audit outputs were changed.',
  );
const testPaths = [
  'spec/frontend/vue_shared/components/markdown/markdown_editor_spec.js',
  'spec/frontend/content_editor/components/content_editor_spec.js',
  'spec/frontend/issuable/issuable_form_spec.js',
];
const tests = [];
for (const path of testPaths) {
  const source = await readFile(resolve(checkout, path), 'utf8');
  babelParse(source, { sourceType: 'module' });
  tests.push({
    path,
    sha256: createHash('sha256').update(source).digest('hex'),
    status: 'Parsed, not executed',
  });
}
const additionalPaths = [
  'app/assets/javascripts/issuable/issuable_form.js',
  'app/assets/javascripts/vue_shared/components/markdown/mount_markdown_editor.js',
  'app/assets/javascripts/vue_shared/components/markdown/submission.js',
];
const additionalSources = [];
for (const path of additionalPaths) {
  const source = await readFile(resolve(checkout, path), 'utf8');
  const ast = babelParse(source, { sourceType: 'module' });
  additionalSources.push({ path, sha256: createHash('sha256').update(source).digest('hex') });
  if (path.endsWith('/issuable_form.js')) {
    const body = ast.program.body.find((node) => node.type === 'ExportDefaultDeclaration')
      ?.declaration?.body?.body;
    const method = body?.find(
      (node) => node.type === 'ClassMethod' && node.key.name === 'handleSubmit',
    );
    if (!method) throw new Error('Inspect the actual legacy submit method.');
    files.push({
      kind: 'legacy-submit',
      path,
      method: 'handleSubmit',
      code: source.slice(method.start, method.end),
    });
    const constructor = body.find(
      (node) => node.type === 'ClassMethod' && node.kind === 'constructor',
    );
    const field = constructor.body.body.find(
      (node) =>
        node.type === 'ExpressionStatement' &&
        node.expression.type === 'AssignmentExpression' &&
        node.expression.left.property?.name === 'descriptionField',
    )?.expression.right;
    if (!field) throw new Error('Inspect the actual description field selector.');
    files.push({
      kind: 'description-field',
      path,
      method: 'descriptionField',
      code: source.slice(field.start, field.end),
    });
  }
  if (path.endsWith('/mount_markdown_editor.js')) {
    const method = ast.program.body.find(
      (node) =>
        node.type === 'FunctionDeclaration' && node.id.name === 'mountAutosaveClearOnSubmit',
    );
    if (!method) throw new Error('Inspect the actual draft-clear binding.');
    files.push({
      kind: 'draft-reset-binding',
      path,
      method: 'mountAutosaveClearOnSubmit',
      code: source.slice(method.start, method.end),
    });
  }
}
const submissionSource = await readFile(
  new URL('integrations/gitlab/services/submission.js', root),
  'utf8',
);
if (submissionSource !== (await readFile(resolve(checkout, additionalPaths[2]), 'utf8')))
  throw new Error('The vendored GitLab submission helper differs from its tested source.');
const patchPath = 'integrations/gitlab/patches/0001-guard-markdown-handoff.patch';
await mkdir(new URL('integrations/gitlab/patches/', root), { recursive: true });
const patch = git([
  'diff',
  '--binary',
  'HEAD',
  '--',
  ...targets.map(([, path]) => path),
  ...testPaths,
  ...additionalPaths,
]);
if (!patch.trim()) throw new Error('Refusing to replace the reviewed patch with an empty diff.');
await writeFile(new URL(patchPath, root), patch);
await writeFile(
  new URL('integrations/gitlab/fixtures/handoff-methods.json', root),
  JSON.stringify(
    {
      commit: pin.commit,
      license: 'GITLAB-LICENSE.txt',
      patchSHA256: createHash('sha256').update(patch).digest('hex'),
      scope:
        'Selected actual host methods for isolated contract regression; not full Vue/GitLab application validation.',
      files,
      tests,
      additionalSources,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    {
      commit: pin.commit,
      templatesCompile: true,
      patchPath,
      upstreamJestExecuted: false,
      methods: files.map(({ kind, method, code }) => ({ kind, method, present: Boolean(code) })),
    },
    null,
    2,
  ),
);
