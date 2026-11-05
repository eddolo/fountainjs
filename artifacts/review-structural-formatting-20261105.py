import hashlib
import json
import math
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
output = root / 'structural-formatting-visual-review-20261105'
output.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 14)
manifest = {'captures': [], 'recordings': [], 'contactSheets': [], 'inspectionStatus': 'awaiting actual visual inspection'}

def contact(items, target):
    width, height = 440, 275
    sheet = Image.new('RGB', (width * 3, height * math.ceil(len(items) / 3)), '#e5e7eb')
    draw = ImageDraw.Draw(sheet)
    for index, (path, label) in enumerate(items):
        image = Image.open(path).convert('RGB')
        image.thumbnail((width - 8, height - 30))
        x, y = index % 3 * width, index // 3 * height
        sheet.paste(image, (x + 4, y + 24))
        draw.text((x + 4, y + 3), label[:59], fill='#111827', font=font)
    sheet.save(target)
    manifest['contactSheets'].append(str(target.relative_to(root)))

for kind, folder in [('formatting', 'structural-formatting-verified-browser-20261105'),
                     ('table', 'structural-formatting-table-verified-browser-20261105')]:
    source = root / folder
    for engine in ['chromium', 'firefox', 'webkit']:
        directories = sorted(path for path in source.iterdir() if path.is_dir() and path.name.endswith(engine))
        assert len(directories) == (1 if kind == 'formatting' else 5)
        captures, frames = [], []
        for sequence, directory in enumerate(directories):
            if kind == 'formatting':
                report = json.loads((directory / 'range-formatting/observations.json').read_text())
                assert len(report['observations']) == 2 and not report['errors']
                paths = sorted((directory / 'range-formatting').glob('*.png'))
            else:
                report = json.loads(next((directory / 'attachments').glob('table-side-observations-*.json')).read_text())
                assert len(report['observations']) == 2 and not report['errors']
                paths = sorted(directory.glob('table-side-*.png'))
            assert len(paths) == (6 if kind == 'formatting' else 2)
            for path in paths:
                captures.append((path, f'{engine} {sequence + 1} {path.stem}'))
                manifest['captures'].append({'path': str(path.relative_to(root)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
            video = directory / 'video.webm'
            metadata = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(video)]))
            duration = float(metadata['format']['duration'])
            for index in range(4):
                position = duration * (index + .5) / 4
                target = output / f'{engine}-{kind}-{sequence + 1}-frame-{index + 1}.png'
                subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-ss', str(position), '-i', str(video),
                    '-frames:v', '1', '-threads', '1', '-y', str(target)], check=True)
                frames.append((target, f'{engine} {kind} case {sequence + 1}: {position:.2f}s'))
            manifest['recordings'].append({'path': str(video.relative_to(root)), 'sha256': hashlib.sha256(video.read_bytes()).hexdigest(),
                'durationSeconds': duration, 'sampledFrames': 4})
        contact(captures, output / f'{engine}-{kind}-stages.png')
        for index in range(0, len(frames), 8):
            contact(frames[index:index + 8], output / f'{engine}-{kind}-recordings-{index // 8 + 1}.png')

assert len(manifest['captures']) == 48 and len(manifest['recordings']) == 18
output.with_suffix('.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'captures': len(manifest['captures']), 'recordings': len(manifest['recordings']), 'contactSheets': manifest['contactSheets']}))
