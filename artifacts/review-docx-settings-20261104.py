import hashlib
import json
from pathlib import Path
import pdfplumber

root = Path('artifacts/docx-settings-gate-evidence-20261104/unpacked')
reviewed = Path('artifacts/docx-settings-native-evidence-20261104/unpacked')
before = Path('artifacts/docx-native-spacing-native-evidence-20261104/unpacked')
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
gate = json.loads((root / 'paragraph-position-report.json').read_text())
assert gate['negativeControl']['correctlyRejected'] is True
assert all(abs(value) < 0.000001 for delta in gate['deltasPt'].values() for value in delta.values())
assert all(abs(delta['y'] - 7) < 0.000001 for delta in gate['negativeControl']['deltasPt'].values())
result = {'implementationCommit': '0255f600ff3704f610e80ad3ee62acc38e96ceb0',
          'nativeAuditCommit': '9e15472c9cdde46cd8b0bcb9a031df0dedd1e807',
          'nativeRun': 41763890327, 'nativeJob': 126357628439,
          'archiveSHA256': '8770a0c7f0d656779692212ee01d750eddf656751a7aa8648104a700a9d0c4df',
          'paragraphPositionCheck': gate, 'independentlyReviewedPages': 4,
          'completePixelFidelityCertified': False, 'microsoftWordCertified': False}
targets = [(0, 'Experimental setup'), (0, 'Record the initial temperature'),
           (0, 'Keep both probes'), (0, 'Read the measurements'),
           (0, 'Figure 1'), (0, 'Figure 2'), (1, 'Recorded temperatures')]
for kind in ['source', 'exported']:
    with pdfplumber.open(root / 'native' / kind / f'{kind}.pdf') as pdf:
        coordinates = {}
        for page_index, phrase in targets:
            hits = pdf.pages[page_index].search(phrase, regex=False)
            assert len(hits) == 1, (kind, phrase)
            coordinates[phrase] = {key: hits[0][key] for key in ['x0', 'top', 'bottom']}
        captures = []
        for page in [1, 2]:
            name = f'native/{kind}/page-{page}.png'
            captures.append({'path': str(root / name), 'sha256': digest(root / name),
                             'equalsInspectedEarlierRun': digest(root / name) == digest(reviewed / name)})
        assert all(item['equalsInspectedEarlierRun'] for item in captures)
        result[kind] = {'pages': len(pdf.pages), 'pageDimensionsPt': [[page.width, page.height] for page in pdf.pages],
                        'targets': coordinates, 'pageImages': captures,
                        'imageBoxes': [[{key: image[key] for key in ['x0', 'top', 'width', 'height']} for image in page.images] for page in pdf.pages]}
result['sourcePageImagesEqualPreviousAudit'] = [digest(root / f'native/source/page-{page}.png') == digest(before / f'native/source/page-{page}.png') for page in [1, 2]]
assert all(result['sourcePageImagesEqualPreviousAudit'])
result['nativeYDeltaPt'] = {phrase: result['exported']['targets'][phrase]['top'] - result['source']['targets'][phrase]['top'] for _, phrase in targets}
result['remainingDifferences'] = ['Figure/caption positioning remains different.', 'Header image and text horizontal placement differs.',
    'Page-two equation/table positioning still needs work.', 'The source-footnote text is absent in this LibreOffice render, while the export displays the retained definition.',
    'Standalone HTML still uses raw equation and linear page-template/page-field fallbacks.']
for engine in ['chromium', 'firefox', 'webkit']:
    old = json.loads((Path('artifacts/docx-native-spacing-real-20261104') / engine / 'edited.json').read_text(encoding='utf-8'))
    new = json.loads((Path('artifacts/docx-settings-real-20261104') / engine / 'edited.json').read_text(encoding='utf-8'))
    assert old == new
result['completeEditedModelsEqualPreviousAudit'] = True
Path('artifacts/docx-settings-native-review-20261104.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'nativeYDeltaPt': result['nativeYDeltaPt'], 'sourcePageImagesEqualPreviousAudit': result['sourcePageImagesEqualPreviousAudit'],
                  'allFinalPagesEqualInspectedRun': True, 'old7PtOffsetCorrectlyRejected': True}, indent=2))
