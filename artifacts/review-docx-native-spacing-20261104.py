import hashlib
import json
from pathlib import Path
import pdfplumber

root = Path('artifacts/docx-native-spacing-native-evidence-20261104/unpacked')
previous = Path('artifacts/list-layout-native-evidence-20261103')
phrases = ['Cooling experiment report', 'Experimental setup',
           'Record the initial temperature before starting the timer.',
           'Keep both probes at the same depth.',
           'Read the measurements without moving either vessel.']
result = {'nativeRun': 41761593707, 'sourceCommit': 'b2d04c6f9e1f625b38baf90d83f7a21dd6dbc7ef',
          'archiveSHA256': 'cd9a9b69fbf1e71edbda227fac637fdaff6be0e09184de8616bf60c262b9cf70',
          'visualReview': {'nativePageImagesInspected': 4, 'browserImportedAndReopenedImagesInspected': 6,
                           'standaloneHTMLReaderImagesInspected': 3, 'completePixelFidelityCertified': False}}
for kind in ['source', 'exported']:
    with pdfplumber.open(root / 'native' / kind / f'{kind}.pdf') as pdf:
        targets = {}
        for phrase in phrases:
            hits = pdf.pages[0].search(phrase, regex=False)
            if len(hits) != 1:
                raise RuntimeError(f'Expected exactly one native phrase: {kind}: {phrase}')
            hit = hits[0]
            targets[phrase] = {'x0': hit['x0'], 'top': hit['top'], 'bottom': hit['bottom'],
                               'fonts': sorted({char['fontname'] for char in hit['chars']}),
                               'sizes': sorted({round(char['size'], 6) for char in hit['chars']})}
        result[kind] = {'pages': len(pdf.pages), 'pageDimensionsPt': [[page.width, page.height] for page in pdf.pages], 'targets': targets,
                        'pageImageSHA256': [hashlib.sha256((root / 'native' / kind / f'page-{number}.png').read_bytes()).hexdigest() for number in [1, 2]]}
result['sourcePageImagesEqualPreviousAudit'] = [
    hashlib.sha256((previous / 'native/source' / f'page-{number}.png').read_bytes()).hexdigest() == result['source']['pageImageSHA256'][number - 1] for number in [1, 2]]
instructions = phrases[2:]
result['instructionXDeltaPt'] = [result['exported']['targets'][text]['x0'] - result['source']['targets'][text]['x0'] for text in instructions]
result['instructionYDeltaPt'] = [result['exported']['targets'][text]['top'] - result['source']['targets'][text]['top'] for text in instructions]
result['instructionStepPt'] = {kind: [result[kind]['targets'][instructions[index + 1]]['top'] - result[kind]['targets'][instructions[index]]['top'] for index in [0, 1]] for kind in ['source', 'exported']}
assert all(abs(value) < 0.001 for value in result['instructionXDeltaPt'])
assert all(abs(a - b) < 0.001 for a, b in zip(result['instructionStepPt']['source'], result['instructionStepPt']['exported']))
result['remainingDifferences'] = [
    'Instruction list and setup heading retain a common vertical offset; the cumulative extra per-item gap is repaired.',
    'Header horizontal placement differs.',
    'Figure/table/other paragraph positioning still differs; this fixture is not a whole-document layout match.',
    'Source footnote text is absent in this LibreOffice rendering, while the export displays its retained definition.',
    'Standalone HTML still displays raw equation source and linear template/page-field fallbacks.'
]
for engine in ['chromium', 'firefox', 'webkit']:
    before = json.loads((Path('artifacts/docx-spacing-identity-real-20261104') / engine / 'edited.json').read_text(encoding='utf-8'))
    after = json.loads((Path('artifacts/docx-native-spacing-real-20261104') / engine / 'edited.json').read_text(encoding='utf-8'))
    result.setdefault('completeEditedModelsEqualPreviousAudit', {})[engine] = before == after
Path('artifacts/docx-native-spacing-native-review-20261104.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: result[key] for key in ['instructionXDeltaPt', 'instructionYDeltaPt', 'instructionStepPt', 'sourcePageImagesEqualPreviousAudit', 'completeEditedModelsEqualPreviousAudit']}, indent=2))
