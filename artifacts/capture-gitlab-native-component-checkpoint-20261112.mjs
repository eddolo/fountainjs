import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const browser = JSON.parse(await read('artifacts/gitlab-native-component-20261112/report.json'));
const runtime = JSON.parse(await read('artifacts/gitlab-native-runtime/build.json'));
const install = JSON.parse(await read('artifacts/gitlab-native-browser-install/install.json'));
if (browser.status !== 'passed' || browser.checks.length !== 12 || browser.browserErrors.length
  || browser.nativeRuntime.sha256 !== runtime.sha256) throw new Error('Current browser evidence incomplete');
if (Date.parse(browser.date) <= (await stat(new URL('artifacts/gitlab-native-component-source-build-final-20261112.log', root))).mtimeMs)
  throw new Error('Browser receipt precedes final source-inspector build');
const log = await read('artifacts/gitlab-native-component-three-suites-inspected-20261112.log');
if (!log.includes('7 failed, 163 passed, 170 total')) throw new Error('Current upstream result changed');
const failed = [...new Set(log.split(/\r?\n/u).filter(line => line.startsWith('  ● ContentEditor › ')).map(line => line.trim().slice(2)))];
if (failed.length !== 7) throw new Error('Expected seven retained feature cases');
const unit = await read('artifacts/gitlab-native-component-full-unit-reviewed-20261112.log');
if (!unit.includes('5507 passed (5507)')) throw new Error('Full root unit receipt missing');
const recordingNames = await readdir(new URL('artifacts/gitlab-native-component-20261112/recordings/', root));
const recordings = await Promise.all(recordingNames.map(async name => ({ name,
  modified: (await stat(new URL(`artifacts/gitlab-native-component-20261112/recordings/${name}`, root))).mtimeMs })));
const recording = recordings.sort((left, right) => right.modified - left.modified)[0].name;
const sources = ['src/view/view.ts', 'src/styles.css', 'scripts/check-build-budgets.mjs',
  'integrations/gitlab/components/fountain_content_editor.vue',
  'integrations/gitlab/components/fountain_editor_surface.vue',
  'integrations/gitlab/patches/gitlab-19.5.3-native-component-tests.patch',
  'scripts/audit-gitlab-product-baseline.mjs', 'scripts/run-gitlab-native-browser-audit.mjs',
  'tests/browser/gitlab-vue2.spec.ts', 'tests/browser/fixtures/gitlab-vue2.ts'];
const hashes = {};
for (const path of sources) hashes[path] = createHash('sha256').update((await read(path)).replaceAll('\r\n', '\n')).digest('hex');
const screenshots = ['original-rich-edit.png', 'retained-paste-source.png', 'empty-comment-placeholder.png',
  'failed-load-readonly.png', 'failed-load-explicit-recovery.png', 'original-after-restart.png']
  .map(name => `artifacts/gitlab-native-component-20261112/${name}`);
