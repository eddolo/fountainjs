import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
source = root / (sys.argv[1] if len(sys.argv) > 1 else 'structural-range-native-verified-browser-20261105')
output = root / (sys.argv[2] if len(sys.argv) > 2 else 'structural-range-visual-review-20261105')
output.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 14)
manifest = {'captures': [], 'recordings': [], 'contactSheets': [], 'inspectionStatus': 'awaiting actual visual inspection'}

def contact(items, target, columns=3):
    cell_width, cell_height = 440, 275
    sheet = Image.new('RGB', (columns * cell_width, math.ceil(len(items) / columns) * cell_height), '#e5e7eb')
    draw = ImageDraw.Draw(sheet)
    for index, (path, label) in enumerate(items):
        image = Image.open(path).convert('RGB')
        image.thumbnail((cell_width - 8, cell_height - 30))
        x, y = index % columns * cell_width, index // columns * cell_height
        sheet.paste(image, (x + 4, y + 24))
        draw.text((x + 4, y + 3), label[:58], fill='#111827', font=font)
    sheet.save(target)
    manifest['contactSheets'].append(str(target.relative_to(root)))

for engine in ['chromium', 'firefox', 'webkit']:
    directory = next(path for path in source.iterdir() if path.is_dir() and '13852' in path.name and path.name.endswith(engine))
    journey = directory / 'document-boundary-range-journey'
    observations = json.loads((journey / 'observations.json').read_text())
    assert len(observations['observations']) == 8
    captures = []
    for item in observations['observations']:
        for stage in ['selected', 'edited', 'reader']:
            path = journey / f"{item['name']}-{stage}.png"
            captures.append((path, f"{engine} {item['name']} {stage}"))
            manifest['captures'].append({'path': str(path.relative_to(root)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    for index in range(0, len(captures), 12):
        contact(captures[index:index + 12], output / f'{engine}-stages-{index // 12 + 1}.png')

for directory in sorted(path for path in source.iterdir() if path.is_dir()):
    video = directory / 'video.webm'
    metadata = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(video)]))
    duration = float(metadata['format']['duration'])
    frames = []
    engine = directory.name.rsplit('-', 1)[-1]
    workflow = 'range' if '13852' in directory.name else 'clipboard'
    for index in range(8):
        position = max(0.0, duration * (index + .5) / 8)
        target = output / f'{engine}-{workflow}-frame-{index + 1}.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-ss', str(position), '-i', str(video),
                        '-frames:v', '1', '-threads', '1', '-y', str(target)], check=True)
        frames.append((target, f'{engine} {workflow} {position:.2f}s'))
    contact(frames, output / f'{engine}-{workflow}-recording.png', columns=4)
    manifest['recordings'].append({'path': str(video.relative_to(root)), 'sha256': hashlib.sha256(video.read_bytes()).hexdigest(),
        'durationSeconds': duration, 'sampledFrames': 8})

(output.with_suffix('.json')).write_text(json.dumps(manifest, indent=2))
print(json.dumps({'captures': len(manifest['captures']), 'recordings': len(manifest['recordings']), 'contacts': manifest['contactSheets']}))
