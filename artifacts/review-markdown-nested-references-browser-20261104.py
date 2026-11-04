from pathlib import Path
import json
import sys
import subprocess
from PIL import Image, ImageDraw

base = Path('artifacts/markdown-nested-references-browser-20261104')
for folder in sorted(base.glob('*/nested-reference-journey')):
    engine = folder.parent.name.rsplit('-', 1)[-1]
    sheet = Image.new('RGB', (1800, 1000), '#eeeeee')
    for index, state in enumerate(['imported', 'edited', 'reopened', 'task-checked']):
        picture = Image.open(folder / (state + '.png')).convert('RGB')
        picture.thumbnail((880, 470))
        x, y = index % 2 * 900, index // 2 * 500
        sheet.paste(picture, (x + 10, y + 25))
        ImageDraw.Draw(sheet).text((x + 10, y + 6), engine + ' / ' + state, fill='black')
    sheet.save(f'artifacts/markdown-nested-references-{engine}-visual-review-20261104.png')
    if '--screenshots-only' in sys.argv:
        continue
    video = folder.parent / 'video.webm'
    duration = float(json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration', '-of', 'json', str(video)], text=True))['format']['duration'])
    sheet = Image.new('RGB', (1440, 1050), '#eeeeee')
    for index, fraction in enumerate([.15, .30, .45, .60, .75, .90]):
        target = folder.parent / f'review-frame-{index}.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-ss', str(duration * fraction),
            '-i', str(video), '-frames:v', '1', '-threads', '1', '-y', str(target)], check=True)
        frame = Image.open(target).convert('RGB')
        frame.thumbnail((700, 320))
        x, y = index % 2 * 720, index // 2 * 350
        sheet.paste(frame, (x + 10, y + 20))
        ImageDraw.Draw(sheet).text((x + 10, y + 4), f'{engine} / {duration * fraction:.2f}s', fill='black')
    sheet.save(f'artifacts/markdown-nested-references-{engine}-recording-review-20261104.png')
    print(engine, duration)
