import hashlib
import json
from pathlib import Path
import pdfplumber
from PIL import Image, ImageChops

root = Path('artifacts/image-paragraph-native-evidence-20261104/unpacked')
previous = Path('artifacts/docx-settings-gate-evidence-20261104/unpacked')
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
targets = [(0, 'Experimental setup'), (0, 'Record the initial temperature'),
           (0, 'Keep both probes'), (0, 'Read the measurements'),
           (0, 'Figure 1'), (0, 'Figure 2'), (1, 'Recorded temperatures')]
result = {'implementationCommit': 'e5fb6c5', 'nativeRun': 41768523557,
          'nativeJob': 126372505737,
          'archiveSHA256': 'bcb3b3215fdff08497667ef6562304d7f5bec7b0e4a2646ff09eedb2f6b8dc86',
          'independentlyReviewedPages': 4,
          'completePixelFidelityCertified': False, 'microsoftWordCertified': False}
for kind in ['source', 'exported']:
    with pdfplumber.open(root / 'native' / kind / f'{kind}.pdf') as pdf:
        coordinates = {}
        for page_index, phrase in targets:
            hits = pdf.pages[page_index].search(phrase, regex=False)
            assert len(hits) == 1, (kind, phrase)
            coordinates[phrase] = {key: hits[0][key] for key in ['x0', 'top', 'bottom']}
        result[kind] = {'pages': len(pdf.pages), 'targets': coordinates,
            'imageBoxes': [[{key: image[key] for key in ['x0', 'top', 'width', 'height']} for image in page.images] for page in pdf.pages],
            'pageImages': [{'path': str(root / f'native/{kind}/page-{page}.png'),
                'sha256': digest(root / f'native/{kind}/page-{page}.png')} for page in [1, 2]]}
result['deltasPt'] = {phrase: {axis: result['exported']['targets'][phrase][axis] - result['source']['targets'][phrase][axis]
    for axis in ['x0', 'top']} for _, phrase in targets}
# This profile must retain the existing heading/instruction coordinates and
# remove the independently observed caption offsets, without widening 0.01 pt.
for _, phrase in targets[:6]:
    assert all(abs(value) < 0.01 for value in result['deltasPt'][phrase].values()), (phrase, result['deltasPt'][phrase])
assert all(digest(root / f'native/source/page-{page}.png') == digest(previous / f'native/source/page-{page}.png') for page in [1, 2])
old = {}
with pdfplumber.open(previous / 'native/exported/exported.pdf') as pdf:
    for phrase in ['Figure 1', 'Figure 2']:
        hit = pdf.pages[0].search(phrase, regex=False)
        assert len(hit) == 1
        old[phrase] = hit[0]['top'] - result['source']['targets'][phrase]['top']
assert abs(old['Figure 1'] + 3.2) < 0.01 and abs(old['Figure 2'] + 6.4) < 0.01
result['actualPreviousCaptionErrorsPt'] = old
result['sourcePageImagesUnchanged'] = True
result['rasterDifferences'] = []
for page in [1, 2]:
    a = Image.open(root / f'native/source/page-{page}.png').convert('RGB')
    b = Image.open(root / f'native/exported/page-{page}.png').convert('RGB')
    assert a.size == b.size
    delta = ImageChops.difference(a, b)
    record = {'page': page, 'sizePixels': list(a.size), 'differenceBounds': delta.getbbox()}
    if page == 1:
        # Fixed inspection region selected from the independent page geometry:
        # below the header, above the footer. Never move it to hide a mismatch.
        region = (0, 100, 1020, 1220)
        record['bodyRegionPixels'] = region
        record['bodyExactlyEqual'] = ImageChops.difference(a.crop(region), b.crop(region)).getbbox() is None
    result['rasterDifferences'].append(record)
result['remainingScope'] = ['Header placement and title raster differences', 'Page-two table/equation positioning', 'Footnote rendering differences',
    'HTML math/page-template fallbacks', 'Unsupported composite contextual image flow', 'Size/timing/release acceptance']
Path('artifacts/image-paragraph-native-review-20261104.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'deltasPt': result['deltasPt'], 'actualPreviousCaptionErrorsPt': old}, indent=2))
