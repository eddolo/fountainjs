import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const revision = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const assetPath = /^\/assets\/webpack\/(?:[\w.-]+\/)*[\w.-]+\.js$/u;

export function buildIdentityError(report) {
  const id = report?.buildIdentity;
  if (!id || id.side !== report.side) return 'missing or wrong editor identity';
  const { expected, observed } = id;
  if (!expected || !observed) return 'missing expected or observed build';
  if (!revision(expected.gitlabCommit) || !report.backend?.version?.revision ||
      !expected.gitlabCommit.startsWith(report.backend.version.revision) || expected.gitlabVersion !== report.backend.version.version ||
      !expected.gitlabVersion || expected.image !== report.deployment?.image || !/@sha256:[a-f0-9]{64}$/u.test(expected.image))
    return 'GitLab revision or image mismatch';
  if (!Array.isArray(report.frontendManifests) || !report.frontendManifests.length ||
      report.frontendManifests.some(line => !/^[a-f0-9]{64}  \/.+\/manifest[\w.-]*\.json$/u.test(line)) ||
      observed.manifestSHA256 !== sha256([...report.frontendManifests].sort().join('\n')))
    return 'missing or inconsistent deployed frontend manifest';
  if (!Array.isArray(observed.scripts) || !observed.scripts.length ||
      observed.scripts.some(s => !s || !assetPath.test(s.path) || !digest(s.browserSHA256) || s.browserSHA256 !== s.deployedSHA256))
    return 'browser script bytes differ from the deployment or are missing';
  const mounts = report.deployment?.assetMount;
  if (id.side === 'original') {
    if (mounts?.length !== 0 || observed.editor !== 'ProseMirror' || observed.runtimeSHA256 !== null || observed.integrationSHA256 !== null)
      return 'stock editor or asset mount mismatch';
  } else if (id.side === 'fountain') {
    if (mounts?.length !== 1 || mounts[0]?.readOnly !== true || observed.editor !== 'FountainJS' ||
        !expected.packageVersion || !revision(expected.fountainRevision) ||
        !digest(expected.runtimeSHA256) || expected.runtimeSHA256 !== observed.runtimeSHA256 ||
        !digest(expected.integrationSHA256) || expected.integrationSHA256 !== observed.integrationSHA256)
      return 'Fountain runtime or integration build mismatch';
  } else return 'unknown editor side';
  return null;
}

export async function observeEditorBuild({ page, project, request, expected, report, readDeployedScripts }) {
  const [issue] = await request('/api/v4/projects/' + project.id + '/issues?per_page=1&state=opened');
  if (!issue) throw new Error('Build verification needs an open issue in the audit project.');
  const context = await page.context().browser().newContext({ storageState: await page.context().storageState() });
  try {
    const probe = await context.newPage();
    const scripts = new Map();
    probe.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === 'http://127.0.0.1:5080' && assetPath.test(url.pathname) &&
          response.request().resourceType() === 'script' && response.status() === 200) scripts.set(url.pathname, response);
    });
    await probe.goto(issue.web_url);
    await probe.getByTestId('work-item-edit-form-button').click();
    const form = probe.getByTestId('work-item-description-wrapper');
    const surface = form.locator('[contenteditable="true"].ProseMirror, [contenteditable="true"].fountain-editor');
    const toggle = form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
    await surface.or(toggle).first().waitFor({ timeout: 30000 });
    if (!(await surface.isVisible())) await toggle.click();
    await surface.waitFor({ timeout: 30000 });
    const observed = await surface.evaluate(el => ({
      editor: el.matches('.ProseMirror') ? 'ProseMirror' : 'FountainJS',
      integrationSHA256: el.closest('[data-fountain-build]')?.getAttribute('data-fountain-build') ?? null,
      runtimeSHA256: globalThis.__fountainGitLabRuntimeSHA256 ?? null,
    }));
    observed.manifestSHA256 = sha256([...report.frontendManifests].sort().join('\n'));
    observed.scripts = [];
    const entries = [...scripts].sort(([a], [b]) => a.localeCompare(b));
    const deployed = readDeployedScripts(entries.map(([path]) => path));
    for (const [path, response] of entries) {
      observed.scripts.push({ path, browserSHA256: sha256(await response.body()), deployedSHA256: deployed.get(path) });
    }
    return { side: report.side, expected, observed };
  } finally {
    await context.close();
  }
}

export function describeBuild(report) {
  const error = buildIdentityError(report);
  if (error) return 'Unverified (' + error + ')';
  const { expected, observed } = report.buildIdentity;
  const host = 'GitLab CE ' + expected.gitlabVersion + ' @ ' + expected.gitlabCommit;
  return report.side === 'original' ? host + ' · stock Tiptap/ProseMirror · frontend manifest ' + observed.manifestSHA256 :
    host + ' · FountainJS ' + expected.packageVersion + ' @ ' + expected.fountainRevision +
    ' · runtime ' + observed.runtimeSHA256 + ' · integration ' + observed.integrationSHA256;
}
