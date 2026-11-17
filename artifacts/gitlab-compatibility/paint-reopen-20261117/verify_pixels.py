from pathlib import Path
from PIL import Image
import json, math, hashlib, sys

run = Path(__file__).resolve().parent
root = run.parents[2]
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else run / 'pixel-review.json'
if output.exists():
    raise SystemExit('Choose a fresh analysis output; existing evidence is immutable.')
def load(path):
    return json.loads(path.read_text(encoding='utf8'))
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
reports = {side: load(run / (side + '-1') / 'report.json') for side in ['original', 'fountain']}
for key in ['fixtureHash', 'fixture', 'harnessHashes', 'browser', 'backend']:
    assert reports['original'][key] == reports['fountain'][key], key
for key in ['image', 'imageId', 'backendMounts', 'backendEnvironmentHash', 'cpus', 'memory']:
    assert reports['original']['deployment'][key] == reports['fountain']['deployment'][key], key
checks = []
for side, report in reports.items():
    assert report['collectionComplete'] and not report['errors']
    seed_info = report['fixture']['savedReports'][side]
    assert sha(root / seed_info['path']) == seed_info['sha256']
    seed = load(root / seed_info['path'])
    for observation in report['observations']:
        assert observation['status'] == 'observed' and observation['unchangedSource']
        expected = next(item['input']['pastedGraph'] for item in seed['observations'] if item['id'] == observation['input']['id'])
        for capture in observation['captures']:
            assert capture['graphBefore'] == expected == capture['graphAfter']
            assert capture['before']['checkVisibility'] is True
            path = run / (side + '-1') / capture['file']
            image = Image.open(path).convert('RGB')
            rect = capture['before']['headingRect']
            bounds = [math.floor(rect['x']), math.floor(rect['y']), math.ceil(rect['x'] + rect['width']), math.ceil(rect['y'] + rect['height'])]
            heading = image.crop(bounds)
            ink = sum(max(pixel) < 180 for pixel in heading.get_flattened_data())
            assert ink > 0, capture['file']
            rect = capture['before']['root']['rect']
            body_bounds = [math.ceil(rect['x'] + 3), math.ceil(rect['y'] + 3), math.floor(rect['x'] + rect['width'] - 3), math.floor(rect['y'] + rect['height'] - 3)]
            body = image.crop(body_bounds)
            checks.append({'side': side, 'path': path.relative_to(root).as_posix(), 'sha256': sha(path), 'profile': observation['profile'], 'animations': capture['animations'],
                'headingBounds': bounds, 'darkHeadingPixels': ink, 'headingRgbSha256': hashlib.sha256(heading.tobytes()).hexdigest(),
                'documentBounds': body_bounds, 'documentRgbSha256': hashlib.sha256(body.tobytes()).hexdigest(), 'fonts': capture['before']['fonts'], 'checkVisibility': True, 'expectedGraphBeforeAndAfter': True})
result = {'scope': 'Read-only saved-issue capture diagnostic, not additional editor superiority or performance outcomes.',
    'method': 'Decode existing PNG bytes with Pillow, read RGB regions; no images modified. Dark heading pixels corroborate visible text in these controlled captures, not a universal visual threshold.',
    'environmentMatched': True, 'sourceUnchanged': True, 'captures': len(checks),
    'sameEditorDocumentPixels': {side: len({check['documentRgbSha256'] for check in checks if check['side'] == side}) == 1 for side in reports},
    'reports': {side: {'path': (run / (side + '-1') / 'report.json').relative_to(root).as_posix(), 'sha256': sha(run / (side + '-1') / 'report.json')} for side in reports},
    'checks': checks}
output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf8', newline='\n')
print(json.dumps({'captures': len(checks), 'environmentMatched': True, 'sourceUnchanged': True, 'sameEditorDocumentPixels': result['sameEditorDocumentPixels']}))
