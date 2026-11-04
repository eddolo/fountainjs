import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

const file = 'artifacts/list-layout-verification-20261103.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const files = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' }).split('\0').filter(path => path && path !== file);
const stagedSHA256 = Object.fromEntries(files.map(path => [path, digest(execFileSync('git', ['show', `:${path}`], { maxBuffer: 16 * 1024 * 1024 }))]));
const browsers = Object.fromEntries(['chromium', 'firefox', 'webkit'].map(engine => {
  const root = `artifacts/list-layout-verified-real-20261103/${engine}`;
  const observations = JSON.parse(readFileSync(`${root}/browser-observations.json`));
  const captures = ['editor-top.png', 'editor-reopened.png', 'editor-list-enter.png', 'reader.png', 'native-fragment.png'].map(name => {
    const previous = `artifacts/list-layout-reader-real-20261103/${engine}/${name}`;
    return { path: `${root}/${name}`, sha256: digest(readFileSync(`${root}/${name}`)),
      matchesPreviousCapture: digest(readFileSync(`${root}/${name}`)) === digest(readFileSync(previous)),
      freshManualReview: name === 'reader.png' };
  });
  return [engine, { imported: observations.importedListGeometry, reopened: observations.reopenedListGeometry,
    reader: observations.readerListGeometry, errors: observations.errors,
    editingHistoryAndBackwardSelectionPassed: observations.listEnterUndoRedoBackspace && observations.backwardKeyboardSelection,
    nativeHTMLFragmentFallback: observations.nativeFragmentFallback, captures }];
}));
const builtFiles = ['dist/core.js', 'dist/core.cjs', 'dist/docx.js', 'dist/docx.cjs', 'dist/styles.css'];
const report = {
  baseMaster: 'b1dce0e4c3a20f3e341de6edd3e45ab091467b06', previousCheckpoint: 'df045ce',
  status: 'unfinished feature branch; not merged or published; native independent render pending',
  scope: 'Explicit list/item geometry, native Word coordinates, safe HTML projection and editing retention.',
  sourceSHA256: digest(readFileSync('tests/fixtures/native-docx/cooling-report.docx')),
  checks: { build: 0, fullUnit: { exit: 0, tests: 3460, files: 245 }, performance: 0, types: 0,
    packageEntries: 0, headless: { exit: 0, modules: 117 }, workerd: 0,
    api: { initialExit: 1, reviewedSnapshotUpdated: true, finalExit: 0, declarations: 417 },
    browser: { exit: 0, journeys: 3, workers: 1, headless: true }, size: { exit: 1, failingCeilings: 7, limitsChanged: false } },
  browsers,
  builtArtifacts: Object.fromEntries(builtFiles.map(path => [path, { bytes: statSync(path).size, sha256: digest(readFileSync(path)) }])),
  limitations: [
    'Seven existing size ceilings fail; no acceptance limit was widened.',
    'Independent native rendering for this commit is pending; browser geometry is not a native Word verdict.',
    'Contextual spacing, native multi-paragraph item ownership and broad marker/tab behavior remain incomplete.',
    'Raw TeX and literal page-template fields remain in standalone HTML; whole-document visual fidelity is not established.',
    'Native HTML fragment fallback is not an actual external application clipboard test.',
    'Real-device IME and assistive-technology certification are outside these desktop journeys.',
  ],
  stagedSHA256,
};
writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
console.log(`Bound ${files.length} staged source/evidence files; final three-reader captures reviewed.`);
