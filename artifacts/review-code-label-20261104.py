from pathlib import Path
from hashlib import sha256
import json, subprocess
from PIL import Image, ImageDraw

out = Path('artifacts/code-label-visual-review-20261104')
out.mkdir(exist_ok=True)
records = []
for name in ['code-label-pointer-before-browser-20261104', 'code-label-pointer-after-browser-20261104', 'code-label-final-browser-20261104']:
    root = Path('artifacts') / name
    for video in sorted(root.rglob('video.webm')):
        folder = video.parent
        pictures = sorted(folder.rglob('*.png'))
        tiles = []
        for path in pictures:
            picture = Image.open(path).convert('RGB')
            picture.thumbnail((480, 330))
            tile = Image.new('RGB', (500, 365), '#eee')
            tile.paste(picture, ((500 - picture.width) // 2, 30))
            ImageDraw.Draw(tile).text((8, 8), path.name, fill='black')
            tiles.append(tile)
        contact = out / (folder.name + '.png')
        sheet = Image.new('RGB', (1500, max(1, (len(tiles) + 2) // 3) * 365), 'white')
        for index, tile in enumerate(tiles):
            sheet.paste(tile, (index % 3 * 500, index // 3 * 365))
        sheet.save(contact)
        duration = float(json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(video)], text=True))['format']['duration'])
        recording = Image.new('RGB', (1500, 730), '#eee')
        for index, fraction in enumerate([.15, .30, .45, .60, .75, .90]):
            frame_path = out / (folder.name + f'-frame-{index}.png')
            subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-ss', str(duration * fraction), '-i', str(video), '-frames:v', '1', '-threads', '1', '-y', str(frame_path)], check=True)
            frame = Image.open(frame_path).convert('RGB')
            frame.thumbnail((480, 330))
            x, y = index % 3 * 500, index // 3 * 365
            recording.paste(frame, (x + 10, y + 30))
            ImageDraw.Draw(recording).text((x + 10, y + 8), f'{duration * fraction:.2f}s', fill='black')
        recording_path = out / (folder.name + '-recording.png')
        recording.save(recording_path)
        files = []
        for path in sorted(folder.rglob('*')):
            if path.is_file():
                data = path.read_bytes()
                files.append({'path': path.as_posix(), 'bytes': len(data), 'sha256': sha256(data).hexdigest()})
        records.append({'folder': folder.as_posix(), 'captures': len(pictures), 'contact': contact.as_posix(), 'recordingContact': recording_path.as_posix(), 'durationSeconds': duration, 'files': files})
(out / 'index.json').write_bytes(json.dumps(records, indent=2).encode() + b'\n')
print(len(records), 'recordings;', sum(record['captures'] for record in records), 'captures')
