import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
artifacts = root / 'artifacts'
paths = ['.gitattributes', '.github/workflows/ci.yml', 'CHANGELOG.md', 'api-surface.json',
    'docs/SELECTION_RANGES.md', 'docs/STRUCTURAL_FORMATTING_AUDIT.md', 'docs/ROADMAP.md', 'docs/TIPTAP_PARITY.md',
    'src/core/commands.ts', 'src/core/schema/node.ts', 'src/core/schema/block-lineage.ts',
    'src/core/transaction/set-block-type-step.ts', 'src/view/selection-handler.ts', 'src/yjs/index.ts',
    'tests/document-range-formatting.test.ts', 'tests/selection-view.test.ts', 'tests/yjs-document-range.test.ts',
    'tests/browser/editor.spec.ts', 'tests/browser/document-range-formatting-journey.ts',
    'tests/manual/document-range-formatting-real.spec.ts', 'tests/manual/table-column-side-real.spec.ts']
scripts = ['structural-formatting-browser-20261105.config.ts', 'structural-formatting-table-browser-20261105.config.ts',
    'structural-formatting-focus-browser-20261105.config.ts', 'verify-structural-formatting-20261105.ps1',
    'review-structural-formatting-api-20261105.mjs', 'review-structural-formatting-20261105.py',
    'structural-formatting-packed-probe-20261105.mjs', 'run-structural-formatting-packed-20261105.mjs',
    'snapshot-structural-formatting-20261105.py', 'stage-structural-formatting-20261105.py']
reports = ['structural-formatting-checks-20261105.json', 'structural-formatting-api-review-20261105.json',
    'structural-formatting-packed-node-20261105.json', 'structural-formatting-packed-node-20261105.log',
    'structural-formatting-loaded-size-20261105.json', 'structural-formatting-visual-review-20261105.json',
    'structural-formatting-verification-20261105.json']
controls = ['structural-formatting-before-20261105.log', 'structural-formatting-semantic-before-20261105.log',
    'structural-formatting-positions-before-20261105.log', 'structural-formatting-copy-lineage-before-20261105.log',
    'structural-formatting-batch-before-20261105.log', 'structural-formatting-focus-before-20261105.log',
    'structural-formatting-table-before-20261105.log', 'structural-formatting-unit-intermediate-20261105.log',
    'structural-formatting-focus-harness-before-20261105.log',
    'structural-formatting-replay-focus-after-20261105.log']
paths += ['artifacts/' + name for name in scripts + reports + controls]
checks = json.loads((artifacts / 'structural-formatting-checks-20261105.json').read_text(encoding='utf-8-sig'))
assert len(checks) == 17
paths += [check['log'] for check in checks]
for folder in ['structural-formatting-verified-browser-20261105', 'structural-formatting-table-verified-browser-20261105']:
    paths += [path.relative_to(root).as_posix() for path in (artifacts / folder).rglob('*')
        if path.is_file() and path.suffix in ['.json', '.png'] and '.playwright-artifacts' not in str(path) and path.name != '.last-run.json']
review = json.loads((artifacts / 'structural-formatting-visual-review-20261105.json').read_text())
paths += ['artifacts/' + path.replace('\\', '/') for path in review['contactSheets']]
paths = sorted(set(paths))
assert all((root / path).is_file() for path in paths), [path for path in paths if not (root / path).is_file()]
pathspec = artifacts / 'structural-formatting-stage-20261105.paths'
pathspec.write_bytes(b'\0'.join(path.encode() for path in paths) + b'\0')
subprocess.run(['git', '-c', 'core.longpaths=true', 'add', '-f', '--pathspec-from-file=' + str(pathspec), '--pathspec-file-nul'], cwd=root, check=True)
for path in paths:
    if path.endswith(('.json', '.log')) and path.startswith('artifacts/'):
        blob = subprocess.check_output(['git', '-c', 'core.longpaths=true', 'cat-file', 'blob', ':' + path], cwd=root)
        assert blob == (root / path).read_bytes(), path
print(json.dumps({'stagedFiles': len(paths), 'rawArtifactBytesVerified': True}))
