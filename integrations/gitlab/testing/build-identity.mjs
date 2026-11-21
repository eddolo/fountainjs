import { createHash } from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Exact GitLab CE 19.5.3 source trees used for the prepared fallback builds.
const saveEchoTree = '075b931b09e4a1b2123bda61cc8f17a2d84c119c';
export const preparedRollbackTree = '307cccf71054136fcec34e32cd902ce5a87051ce';
export const wikiUploadRollbackTree = '71d94ee242ba0dc3ddbfd279ecd4fc06996cbc9f';
const initialWikiReplayTree = '05680cf7f8c2cdb1713329025aecc2ace113334c';
export const wikiUploadReplayTree = '084f348a1f39c84bdfcbebabc03e7b227e4583ad';
export const originalMarkdownTree = '33b218b425f86afe2a6bce5d00201dead8221188';
const firstAlignedReaderTree = 'd4c158d3795a69c42b65166ba7768735b1041fda';
export const alignedCheckboxRollbackTree = '6133fd5fecf0e94a017e8920e7e587947b44a726';
const markdownSourceTrees = [originalMarkdownTree, firstAlignedReaderTree, alignedCheckboxRollbackTree];
const noticeTrees = [wikiUploadReplayTree, ...markdownSourceTrees];
const replayTrees = [initialWikiReplayTree, ...noticeTrees];
const uploadGuardTrees = [wikiUploadRollbackTree, ...replayTrees];
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
  } else if (id.side === 'prepared') {
    if (mounts?.length !== 1 || mounts[0].readOnly !== true || observed.editor !== 'ProseMirror' ||
        observed.runtimeSHA256 !== null || observed.integrationSHA256 !== null ||
        ![saveEchoTree, preparedRollbackTree, ...uploadGuardTrees].includes(expected.sourceTree) || !digest(expected.rspackManifestSHA256) ||
        !report.frontendManifests.includes(expected.rspackManifestSHA256 + '  /opt/gitlab/embedded/service/gitlab-rails/public/assets/webpack/manifest.rspack.json') ||
        !observed.scripts.some(script => script.preparedHandoff === true) ||
        !observed.scripts.some(script => script.preparedSaveEcho === true) ||
        observed.scripts.some(script => script.preparedToolbarFocus === true) !== (expected.sourceTree !== saveEchoTree) ||
        (uploadGuardTrees.includes(expected.sourceTree) && !observed.scripts.some(script => script.wikiUploadGuard === true)) ||
        (replayTrees.includes(expected.sourceTree) && !observed.scripts.some(script => script.wikiUploadReplay === true)) ||
        (noticeTrees.includes(expected.sourceTree) && !observed.scripts.some(script => script.wikiUploadNotice === true)) ||
        (markdownSourceTrees.includes(expected.sourceTree) && !observed.scripts.some(script => script.originalMarkdownHandoff === true)) ||
        (expected.sourceTree === alignedCheckboxRollbackTree && !observed.scripts.some(script => script.scopedMarkdownHandoff === true)))
      return 'prepared Tiptap rollback build or handoff script mismatch';
  } else if (id.side === 'fountain') {
    if (mounts?.length !== 1 || mounts[0]?.readOnly !== true || observed.editor !== 'FountainJS' ||
        !expected.packageVersion || !revision(expected.fountainRevision) ||
        !digest(expected.runtimeSHA256) || expected.runtimeSHA256 !== observed.runtimeSHA256 ||
        !digest(expected.integrationSHA256) || expected.integrationSHA256 !== observed.integrationSHA256)
      return 'Fountain runtime or integration build mismatch';
  } else return 'unknown editor side';
  return null;
}

export async function observeEditorBuild({ page, project, request, expected, report, observeProbe, readDeployedScripts, wikiProbeURL }) {
  const path = '/api/v4/projects/' + project.id + '/issues';
  const title = 'Fountain compatibility build identity control';
  const description = 'Open this issue to identify the installed rich-text editor.';
  const matches = await request(path + '?state=opened&in=title&search=' + encodeURIComponent(title));
  const issue = matches.find(item => item.title === title && item.description === description) ?? await request(path, {title,description});
  if (issue.title !== title || issue.description !== description || !Number.isSafeInteger(issue.iid)) throw new Error('Invalid build control issue.');
  report.buildProbeIssue = {iid:issue.iid, descriptionSHA256:sha256(description)};
  const context = await page.context().browser().newContext({ storageState: await page.context().storageState() });
  try {
    const probe = await context.newPage();
    await observeProbe(probe);
    const scripts = new Map();
    const collectScript = response => {
      const url = new URL(response.url());
      if (url.origin === 'http://127.0.0.1:5080' && assetPath.test(url.pathname) &&
          response.request().resourceType() === 'script' && response.status() === 200) scripts.set(url.pathname, response);
    };
    probe.on('response',collectScript);
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
    if (wikiProbeURL) {
      const wiki = await context.newPage();
      await observeProbe(wiki);
      wiki.on('response',collectScript);
      await wiki.goto(wikiProbeURL);
      await wiki.getByTestId('wiki-edit-button').click();
      await wiki.getByTestId('wiki-submit-button').waitFor();
    }
    const entries = [...scripts].sort(([a], [b]) => a.localeCompare(b));
    const deployed = readDeployedScripts(entries.map(([path]) => path));
    for (const [path, response] of entries) {
      const bytes = await response.body();
      const script = { path, browserSHA256: sha256(bytes), deployedSHA256: deployed.get(path) };
      if (report.side === 'prepared' && bytes.includes('MARKDOWN_SUBMISSION_NOT_READY') && bytes.includes('EXPECTED_CURRENT_MARKDOWN'))
        script.preparedHandoff = true;
      if (report.side === 'prepared' && bytes.includes('.handoff=Object.freeze({markdown:') && bytes.includes('this.contentEditor.tiptapEditor.state.doc'))
        script.preparedSaveEcho = true;
      if (report.side === 'prepared' && bytes.includes('refocusBeforeCommand') && bytes.includes('this.tiptapEditor.view.focus()'))
        script.preparedToolbarFocus = true;
      if (wikiProbeURL && bytes.includes('fountainWikiFiles') && bytes.includes('Waiting for attachments before saving'))
        script.wikiUploadGuard = true;
      if (script.wikiUploadGuard && bytes.includes('fountainWikiPendingUploads') && bytes.includes('discardAbandonedUploadBatches'))
        script.wikiUploadReplay = true;
      if (bytes.includes('_loadedSourceDocument') && bytes.includes('_loadedMarkdown')) script.originalMarkdownHandoff = true;
      if (bytes.includes('preserveLoadedSource')) script.scopedMarkdownHandoff = true;
      if (script.wikiUploadReplay && bytes.includes('wiki-upload-notice')) script.wikiUploadNotice = true;
      observed.scripts.push(script);
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
  if (report.side === 'prepared') return host + ' · prepared Tiptap/ProseMirror · source tree ' +
    expected.sourceTree + ' · Rspack manifest ' + expected.rspackManifestSHA256;
  return report.side === 'original' ? host + ' · stock Tiptap/ProseMirror · frontend manifest ' + observed.manifestSHA256 :
    host + ' · FountainJS ' + expected.packageVersion + ' @ ' + expected.fountainRevision +
    ' · runtime ' + observed.runtimeSHA256 + ' · integration ' + observed.integrationSHA256;
}
