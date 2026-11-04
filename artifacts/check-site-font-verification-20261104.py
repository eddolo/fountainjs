from pathlib import Path
import hashlib
import json
import subprocess
import tarfile

base = Path('artifacts')
parent = 'f8b07b72e5e65e902ec0b67062b2e923a713af7e'
read_json = lambda path: json.loads(Path(path).read_text(encoding='utf-8-sig'))
digest = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
runtime = subprocess.check_output(['git', 'diff', parent, '--', 'src', 'package.json', 'api-surface.json', 'scripts/check-build-budgets.mjs', 'scripts/check-performance-budgets.mjs'])
assert runtime == b'', 'Library runtime/API/budgets must be unchanged.'
archive = base / 'issue-input-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz'
assert digest(archive) == read_json(base / 'issue-input-verification-20261104.json')['tarballSHA256']
dist_files = 0
with tarfile.open(archive, 'r:gz') as package:
    for member in package:
        if member.isfile() and member.name.startswith('package/dist/'):
            assert package.extractfile(member).read() == Path(member.name.removeprefix('package/')).read_bytes()
            dist_files += 1
assert dist_files == 865
entries = []
for path in sorted(Path('examples/react-app/src').glob('*main.tsx')):
    text = path.read_text()
    if "import './index.css';" in text:
        assert "import { loadSiteFonts } from './site-fonts';" in text and 'loadSiteFonts();' in text
        entries.append(path.as_posix())
assert len(entries) == 8
assert 'fonts.googleapis' not in Path('examples/react-app/src/index.css').read_text()
assets = Path('examples/react-app/dist/assets')
assert any('fountainSiteFonts' in p.read_text() and 'fonts.googleapis' in p.read_text() for p in assets.glob('*.js'))
assert not any('fonts.googleapis' in p.read_text() for p in assets.glob('*.css'))
assert read_json(base / 'site-font-verified-production-browser-20261104/.last-run.json')['status'] == 'passed'
assert '6 passed' in (base / 'site-font-verified-production-browser-20261104.log').read_text(encoding='utf-8-sig')
assert read_json(base / 'site-font-verified-startup-browser-20261104/.last-run.json')['status'] == 'passed'
assert '3 passed' in (base / 'site-font-verified-startup-browser-20261104.log').read_text(encoding='utf-8-sig')
observations = []
for path in sorted((base / 'site-font-verified-production-browser-20261104').rglob('observations.json')):
    row = read_json(path)
    # WebKit requests this stylesheet again when its media changes to screen.
    # The live journey checks one link and one initial held request, not a
    # cross-engine promise that the network will never refetch that link.
    assert row['requests'] == {'chromium': 1, 'firefox': 1, 'webkit': 2}[row['engine']] and row['errors'] == []
    assert all(row[key] is True for key in ['nativeTypingBeforeFontResponse', 'stylesheetAppliedAfterRelease', 'contentRetained'])
    observations.append(row)
assert len(observations) == 3
downloads = []
for path in sorted((base / 'site-font-verified-production-browser-20261104').rglob('issue-description.md')):
    baseline = next((base / 'issue-input-final-regression-browser-20261104').glob(f'*{path.parent.name.rsplit("-", 1)[-1]}/issue-description.md'))
    assert path.read_bytes() == baseline.read_bytes()
    downloads.append({'path': path.as_posix(), 'sha256': digest(path), 'bytes': path.stat().st_size})
assert len(downloads) == 3
samples = {}
for label, directory in [('before', 'issue-startup-audit-browser-20261104'), ('emptyFontCSSControl', 'issue-startup-font-control-browser-20261104'), ('afterActualFonts', 'site-font-verified-startup-browser-20261104')]:
    values = [read_json(path) for path in (base / directory).rglob('startup.json')]
    assert len(values) == 3
    samples[label] = sorted(values, key=lambda row: row['attempt'])
assert all(row['externalFontControl'] is True for row in samples['emptyFontCSSControl'])
assert all(row['externalFontControl'] is False for row in samples['afterActualFonts'])
visuals = read_json(base / 'site-font-visual-review-20261104/index.json')
assert len(visuals) == 9 and sum(len(row['pictures']) for row in visuals) == 18
for row in visuals:
    row['videoSHA256'] = digest(row['video'])
    row['contactSHA256'] = digest(row['contact'])
    row['recordingContactSHA256'] = digest(row['recordingContact'])
assert 'runSiteFontJourney(page, info)' in Path('tests/browser/editor.spec.ts').read_text()
assert 'test-results/**/site-font-journey/**' in Path('.github/workflows/ci.yml').read_text()
report = {'branch': 'fix/site-font-loading-20261104', 'parentCommit': parent, 'siteEntryModules': entries,
    'libraryRuntimeAPIAndBudgetSourcesUnchanged': True, 'distFilesByteEqualToParentCheckedArchive': dist_files,
    'parentActualPackageSHA256': digest(archive), 'types': 'passed', 'productionBuild': 'passed',
    'productionJourneys': 6, 'nativePendingFontObservations': observations, 'actualFontsStartupJourneys': 3,
    'startupObservations': samples, 'timingScope': 'Three local Chromium fresh-page observations under limited CPU; readyAt is editor DOM insertion, paints are browser PerformanceObserver entries. Not a production latency guarantee or cross-device certification.',
    'downloads': downloads, 'visualReview': {'captures': 18, 'recordings': 9, 'framesSampledPerRecording': 6, 'fullPlayback': False,
        'finding': 'Source, reader, mobile handoff and native typing remain visible; pending-font flow shows system fallback text. No new content/layout anomaly observed within this scope.',
        'assets': visuals, 'rawRecordings': 'Retained locally; contact sheets and hashes committed; CI collects fresh journey evidence.'},
    'retainedAttempts': ['site-font-production-browser-20261104.log: three controls caught the production tree shaker dropping a side-effect-only loader',
        'site-font-final-production-browser-20261104.log: interrupted after live trace proved Firefox screenshot awaited fonts while the test held its response; native typing assertions already passed',
        'issue-startup-audit-browser-20261104.log: original actual-font observations', 'issue-startup-font-control-browser-20261104.log: isolated empty-CSS diagnostic control'],
    'acceptanceLimitsChanged': False, 'fullParityOrReleaseCertified': False,
    'remainingScope': ['fresh full current-head CI', 'existing aggregate size review', 'broader startup/device/network coverage', 'remaining roadmap and CommonMark work']}
(base / 'site-font-verification-20261104.json').write_bytes(json.dumps(report, indent=2).encode() + b'\n')
print('Verified: 6 production journeys, 3 actual-font startup observations, 865 unchanged dist files, three byte-identical downloads.')
