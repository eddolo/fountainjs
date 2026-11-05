import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

root = Path('artifacts/structural-history-browser-direction-20261105')
out = Path('artifacts/structural-history-visual-review-20261105')
out.mkdir(exist_ok=True)
record = {'stages': [], 'recordings': [], 'contacts': [], 'stageContactsReviewed': False,
          'sampledVideoContactsReviewed': False, 'continuousPlaybackReviewed': False, 'physicalMobileCertified': False}

def reference(path):
    return {'path': path.as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

def contact(paths, target):
    sheet = Image.new('RGB', (1520, ((len(paths) + 1) // 2) * 430), '#e9e9ef')
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(paths):
        image = Image.open(path).convert('RGB')
        image.thumbnail((748, 396))
        x, y = (index % 2) * 760 + 6, (index // 2) * 430 + 25
        sheet.paste(image, (x, y))
        draw.text((x, y - 20), path.name, fill='black')
    sheet.save(target)
    record['contacts'].append(target.as_posix())

for engine in ['chromium', 'firefox', 'webkit']:
    history = next(path.parent for path in root.rglob('history-observations.json') if engine in path.as_posix())
    stages = [history / f'{stage}-{kind}.png' for kind in ['deletion', 'BB'] for stage in ['split', 'undo', 'redo']]
    record['stages'].extend(reference(path) for path in stages)
    contact(stages, out / f'history-{engine}.png')
    wrapped = next(path.parent for path in root.rglob('observations.json') if engine in path.as_posix())
    stages = [wrapped / f'{kind}-{stage}.png' for kind in ['quote-forward', 'task-backward'] for stage in ['selected', 'wrapped', 'reader']]
    record['stages'].extend(reference(path) for path in stages)
    contact(stages, out / f'wrapping-{engine}.png')
    video = wrapped.parent / 'video.webm'
    duration = float(subprocess.check_output(['C:/ProgramData/chocolatey/bin/ffprobe.exe', '-v', 'error',
        '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(video)], text=True))
    frames = []
    times = [duration * fraction for fraction in [.15, .4, .65, .85]]
    for index, time in enumerate(times):
        frame = out / f'{engine}-frame-{index}.png'
        subprocess.run(['C:/ProgramData/chocolatey/bin/ffmpeg.exe', '-v', 'error', '-threads', '1', '-ss', str(time),
            '-i', str(video), '-frames:v', '1', '-threads', '1', '-y', str(frame)], capture_output=True, check=True)
        frames.append(frame)
    record['recordings'].append({**reference(video), 'durationSeconds': duration, 'sampleSeconds': times})
    contact(frames, out / f'video-{engine}.png')

record['sampledVideoFrames'] = 12
Path('artifacts/structural-history-visual-review-20261105.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf8')
print(json.dumps({'stageCaptures': len(record['stages']), 'recordings': len(record['recordings']), 'contacts': len(record['contacts'])}))
