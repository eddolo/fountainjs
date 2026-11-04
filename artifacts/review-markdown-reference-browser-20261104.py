from pathlib import Path
import json
import subprocess
from PIL import Image, ImageDraw

base = Path('artifacts/markdown-reference-boundaries-browser-20261104')
contact = Image.new('RGB', (2100, 1200), '#eeeeee')
for row, folder in enumerate(sorted(base.glob('*/reference-boundary-journey'))):
    for column, state in enumerate(['imported', 'edited', 'redone']):
        picture = Image.open(folder / (state + '.png')).convert('RGB')
        picture.thumbnail((680, 370))
        x, y = column * 700, row * 400
        contact.paste(picture, (x + 10, y + 25))
        ImageDraw.Draw(contact).text((x + 10, y + 6), folder.parent.name.rsplit('-', 1)[-1] + ' / ' + state, fill='black')
contact.save('artifacts/markdown-reference-boundaries-visual-review-20261104.png')
if '--screenshots-only' in __import__('sys').argv:
    raise SystemExit(0)
for folder in sorted(base.glob('*/reference-boundary-journey')):
    engine = folder.parent.name.rsplit('-', 1)[-1]
    video = folder.parent / 'video.webm'
    duration = float(json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration', '-of', 'json', str(video)], text=True))['format']['duration'])
    sheet = Image.new('RGB', (1440, 900), '#eeeeee')
    for index, fraction in enumerate([.15, .30, .45, .60, .75, .90]):
        target = folder.parent / f'review-frame-{index}.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-ss', str(duration * fraction),
            '-i', str(video), '-frames:v', '1', '-threads', '1', '-y', str(target)], check=True)
        frame = Image.open(target).convert('RGB')
        frame.thumbnail((700, 275))
        x, y = index % 2 * 720, index // 2 * 300
        sheet.paste(frame, (x + 10, y + 20))
        ImageDraw.Draw(sheet).text((x + 10, y + 4), f'{engine} / {duration * fraction:.2f}s', fill='black')
    sheet.save(f'artifacts/markdown-reference-boundaries-{engine}-recording-review-20261104.png')
    print(engine, duration)
