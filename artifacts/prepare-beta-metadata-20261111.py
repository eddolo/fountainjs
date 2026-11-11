"""Prepare an unapplied release patch without disturbing live browser servers."""
from pathlib import Path
import subprocess

root = Path.cwd()
preview = Path('artifacts/release-metadata-preview-20261111')
old, new = '0.4.0-beta.2', '0.5.0-beta.1'
paths = [
    'package.json',
    'examples/starters/plain-dom/package.json',
    'examples/starters/react/package.json',
    'examples/starters/node/package.json',
    'examples/react-app/src/Developers.tsx',
    'tests/browser/starter-downloads.spec.ts',
    'CHANGELOG.md',
]
patches = []
for name in paths:
    text = (root / name).read_bytes().decode('utf-8')
    if name == 'CHANGELOG.md':
        newline = '\r\n' if '\r\n' in text else '\n'
        prefix = newline.join([
            '# Changelog', '',
            'Unreleased default table-width fix: distinguish omitted Word automatic width',
            "from a new Fountain table's full-width/complete-fixed-grid defaults. DOCX export",
            'reports default-width materialization rather than silently switching sizing',
            'policy on reopen. Native layout certification remains outstanding.', '',
            '## Unreleased', '', '',
        ])
        assert text.startswith(prefix), 'Changelog header changed; review before preparing metadata.'
        replacement = newline.join([
            '# Changelog', '', '## Unreleased', '',
            '## 0.5.0-beta.1 — 2026-11-11', '',
            '- The default `fountainjs-editor/yjs` entry now uses retained storage.',
            '  Existing XML rooms require `fountainjs-editor/yjs/legacy` or an explicit',
            '  migration. Supported Yjs versions start at 13.6.32. Read',
            '  `docs/YJS_DEFAULT_ADOPTION.md` before upgrading a persisted room.', '',
            '- Distinguish omitted Word automatic width from a new Fountain table\'s',
            '  full-width/complete-fixed-grid defaults. DOCX export reports default-width',
            '  materialization rather than silently switching sizing policy on reopen.',
            '  Native layout certification remains outstanding.', '', '',
        ])
        changed = replacement + text[len(prefix):]
    else:
        assert text.count(old) == 1, f'Review version references in {name}.'
        changed = text.replace(old, new)
    target = preview / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(changed.encode('utf-8'))
    result = subprocess.run(['git', 'diff', '--no-index', '--', name, target.as_posix()], capture_output=True)
    if result.returncode != 1:
        raise RuntimeError(f'Could not generate {name}: {result.stderr.decode()}')
    diff = result.stdout.decode('utf-8')
    diff = diff.replace(f'b/{preview.as_posix()}/{name}', f'b/{name}')
    patches.append(diff)

patch = Path('artifacts/beta-metadata-proposal-20261111.patch')
patch.write_bytes(''.join(patches).encode('utf-8'))
print(f'Prepared {patch}; root files remain unchanged.')
