from pathlib import Path
import shutil
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
image = Image.new('RGB', (400, 60), '#dceeff')
ImageDraw.Draw(image).text((20, 15), 'Selected figure', fill='#17344e', font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 24))
image.save(root / 'tests/fixtures/cross-container-figure.png')
before = root / 'artifacts/cross-container-image-fixture-before-20261105'
before.mkdir(exist_ok=True)
review = root / 'artifacts/cross-container-visual-review-20261105'
for name in ['chromium', 'firefox', 'webkit']:
    target = before / f'{name}-attributes-captures.png'
    if not target.exists():
        shutil.copyfile(review / target.name, target)
if not (before / 'index.json').exists():
    shutil.copyfile(review / 'index.json', before / 'index.json')
