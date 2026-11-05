from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import subprocess

root = Path('artifacts/native-resize-semantic-browser-20261105')
out = Path('artifacts/resize-retention-visual-review-20261105')
out.mkdir(exist_ok=True)
captures, recordings, contacts = [], [], []
sheet = Image.new('RGB', (1440, 900), '#e9e9ef')
draw = ImageDraw.Draw(sheet)
for row, engine in enumerate(['chromium', 'firefox', 'webkit']):
    for col, stage in enumerate(['table-resize-announced-and-committed', 'table-resize-undo-exact-document']):
        matches = list(root.glob(f'*{engine}/{stage}.png'))
        assert len(matches) == 1, matches
        path = matches[0]
        im = Image.open(path).convert('RGB'); im.thumbnail((708, 265))
        draw.text((col * 720 + 6, row * 300 + 6), f'{engine}: ' + ('310px committed' if col == 0 else '275px restored'), fill='black')
        sheet.paste(im, (col * 720 + 6, row * 300 + 25))
        captures.append({'path': path.as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    matches = list(root.glob(f'*{engine}/video.webm'))
    assert len(matches) == 1, matches
    video = matches[0]
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', str(video)], text=True).strip())
    sampled = Image.new('RGB', (1600, 960), '#e9e9ef'); labels = ImageDraw.Draw(sampled)
    times = [duration * fraction for fraction in [.15, .40, .65, .85]]
    for i, seconds in enumerate(times):
        frame = out / f'{engine}-frame-{i}.png'
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-threads', '1', '-ss', f'{seconds:.3f}', '-i', str(video),
                        '-frames:v', '1', '-threads', '1', '-y', str(frame)], check=True)
        im = Image.open(frame).convert('RGB'); im.thumbnail((788, 445))
        labels.text(((i % 2) * 800 + 6, (i // 2) * 480 + 6), f'{engine}: {seconds:.2f}s', fill='black')
        sampled.paste(im, ((i % 2) * 800 + 6, (i // 2) * 480 + 25))
    contact = out / f'video-{engine}.png'; sampled.save(contact); contacts.append(contact.as_posix())
    recordings.append({'path': video.as_posix(), 'sha256': hashlib.sha256(video.read_bytes()).hexdigest(),
                       'durationSeconds': duration, 'sampleSeconds': times})
stage_contact = out / 'stages.png'; sheet.save(stage_contact); contacts.insert(0, stage_contact.as_posix())
report = {'stageCaptures': captures, 'recordings': recordings, 'contactSheets': contacts,
          'sampledVideoFrames': 12, 'stageContactsReviewed': False, 'sampledVideoContactsReviewed': False,
          'continuousPlaybackReviewed': False, 'physicalMobileCertified': False}
Path('artifacts/resize-retention-visual-review-20261105.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'captures': len(captures), 'recordings': len(recordings), 'sampledFrames': 12}))
