import hashlib
import json
from pathlib import Path
import pdfplumber

root = Path('artifacts/math-paragraph-native-evidence-20261104/unpacked')
before = Path('artifacts/image-paragraph-native-evidence-20261104/unpacked')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
targets = [(0, 'Experimental setup'), (0, 'Record the initial temperature'),
           (0, 'Keep both probes'), (0, 'Read the measurements'), (0, 'Figure 1'), (0, 'Figure 2'),
           (1, 'Model and measurements'), (1, 'Newton cooling model'), (1, 'Half cooling time'),
           (1, 'The rate constants'), (1, 'Recorded temperatures')]
result = {'implementationCommit': 'c39d92dc0145927c22dd1b7a8799a687f0ec3b38',
          'nativeRun': 41770211766, 'nativeJob': 126377895538,
          'archiveSHA256': '834441907fc033c5f2c7dcfd6aa644f0610c9e04c48711bd04a9f44cc04243dd',
          'completePixelFidelityCertified': False, 'microsoftWordCertified': False}
for kind in ['source', 'exported']:
    with pdfplumber.open(root / f'native/{kind}/{kind}.pdf') as pdf:
        positions = {}
        for page, text in targets:
            hits = pdf.pages[page].search(text, regex=False)
            assert len(hits) == 1, (kind, text)
            positions[text] = {key: hits[0][key] for key in ['x0', 'top', 'bottom']}
        result[kind] = {'pages': len(pdf.pages), 'targets': positions,
            'pageImages': [{'path': str(root / f'native/{kind}/page-{page}.png').replace('\\', '/'),
                'sha256': sha(root / f'native/{kind}/page-{page}.png')} for page in [1, 2]]}
result['deltasPt'] = {text: {axis: result['exported']['targets'][text][axis] - result['source']['targets'][text][axis]
    for axis in ['x0', 'top']} for _, text in targets}
assert all(abs(value) <= 0.01 for delta in result['deltasPt'].values() for value in delta.values()), result['deltasPt']
assert all(sha(root / f'native/source/page-{page}.png') == sha(before / f'native/source/page-{page}.png') for page in [1, 2])
assert sha(root / 'native/exported/page-1.png') == sha(before / 'native/exported/page-1.png')
result['sourceRastersUnchanged'] = True
result['exportedPageOneRasterUnchanged'] = True
with pdfplumber.open(before / 'native/exported/exported.pdf') as pdf:
    old = {text: pdf.pages[1].search(text, regex=False)[0]['top'] - result['source']['targets'][text]['top']
           for text in ['Half cooling time', 'The rate constants', 'Recorded temperatures']}
assert abs(old['Half cooling time'] - 1) < 0.01
assert abs(old['The rate constants'] - 2) < 0.01
assert abs(old['Recorded temperatures'] - 2) < 0.01
result['actualPreviousDriftPt'] = old
gate_root = Path('artifacts/math-paragraph-gate-evidence-20261104/unpacked')
gate = json.loads((gate_root / 'paragraph-position-report.json').read_text())
assert len(gate['scope']) == 11
assert all(abs(value) <= 0.01 for delta in gate['deltasPt'].values() for value in delta.values())
assert all(gate[key]['correctlyRejected'] for key in ['negativeControl', 'captionNegativeControl', 'mathNegativeControl'])
for kind in ['source', 'exported']:
    for page in [1, 2]:
        assert sha(gate_root / f'native/{kind}/page-{page}.png') == sha(root / f'native/{kind}/page-{page}.png')
result['expandedGate'] = {'commit': '497eb5eb05e164cd167630412e06ebee484b49a5', 'run': 41770809283, 'job': 126379807178,
    'archiveSHA256': '30aacd6b8633b4910182ae2edf039181bdcb8943342c47cab6a13941b506bc6e',
    'allFourRastersEqualReviewedImplementationRun': True, 'report': gate}
result['visualReview'] = {'newlyInspected': 'exported/page-2.png',
    'unchangedFromPreviouslyInspected': ['source/page-1.png', 'source/page-2.png', 'exported/page-1.png'],
    'completeRasterSHA256EqualityRequired': True}
result['remainingScope'] = ['Header placement and title raster differences', 'Footnote renderer differences',
    'HTML math/page-template fallbacks', 'Mixed paragraph reconstruction', 'Contextual math/image flow', 'Size/timing/release acceptance']
Path('artifacts/math-paragraph-native-review-20261104.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'deltasPt': result['deltasPt'], 'actualPreviousDriftPt': old}, indent=2))
