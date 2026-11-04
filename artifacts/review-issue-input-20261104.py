from pathlib import Path
import json
import subprocess
import sys
from PIL import Image, ImageDraw

base = Path('artifacts/issue-input-production-browser-20261104' if '--production' in sys.argv else 'artifacts/issue-input-final-regression-browser-20261104')
out = Path('artifacts/issue-input-production-visual-review-20261104' if '--production' in sys.argv else 'artifacts/issue-input-visual-review-20261104')
out.mkdir(exist_ok=True)
records = []
for folder in sorted(p for p in base.iterdir() if p.is_dir()):
    pictures = sorted(folder.rglob('*.png'))
    tiles = []
    for path in pictures:
        picture = Image.open(path).convert('RGB')
        if 'mobile' in path.name and picture.width > 500:
            picture = picture.resize((390, round(picture.height * 390 / picture.width)))
        starts = range(0, picture.height, 1100) if picture.width < 500 else [0]
        for start in starts:
            crop = picture.crop((0, start, picture.width, min(start + 1100, picture.height))) if picture.width < 500 else picture
            crop.thumbnail((800, 1300))
            tile = Image.new('RGB', (820, crop.height + 35), '#eeeeee')
            tile.paste(crop, ((820 - crop.width) // 2, 30))
            ImageDraw.Draw(tile).text((10, 7), path.name + (f' y={start}' if picture.width < 500 else ''), fill='black')
            tiles.append(tile)
    rows = [tiles[index:index + 2] for index in range(0, len(tiles), 2)]
    sheet = Image.new('RGB', (1640, sum(max(tile.height for tile in row) for row in rows)), 'white')
    y = 0
    for row in rows:
        for index, tile in enumerate(row):
            sheet.paste(tile, (index * 820, y))
        y += max(tile.height for tile in row)
    contact = out / (folder.name + '.png')
    sheet.save(contact)
    if '--captures-only' in sys.argv:
        continue
    video = folder / 'video.webm'
    duration = float(json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(video)], text=True))['format']['duration'])
    recording = Image.new('RGB', (1640, 3 * 485), '#eeeeee')
    fractions = [.15, .30, .45, .60, .75, .90]
    for index, fraction in enumerate(fractions):
        target = out / (folder.name + f'-frame-{index}.png')
        subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-ss', str(duration * fraction), '-i', str(video), '-frames:v', '1', '-threads', '1', '-y', str(target)], check=True)
        frame = Image.open(target).convert('RGB')
        frame.thumbnail((800, 450))
        x, y = index % 2 * 820, index // 2 * 485
        recording.paste(frame, (x + 10, y + 25))
        ImageDraw.Draw(recording).text((x + 10, y + 6), f'{duration * fraction:.2f}s', fill='black')
    recording_path = out / (folder.name + '-recording.png')
    recording.save(recording_path)
    records.append({'journey': folder.name, 'sourceImages': [str(p).replace('\\', '/') for p in pictures], 'contact': str(contact).replace('\\', '/'), 'video': str(video).replace('\\', '/'), 'durationSeconds': duration, 'sampleFractions': fractions, 'recordingContact': str(recording_path).replace('\\', '/')})
if '--captures-only' not in sys.argv:
    (out / 'capture-index.json').write_bytes(json.dumps(records, indent=2).encode() + b'\n')
    print(f'{len(records)} recordings sampled; {sum(len(row["sourceImages"]) for row in records)} captures laid out.')
