from pathlib import Path
from hashlib import sha256
import json
import shutil
import subprocess
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
inputs = root / 'artifacts/cross-container-native-final-browser-20261105'
output = root / 'artifacts/cross-container-visual-review-20261105'
output.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
def digest(path): return sha256(path.read_bytes()).hexdigest()
def relative(path): return path.relative_to(root).as_posix()

def sheet(cells, columns, width, height, target):
    rows = (len(cells) + columns - 1) // columns
    canvas = Image.new('RGB', (columns * width, rows * height), '#e9e8ee')
    draw = ImageDraw.Draw(canvas)
    for index, (path, label) in enumerate(cells):
        x, y = index % columns * width, index // columns * height
        draw.text((x + 8, y + 5), label, fill='#171328', font=font)
        with Image.open(path) as source:
            source = source.convert('RGB')
            source.thumbnail((width - 12, height - 38))
            canvas.paste(source, (x + 6, y + 31))
    canvas.save(target)

observations = sorted(inputs.rglob('observations.json'))
assert len(observations) == 6
contacts, captures, count = [], [], 0
for path in observations:
    data = json.loads(path.read_text())
    assert data['errors'] == []
    count += len(data['observations'])
    kind = 'attributes' if 'attributes' in path.parent.name else 'range'
    assert len(data['observations']) == (2 if kind == 'attributes' else 6)
    names = sorted(p.name.removesuffix('-selection.png') for p in path.parent.glob('*-selection.png'))
    cells = []
    for name in names:
        for stage in ['selection', 'replaced', 'reader']:
            capture = path.parent / f'{name}-{stage}.png'
            assert capture.exists()
            captures.append(dict(path=relative(capture), sha256=digest(capture)))
            cells.append((capture, f'{name} / {stage}'))
    target = output / f'{data["engine"]}-{kind}-captures.png'
    sheet(cells, 3, 520, 370, target)
    contacts.append(dict(path=relative(target), sha256=digest(target), captures=len(cells)))
assert count == 24 and len(captures) == 72

videos = sorted(inputs.rglob('video.webm'))
assert len(videos) == 6
records = []
for video in videos:
    engine = next(name for name in ['chromium', 'firefox', 'webkit'] if video.parent.name.endswith(name))
    kind = 'attributes' if 'JSON-export' in video.parent.name else 'range'
    raw = subprocess.check_output([shutil.which('ffprobe'), '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'json', str(video)])
    duration = float(json.loads(raw)['format']['duration'])
    cells, samples = [], []
    for index, fraction in enumerate([.08, .20, .32, .44, .56, .68, .80, .92]):
        seconds = duration * fraction
        target = output / f'{engine}-{kind}-frame-{index}.png'
        subprocess.run([shutil.which('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-threads', '1', '-filter_threads', '1',
                        '-ss', str(seconds), '-i', str(video), '-frames:v', '1', '-y', str(target)], check=True)
        cells.append((target, f'{engine} {kind} {seconds:.2f}s'))
        samples.append(dict(seconds=seconds, path=relative(target), sha256=digest(target)))
    target = output / f'{engine}-{kind}-video-contact.png'
    sheet(cells, 4, 360, 250, target)
    records.append(dict(path=relative(video), sha256=digest(video), duration=duration, samples=samples,
                        contact=relative(target), contactSha256=digest(target)))

traces = [dict(path=relative(path), sha256=digest(path)) for path in sorted(inputs.rglob('trace.zip'))]
assert len(traces) == 6
report = dict(nativeCases=count, captures=captures, captureContacts=contacts, videos=records, traces=traces,
              scope='Desktop native input and supported Markdown/JSON file workflows. Contact sheets and eight sampled frames per recording; not every video frame or physical mobile coverage.')
(output / 'index.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps(dict(nativeCases=count, captures=len(captures), videos=len(videos), framesPerVideo=8, output=relative(output))))