const evidence = {
  date: '2026-11-12', status: 'partial-native-component-integration', parentRevision: runtime.parentRevision,
  upstreamRevision: browser.pin.commit,
  scope: 'Native Fountain component foundations in the actual GitLab CE 19.5.3 application; incomplete full toolbar/dialect/provider and product acceptance',
  browser: { status: 'passed', engine: 'Native Linux Chromium', checks: browser.checks.length,
    issueIID: browser.issue.iid, recoveryIssue: browser.recoveryIssue,
    report: 'artifacts/gitlab-native-component-20261112/report.json',
    log: 'artifacts/gitlab-native-component-live-inspected-20261112.log',
    recording: `artifacts/gitlab-native-component-20261112/recordings/${recording}`, screenshots,
    visualReview: 'Actual native editor/reader, visible empty comment hint, rejected-source panel, disabled failed-load editor and explicit recovery draft inspected. Original rejected Markdown remains copyable before/after recovery; cancelling leaves the server source unchanged. Full reader/native screenshots show image, table, math, tasks, source-backed references and saved paragraphs.',
    loadedScripts: browser.preparedScripts, runtimeSHA256: runtime.sha256, pageErrors: browser.browserErrors,
    pinFlagScope: 'Immutable packaged-image metadata retains fountainReplacementInstalled=false; nativeBrowser/nativeComponent, mounted native DOM, complete read-only frontend overlay and loaded hashes identify the exercised replacement.',
  },
  repairs: ['Retry preserves the failed replacement history options',
    'Failed initial/replacement loads remain read-only until successful retry or explicit Keep current document; host read-only policy remains in force',
    'Immersive root positioning and sticky-header classes restored',
    'aria-labelledby removes the competing default aria-label, including reactive changes',
    'The shared native view recognizes truly empty paragraph/text documents for placeholder paint, focus/typing/deletion/undo and non-text-content exclusion'],
  recoverySourcePanel: { status: 'implemented-and-recorded', scope: 'Original rejected document Markdown is readonly, inspectable and copyable while this editor stays open. It is not persisted as a second GitLab source attachment.' },
  upstream: { status: 'failed-with-retained-feature-cases', total: 170, passed: 163, failed: 7,
    host: { passed: 75, failed: 0 }, form: { passed: 40, failed: 0 }, component: { passed: 48, failed: 7, total: 55 },
    log: 'artifacts/gitlab-native-component-three-suites-inspected-20261112.log',
    failedTests: failed,
    migration: 'All 53 original component cases remain with equivalent native setup/assertions; two explicit recovery cases added. The Tiptap-instance/provider tests become native surface/model-ownership checks. Visual placeholder requirements are verified in real browser paint rather than wrapper.text(), which excludes CSS-generated text.',
    interpretation: '42 to seven failures includes fixture migration, not 35 product defects fixed. Attachments and alert/link/media/code/reference contextual controls are still missing; the remaining legacy feature assertions must adopt equivalent native controls when those land.',
    waivers: 'No skipped cases, timeout increases or passing placeholder-only implementations',
    patch: 'integrations/gitlab/patches/gitlab-19.5.3-native-component-tests.patch',
    patchVerification: 'artifacts/gitlab-native-component-patch-verification-20261112.json',
    lint: 'artifacts/gitlab-native-component-eslint-inspected-20261112.log',
  },
  validation: {
    units: { status: 'passed', tests: 5507, files: 341, log: 'artifacts/gitlab-native-component-full-unit-reviewed-20261112.log' },
    rootTypes: { status: 'passed', log: 'artifacts/gitlab-native-component-root-types-final-20261112.log' },
    frameworkTypes: { status: 'passed', log: 'artifacts/gitlab-native-component-typecheck-20261112.log', scope: 'Full root/Svelte/Angular check; later empty-text predicate separately rechecked by final root tsc; public types unchanged' },
    api: { status: 'passed', declarations: 450, log: 'artifacts/gitlab-native-component-api-20261112.log' },
    packageBuild: { status: 'passed', log: 'artifacts/gitlab-native-component-package-build-reviewed-20261112.log' },
    sourceBuild: { status: 'passed', compilerSeconds: 62.71, commandSeconds: 64.65, warnings: ['asset size limit', 'entrypoint size limit'], log: 'artifacts/gitlab-native-component-source-build-final-20261112.log' },
    placeholderBrowsers: { status: 'passed', tests: 3, engines: ['Chromium', 'Firefox', 'WebKit'],
      log: 'artifacts/gitlab-native-placeholder-final-browser-20261112.log',
      scope: 'Private Vue 2 surface/native renderer contract, not three-engine full GitLab application acceptance',
      visualReview: 'Inspected the visible placeholder in all three screenshots; real focus/typing/deletion/undo and a non-text horizontal rule pass. Firefox returns attr(data-placeholder) as computed content; the test resolves only that exact expression and screenshot inspection independently confirms paint.' },
    performanceAndRetention: { status: 'passed', log: 'artifacts/gitlab-native-component-performance-20261112.log' },
    size: { status: 'passed', log: 'artifacts/gitlab-native-component-budget-20261112.log',
      failedPriorCapacity: 'artifacts/gitlab-native-component-budget-first-20261112.log',
      css: { measuredBytes: 90906, previousCapacityBytes: 90880, capacityBytes: 90944, addedCapacityBytes: 64 },
      commonJS: { measuredBytes: 1456111, previousMeasuredBytes: 1455980, growthBytes: 131, unchangedCapacityBytes: 1456128 },
      unchanged: 'Every JavaScript entry/aggregate, performance and retention limit' },
    releaseGate: 'No full pnpm check, combined hosted CI, publication or product-readiness claim',
  },
  retainedFindings: ['Seven upstream attachment/contextual-menu requirements still fail',
    'Unsupported footnotes are retained/refused, not implemented; full dialect/source fidelity remains incomplete',
    'Retained document source currently lasts while the editor is open; direct original-source-mode handoff and persistent sidecar policy still need product decisions/acceptance',
    'Immersive/a11y classes and reactive naming have native component assertions; full-screen app workflows and assistive-technology acceptance remain open',
    'Earlier original/prepared-reader image intermittency is not causally resolved',
    'Editor-only KaTeX asset independence, arbitrary clipboard and all multi-user rebasing cases remain unverified',
    'An initial root unit run was stopped after build inputs changed during its imports; it is invalidated, not a product pass/failure. The final frozen-build run passes 5507 cases',
    'Initial placeholder journeys exposed the empty-text-node omission; the corrected three-engine journeys pass',
    'Firefox initially failed a CSS serialization expectation despite visible correct paint; exact attr() normalization and screenshot review resolve that assertion'],
  installation: { manifest: 'artifacts/gitlab-native-browser-install/install.json', runtimeManifest: 'artifacts/gitlab-native-runtime/build.json',
    ownedFiles: Object.keys(install.files).length,
    previousManifest: 'artifacts/gitlab-native-browser-install/insertion-checkpoint-install-20261112.json',
    previousRuntimeManifest: 'artifacts/gitlab-native-runtime/insertion-checkpoint-build-20261112.json' },
  remaining: ['Complete real attachment controls and native contextual menus',
    'Autocomplete, saved replies/templates, specialized GitLab dialect and full untouched-source fidelity',
    'Native collaboration/session providers, MR/wiki/threaded/multi-user workflows and permission/recovery matrix',
    'Localization extraction, accessibility, mobile/cross-engine full product acceptance, performance, packed consumers and hosted release gates',
    'Two additional complete professional products; no completed Outline/Directus integration claim'],
  runtime: 'Own application stopped after recorded audit; dedicated private records/volumes retained',
  publication: 'None; no parity row or production/superiority claim promoted',
  sourceHashEncoding: 'SHA-256 of LF-normalized UTF-8 source', sourceHashes: hashes,
};
await writeFile(new URL('artifacts/gitlab-native-component-integration-20261112.json', root), JSON.stringify(evidence, null, 2) + '\n');
console.log('Captured native component evidence, exact scope and seven remaining feature cases.');
