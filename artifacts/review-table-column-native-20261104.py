import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import pdfplumber

root = Path('artifacts/table-column-precision-native-evidence-20261104/unpacked')
before = Path('artifacts/math-paragraph-native-evidence-20261104/unpacked')
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
w = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
result = {'implementationCommit': '67e685751e6b91ea3f9492856502ec0c93ffbe26',
    'nativeRun': 41774607176, 'nativeJob': 126391935535,
    'archiveSHA256': '01e9d00d022cfe67a8602814b3beaf19161665305036910e51ae1e544b2e33aa',
    'completePixelFidelityCertified': False, 'microsoftWordCertified': False}
for kind in ['source', 'exported']:
    with ZipFile(root / f'{kind}.docx') as package:
        table = ET.fromstring(package.read('word/document.xml')).find('.//' + w + 'tbl')
        columns = [int(item.attrib[w + 'w']) for item in table.find(w + 'tblGrid')]
    with pdfplumber.open(root / f'native/{kind}/{kind}.pdf') as pdf:
        page = pdf.pages[1]
        top_raw = [r for r in page.rects if 260 < r['top'] < 270 and r['width'] > 400 and 24 < r['height'] < 26]
        split_raw = [r for r in page.rects if 285 < r['top'] < 287 and 24 < r['height'] < 26]
        # This PDF paints identical boxes twice. Coalesce only exact matching
        # geometry/color/paint kind, retain raw counts, and reject distinct boxes.
        def unique_boxes(items):
            return list({tuple(r[key] for key in ['x0', 'x1', 'top', 'bottom', 'fill', 'stroke', 'non_stroking_color', 'stroking_color']): r for r in items}.values())
        top = unique_boxes(top_raw)
        split = sorted(unique_boxes(split_raw), key=lambda r: r['x0'])
        assert len(top) == 1 and len(split) == 3, (kind, len(top), len(split))
        result[kind] = {'columnsTwips': columns, 'rawHeaderPaintCounts': [len(top_raw), len(split_raw)],
            'mergedHeader': {key: top[0][key] for key in ['x0', 'x1', 'top', 'width']},
            'columnPaintBoxes': [{key: r[key] for key in ['x0', 'x1', 'top', 'width']} for r in split],
            'pages': len(pdf.pages), 'pageImages': [{'path': str(root / f'native/{kind}/page-{page}.png').replace('\\', '/'),
                'sha256': sha(root / f'native/{kind}/page-{page}.png')} for page in [1, 2]]}
assert result['source']['columnsTwips'] == result['exported']['columnsTwips'] == [3312, 3312, 3312]
result['mergedPaintWidthDeltaPt'] = result['exported']['mergedHeader']['width'] - result['source']['mergedHeader']['width']
assert abs(result['mergedPaintWidthDeltaPt']) <= 0.01
result['individualPaintWidthDeltasPt'] = [b['width'] - a['width'] for a, b in zip(
    result['source']['columnPaintBoxes'], result['exported']['columnPaintBoxes'], strict=True)]
assert all(abs(delta) <= 0.01 for delta in result['individualPaintWidthDeltasPt'])
result['remainingTableXDeltaPt'] = result['exported']['mergedHeader']['x0'] - result['source']['mergedHeader']['x0']
assert all(sha(root / f'native/source/page-{page}.png') == sha(before / f'native/source/page-{page}.png') for page in [1, 2])
assert sha(root / 'native/exported/page-1.png') == sha(before / 'native/exported/page-1.png')
result['sourceRastersAndExportedPageOneUnchanged'] = True
gate = json.loads((root / 'paragraph-position-report.json').read_text())
assert len(gate['scope']) == 11
assert all(abs(value) <= 0.01 for delta in gate['deltasPt'].values() for value in delta.values())
result['existingNativeGate'] = gate
with ZipFile(before / 'exported.docx') as package:
    table = ET.fromstring(package.read('word/document.xml')).find('.//' + w + 'tbl')
    result['actualPreviousGridTwips'] = [int(item.attrib[w + 'w']) for item in table.find(w + 'tblGrid')]
assert result['actualPreviousGridTwips'] == [3315, 3315, 3315]
Path('artifacts/table-column-precision-native-review-20261104.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({key: result[key] for key in ['mergedPaintWidthDeltaPt', 'remainingTableXDeltaPt', 'actualPreviousGridTwips']}, indent=2))
