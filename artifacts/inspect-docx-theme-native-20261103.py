import hashlib
import json
from pathlib import Path
import pdfplumber
from PIL import Image

root = Path('artifacts/docx-theme-native-cloud-41720509194')
result = {}
for kind in ['source', 'exported']:
    pages = []
    with pdfplumber.open(root / 'native' / kind / f'{kind}.pdf') as pdf:
        for number, page in enumerate(pdf.pages, 1):
            words = page.extract_words(extra_attrs=['fontname', 'size'])
            targets = [word for word in words if word['text'] in ['Cooling', 'experiment', 'report', 'Experimental', 'setup', 'Record', 'Cooling', 'study', '2026']]
            image_path = root / 'native' / kind / f'page-{number}.png'
            im = Image.open(image_path).convert('RGB')
            dark = sum(1 for red, green, blue in im.crop((50, 35, 500, 95)).getdata() if max(red, green, blue) < 160)
            pages.append({'page': number, 'widthPt': page.width, 'heightPt': page.height,
                          'targets': targets, 'topHeaderBandDarkPixels': dark,
                          'imageSHA256': hashlib.sha256(image_path.read_bytes()).hexdigest()})
    result[kind] = pages
before = Path('artifacts/docx-native-cloud-evidence-20261103/native/source')
result['sourcePageImagesMatchPreviousRun'] = {
    f'page-{number}.png': hashlib.sha256((before / f'page-{number}.png').read_bytes()).hexdigest() == result['source'][number-1]['imageSHA256']
    for number in [1, 2]
}
Path('artifacts/docx-theme-native-font-observations-20261103.json').write_bytes((json.dumps(result, indent=2)+'\n').encode())
for kind in ['source', 'exported']:
    print(kind, [{'page': page['page'], 'headerPixels': page['topHeaderBandDarkPixels'],
                  'targets': [(word['text'], word['fontname'], round(word['size'], 2), round(word['x0'], 2), round(word['top'], 2))
                              for word in page['targets']]} for page in result[kind]])
print('Source images identical to preceding native audit:', result['sourcePageImagesMatchPreviousRun'])
