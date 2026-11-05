from pathlib import Path
from PIL import Image

base = Path('artifacts/code-label-verified-browser-20261104')
out = Path('artifacts/code-label-verified-visual-review-20261104')
for engine, name in [('firefox', 'code-labels-reader.png'), ('mobile-safari', 'code-labels-mobile-reader.png'), ('mobile-chrome', 'code-labels-empty-reader.png')]:
    folder = next(path for path in base.iterdir() if path.name.endswith('-' + engine))
    picture = Image.open(folder / name)
    ratio = picture.width / 390 if engine.startswith('mobile') else 1
    crop = picture.crop((0, 0, picture.width, min(picture.height, round(1600 * ratio))))
    if engine.startswith('mobile'):
        crop = crop.resize((390, round(crop.height / ratio)), Image.Resampling.LANCZOS)
    else:
        crop.thumbnail((900, 1600))
    crop.save(out / (engine + '-' + name))
