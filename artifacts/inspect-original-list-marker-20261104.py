"""Read-only inspection of the original and repeated PNGs; no image is edited."""
import hashlib
import json
from pathlib import Path
from PIL import Image

records = []
for engine in ['chromium', 'firefox', 'webkit']:
    original = Path(f'artifacts/docx-spacing-identity-verified-real-20261104/{engine}/entered.png')
    repeated = Path(f'artifacts/list-marker-visibility-verified-real-20261104/{engine}/entered.png')
    before = Image.open(original).convert('RGBA')
    after = Image.open(repeated).convert('RGBA')
    assert before.size == after.size
    scale = before.width // 1176
    assert scale in (1, 2)
    # Same fixed desktop fixture and layout. The empty second item's gutter
    # occupies this region in the full-editor PNG, measured by the DOM probe.
    region = tuple(value * scale for value in (28, 264, 68, 282))
    old_patch, new_patch = before.crop(region), after.crop(region)
    dark = lambda image: sum(1 for y in range(image.height) for x in range(image.width)
                             if max(image.getpixel((x, y))[:3]) < 120 and image.getpixel((x, y))[3] > 200)
    old_dark, new_dark = dark(old_patch), dark(new_patch)
    assert old_dark > 4 and new_dark > 4
    assert old_patch.tobytes() == new_patch.tobytes()
    records.append({
        'engine': engine, 'original': str(original).replace('\\', '/'),
        'repeated': str(repeated).replace('\\', '/'), 'region': region,
        'originalPNG_SHA256': hashlib.sha256(original.read_bytes()).hexdigest(),
        'originalDarkPixels': old_dark, 'repeatedDarkPixels': new_dark,
        'markerPatchRGBAEqual': old_patch.tobytes() == new_patch.tobytes(),
        'originalPatchSHA256': hashlib.sha256(old_patch.tobytes()).hexdigest(),
        'repeatedPatchSHA256': hashlib.sha256(new_patch.tobytes()).hexdigest(),
    })
report = {'purpose': 'Correct the earlier overview-image misreading; no marker rendering fix was applied.', 'records': records}
Path('artifacts/list-marker-original-inspection-20261104.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
