from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image, ImageDraw

root = Path('artifacts/native-focus-regression-browser-20261105')
highlight = Path('artifacts/native-focus-highlight-visual-20261105')
out = Path('artifacts/native-focus-visual-review-20261105')
out.mkdir(exist_ok=True)
captures = []
contacts = []

def only(pattern, directory=root):
    paths = list(directory.glob(pattern))
    assert len(paths) == 1, paths
    return paths[0]

def contact(name, items, columns, tile, top_crop=None):
    sheet = Image.new('RGB', (columns * tile[0], ((len(items) + columns - 1) // columns) * tile[1]), '#e9e9ef')
    draw = ImageDraw.Draw(sheet)
    for i, (label, path) in enumerate(items):
        im = Image.open(path).convert('RGB')
        if top_crop:
            im = im.crop((0, 0, im.width, min(im.height, top_crop(im))))
        im.thumbnail((tile[0] - 12, tile[1] - 30))
        x, y = (i % columns) * tile[0], (i // columns) * tile[1]
        draw.text((x + 6, y + 6), label, fill='black')
        sheet.paste(im, (x + 6, y + 25))
    path = out / name
    sheet.save(path)
    contacts.append(path.as_posix())

engines = ['chromium', 'firefox', 'webkit']
items = [(f'{engine}: {stage}', only(f'*{engine}/{stage}.png', highlight))
         for engine in engines for stage in ['title-selected', 'title-highlighted', 'title-cleared']]
captures.extend(p for _, p in items)
contact('highlight-stages.png', items, 3, (500, 280), lambda im: 520)
for engine in engines:
    items = [(f'{engine}: {case}, {side}', only(f'*{engine}/table-side-{case}-{side}.png'))
             for case in ['ltr', 'rtl-cell-ltr', 'auto', 'host-css', 'rtl-spans'] for side in ['left', 'right']]
    captures.extend(p for _, p in items)
    contact(f'tables-{engine}.png', items, 2, (700, 250))
items = [(f'{engine}: {name}', only(f'*{engine}/{name}.png'))
         for name in ['native-colour-mapped-selection', 'code-click-fountain-edit', 'rtl-editor-desktop'] for engine in engines]
captures.extend(p for _, p in items)
contact('native-controls.png', items, 3, (600, 450))
contact('native-colour-top.png', [(engine, only(f'*{engine}/native-colour-mapped-selection.png')) for engine in engines],
        3, (600, 750), lambda im: round(im.width * 1.15))

videos = []
for engine in engines:
    video = only(f'*{engine}/video.webm', highlight)
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(video)], text=True).strip())
    items = []
    for i, fraction in enumerate([.15, .40, .65, .85]):
        seconds = duration * fraction
        frame = out / f'{engine}-video-{i}.png'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-threads', '1', '-ss', f'{seconds:.3f}', '-i', str(video),
                        '-frames:v', '1', '-threads', '1', '-y', str(frame)], check=True)
        items.append((f'{engine}: {seconds:.2f}s', frame))
    contact(f'video-{engine}.png', items, 2, (800, 480))
    videos.append({'path': video.as_posix(), 'durationSeconds': duration,
                   'sampleSeconds': [duration * fraction for fraction in [.15, .40, .65, .85]],
                   'sha256': hashlib.sha256(video.read_bytes()).hexdigest()})

assert len(set(captures)) == 48
report = {'stageCaptures': [{'path': p.as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in captures],
          'contactSheets': contacts, 'recordings': videos, 'sampledVideoFrames': 12,
          'stageContactsReviewed': False, 'sampledVideoContactsReviewed': False,
          'continuousPlaybackReviewed': False, 'physicalMobileCertified': False}
Path('artifacts/native-focus-visual-review-20261105.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'captures': len(captures), 'recordings': len(videos), 'sampledFrames': 12}))
