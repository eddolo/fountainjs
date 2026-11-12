import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const report = JSON.parse(await read('artifacts/gitlab-native-insertion-20261112/report.json'));
const runtime = JSON.parse(await read('artifacts/gitlab-native-runtime/build.json'));
const upstreamLog = await read('artifacts/gitlab-native-insertion-upstream-three-suites-20261112.log');
const tests = [...new Set(upstreamLog.split(/\r?\n/u)
  .filter(line => line.startsWith('  ● ContentEditor › ')).map(line => line.trim().slice(2)))];
if (tests.length !== 42 || report.status !== 'passed' || report.checks.length !== 10
  || report.nativeRuntime.sha256 !== runtime.sha256) throw new Error('Checkpoint evidence mismatch');
const units = await read('artifacts/gitlab-native-insertion-full-unit-final-20261112.log');
if (!units.includes('5507 passed (5507)')) throw new Error('Current full unit receipt missing');
const files = [
  'src/core/commands.ts', 'tests/core.test.ts', 'tests/gitlab-markdown-insertion.test.ts',
  'integrations/gitlab/components/fountain_content_editor.vue',
  'integrations/gitlab/components/fountain_formatting_toolbar.vue',
  'integrations/gitlab/services/content_editor.ts',
  'integrations/gitlab/services/markdown_insertion.ts',
  'integrations/gitlab/patches/gitlab-19.5.3-native-host-tests.patch',
  'scripts/check-build-budgets.mjs', 'scripts/audit-gitlab-product-baseline.mjs',
];
const hashes = {};
for (const path of files) hashes[path] = createHash('sha256').update(await read(path)).digest('hex');
const failures = {
  status: 'open', passed: 126, failed: 42, total: 168, passedSuites: 2, failedSuites: 1,
  log: 'artifacts/gitlab-native-insertion-upstream-three-suites-20261112.log',
  passedSuitePaths: ['spec/frontend/issuable/issuable_form_spec.js',
    'spec/frontend/vue_shared/components/markdown/markdown_editor_spec.js'],
  failedSuitePath: 'spec/frontend/content_editor/components/content_editor_spec.js',
  interpretation: 'The legacy component spec still addresses Tiptap views, observer/provider components and menus. Those fixture failures do not prove native behavior is correct. Preserve the requirements, migrate native setup/assertions, and implement actual missing behavior before claiming acceptance.',
  requiredGroups: ['Native surface/focus/keyboard/accessibility and current-document handoff',
    'Placeholder, initial/replacement loading, failure/readonly policy and retry/undo',
    'Host event-driven paste and change notifications',
    'Real attachment controls and code/alert/link/media/reference contextual menus',
    'Immersive layout/sticky header and native provider ownership'],
  failedTests: tests,
  waivers: 'None; no skipped cases, shortened assertions or timeout increases',
};
await writeFile(new URL('artifacts/gitlab-native-insertion-component-acceptance-20261112.json', root),
  JSON.stringify(failures, null, 2) + '\n');
