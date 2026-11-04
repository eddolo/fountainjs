import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const output = 'artifacts/paragraph-spacing-verification-20261104.json';
const digest = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const paths = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { encoding: 'utf8' })
  .split('\0').filter(path => path && path !== output);
const stagedSHA256 = Object.fromEntries(paths.map(path => [path,
  digest(execFileSync('git', ['show', `:${path}`], { maxBuffer: 16 * 1024 * 1024 }))]));
const captures = read('artifacts/paragraph-spacing-capture-comparison-20261104.json');
const inheritedReview = new Set([
  'chromium/initial', 'chromium/deleted', 'chromium/reader', 'chromium/reopened',
  'firefox/reader', 'firefox/reopened', 'webkit/reader', 'webkit/reopened',
]);
const report = {
  previousCheckpoint: '1a4481ae15d112dc4a1d68c3d51af877bb556176',
  status: 'portable paragraph-flow checkpoint; unmerged and unpublished; native Word bridge unfinished; acceptance gates fail',
  scope: 'Opaque spacing-group intent, DOM-free gap resolution, explicit schema flow boundaries and live DOM/full-HTML projection without rewriting declarations.',
  unchangedNativeSourceSHA256: digest(readFileSync('tests/fixtures/native-docx/cooling-report.docx')),
  checks: {
    ...read('artifacts/paragraph-spacing-verified-checks-20261104.json'),
    unit: { tests: 3509, files: 249, newContracts: 28, exit: 0 },
    apiDeclarations: 419, headlessModules: 118,
    recordedBrowsers: { journeys: 3, workers: 1, headless: true, exit: 0 },
    workerd: { noDOM: true, initialGapPt: 2, editedGapPt: 12, declaredBeforePt: 12, htmlEqual: true, exit: 0 },
    packedConsumer: { variants: ['ESM root', 'ESM core', 'CommonJS root', 'CommonJS core'], noDOM: true, exit: 0 },
    sizeAcceptance: { exit: 1, failedCeilings: 7, limitsChanged: false,
      failures: ['core ESM', 'core CommonJS', 'DOCX ESM', 'DOCX CommonJS', 'CSS', 'aggregate ESM', 'aggregate CommonJS'] },
    performanceAcceptance: { exit: 1, thresholdChanged: false, max100BlockServerHTMLP95Ms: 35,
      standaloneP95Ms: [48.13, 35.38], retainedBaselineStandaloneExit: 0,
      alternatingDiagnostic: 'Both implementations have slow samples; diagnostic does not replace either failed gate or establish a cause.' },
  },
  observations: captures.observations,
  visualReview: captures.comparisons.map(capture => {
    const key = `${capture.engine}/${capture.name}`;
    const inherited = inheritedReview.has(key);
    if (inherited && !capture.byteIdentical) throw new Error(`Review inheritance requires exact image equality: ${key}`);
    return { path: capture.current, sha256: capture.sha256,
      review: inherited ? 'byte-identical to previously visually inspected capture' : 'freshly visually inspected final capture' };
  }),
  actualTarball: captures.tarball,
  fixtureProvenance: read('artifacts/paragraph-spacing-source-20261104/provenance.json'),
  reproducedAndRepaired: [
    'Chromium native marker typography introduced 5 px between zero-gap list paragraphs. Independent native-HTML experiments isolate marker font context; matching longhand marker typography removes the gap without changing descendant typography or semantic markers.',
    'A reused custom NodeView restored stale margins when its new base value equalled the old derived value. Clear only the owned projection before update().',
    'A host updateDocument() callback could overwrite the current derived margin. Refresh after all mounted callbacks. Both new custom-view regression cases failed before repair and pass afterward.',
  ],
  auditCorrections: [
    'The first Firefox/WebKit run tried to inspect an old workspace after selecting another file. Move the same DOCX loss assertion before navigation; numerical expectations and timeouts remain unchanged.',
    'The final browser journey additionally measures the entered empty paragraph height as 14 pt; a model-only newline is insufficient.',
    'One Chromium entered screenshot differs from its earlier capture; the final image was visually inspected rather than treated as byte-identical.',
  ],
  remaining: [
    'Bind native Word paragraph-style identity to portable spacing groups without collapsing distinct styles or rewriting declared spacing.',
    'Export native Word styles/contextual intent and independently render actual edited/reopened DOCX before claiming native spacing repair.',
    'Resolve all seven unchanged size failures and the failed server-HTML timing gate before merge/release.',
    'Style-free HTML fragments preserve declarations but do not certify typography/layout in an external application.',
    'No full Word/pixel fidelity or roadmap percentage promotion is established by this checkpoint.',
  ],
  stagedSHA256,
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Bound ${paths.length} staged source/evidence files; fifteen reviewed final captures; unresolved gates retained.`);