const evidence = {
  date: '2026-11-12', status: 'partial-native-insertion-integration',
  parentRevision: runtime.parentRevision, upstreamRevision: report.pin.commit,
  scope: 'Native Fountain Markdown insertion in actual GitLab issue/discussion editors; real backend and records, incomplete full component/product acceptance',
  browser: {
    status: report.status, checks: report.checks.length, issueIID: report.issue.iid,
    engine: 'Native Linux Chromium',
    report: 'artifacts/gitlab-native-insertion-20261112/report.json',
    log: 'artifacts/gitlab-native-insertion-live-final-20261112.log',
    recording: 'artifacts/gitlab-native-insertion-20261112/recordings/page@879022391cb84e27cad6233c660970f5.webm',
    screenshots: ['original-rich-edit.png', 'retained-paste-source.png', 'original-after-restart.png']
      .map(name => `artifacts/gitlab-native-insertion-20261112/${name}`),
    visualReview: 'Inspected native editor and restored reader: headings, bold/reference, working tasks, table, equation, decoded uploaded PNG, pasted and recovered paragraphs. Inspected exact rejected-footnote source and retry controls. Comment persistence is checked in the actual UI/API and recording, not a separate screenshot review.',
    pageErrors: report.browserErrors,
    runtimeSHA256: runtime.sha256, loadedScripts: report.preparedScripts,
    pinFlagScope: 'Immutable packaged-image pin retains fountainReplacementInstalled=false; nativeBrowser/nativeInsertion, mounted native DOM, read-only frontend overlay and loaded runtime/script hashes identify the replacement.',
  },
  implementation: [
    'Native GitLab paste event and explicit real browser clipboard Markdown button',
    'Ordered asynchronous insertion with native position maps and conservative target conflict detection, including reentrant host edits',
    'Pending work blocks serialization/save/handoff while allowing author typing',
    'Serialization preflight and host-filter refusal roll back the complete native batch',
    'One undo step per successful insertion; replacement/disposal cancel queued requests',
    'Rejected original source remains visible and explicitly retryable; successful paste clears recovery',
    'Public insertDocument preserves authored paragraph alignment/direction/custom metadata',
    'Native host fixtures use actual Fountain surface/transactions rather than a Tiptap facade',
  ],
  validation: {
    units: { status: 'passed', tests: 5507, files: 341, log: 'artifacts/gitlab-native-insertion-full-unit-final-20261112.log' },
    focused: { status: 'passed', tests: 82, files: 3, log: 'artifacts/gitlab-native-insertion-final-focused-20261112.log' },
    frameworkTypes: { status: 'passed', scope: 'Root TypeScript, Svelte and both Angular configurations', log: 'artifacts/gitlab-native-insertion-typecheck-final-20261112.log' },
    api: { status: 'passed', declarations: 450, log: 'artifacts/gitlab-native-insertion-api-20261112.log' },
    packageBuild: { status: 'passed', log: 'artifacts/gitlab-native-insertion-package-build-20261112.log' },
    sourceBuild: { status: 'passed', compilerSeconds: 85.06, commandSeconds: 87.06,
      warnings: ['asset size limit', 'entrypoint size limit'],
      summary: 'artifacts/gitlab-native-insertion-source-build-summary-20261112.txt' },
    upstreamHostJest: { status: 'passed', tests: 75,
      log: 'artifacts/gitlab-native-insertion-upstream-host-jest-20261112.log',
      refreshedInBroaderRun: true,
      patchVerification: 'artifacts/gitlab-native-insertion-patch-verification-20261112.json' },
    upstreamBroaderAcceptance: 'artifacts/gitlab-native-insertion-component-acceptance-20261112.json',
    upstreamESLint: { status: 'passed', files: 3, log: 'artifacts/gitlab-native-insertion-eslint-20261112.log' },
    performanceAndRetention: { status: 'passed', log: 'artifacts/gitlab-native-insertion-performance-20261112.log' },
    sizes: { status: 'passed', log: 'artifacts/gitlab-native-insertion-build-budgets-20261112.log',
      failedPriorAllowance: 'artifacts/gitlab-native-insertion-build-budgets-before-20261112.log',
      change: { aggregateCommonJSKiB: [1421.75, 1422], measuredBytes: 1455980, measuredGrowthBytes: 193,
        unchanged: 'Entry, ESM, CSS, performance and retention limits' } },
    completeReleaseGate: 'Not refreshed; no full pnpm check, combined hosted CI or publication claim',
  },
  installation: { manifest: 'artifacts/gitlab-native-browser-install/install.json',
    runtimeManifest: 'artifacts/gitlab-native-runtime/build.json', ownedFiles: 7,
    previousCheckpointManifests: ['artifacts/gitlab-native-runtime/browser-checkpoint-build-20261112.json',
      'artifacts/gitlab-native-browser-install/browser-checkpoint-install-20261112.json'],
    ownershipGuard: 'Current install succeeded over verified owned files; prior rollback/reinstall/changed-file evidence remains scoped to its archived checkpoint' },
  retainedFindings: [
    'Broader upstream native component suite still fails 42 cases; requirements retained',
    'Unsupported GitLab footnotes are rejected/retained, not implemented',
    'Edited Markdown still canonicalizes task whitespace/table separators; complete untouched-region fidelity is unproven',
    'Earlier original/prepared-reader image intermittency is not causally closed by passing native journeys',
    'Independent editor-only KaTeX assets remain unverified outside the seeded reader context',
    'Clipboard permission refusal and every collaboration/rebase case are not covered by the recorded journey',
    'First successful insertion run lacked intended paragraph separation in its fixture; final run uses an actual Enter action and visibly separate recovered paragraph',
  ],
  remaining: ['Migrate native component acceptance without deleting behavior requirements; implement attachment/contextual menu/immersive gaps',
    'Complete native toolbar, upload/autocomplete/saved-reply/template and specialized GitLab dialect adapters',
    'Full replacement-source recovery inspection and untouched-region Markdown fidelity',
    'Native collaboration/session providers, MR/wiki/threaded discussions and multi-user recovery/permissions',
    'Localization, accessibility, mobile/cross-engine acceptance, performance, packed consumers and hosted release gates',
    'Two further complete professional products; Outline/Directus remain candidates'],
  runtime: 'Own application stopped successfully in runner finally; dedicated private records/volumes retained',
  publication: 'None. Public engine behavior repaired locally; private native insertion API not published. No parity row, production readiness or superiority claim promoted.',
  sourceHashes: hashes,
};
await writeFile(new URL('artifacts/gitlab-native-insertion-integration-20261112.json', root), JSON.stringify(evidence, null, 2) + '\n');
await writeFile(new URL('artifacts/gitlab-native-insertion-source-build-summary-20261112.txt', root),
  'Pinned GitLab CE source 0d4c9a9a2fa291df4d2c9be7e07e41e70249b2bf\n'
  + 'Final installed runtime SHA256: ' + runtime.sha256 + '\n'
  + 'Command: corepack yarn rspack-prod\nExit: 0\n'
  + 'Rspack 2.2.8 compiled with 2 warnings in 85.06 s\nDone in 87.06s.\n'
  + 'Warnings: existing asset-size and entrypoint-size warnings retained, not disabled.\n'
  + 'Full local source-build log: artifacts/gitlab-native-insertion-source-build-final-reviewed-20261112.log\n');
console.log('Captured current insertion evidence and all 42 open component acceptance cases.');
