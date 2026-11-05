"""Stage the explicit dated evidence without Windows command-line length limits."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
names = [
    'create-cross-container-figure-20261105.py', 'extract-cross-container-package-20261105.py',
    'review-cross-container-20261105.py', 'snapshot-cross-container-20261105.py', 'stage-cross-container-20261105.py',
    'run-cross-container-baseline-20261105.py', 'run-cross-container-checks-20261105.ps1', 'run-cross-container-final-20261105.ps1',
    'cross-container-packed-probe-20261105.mjs', 'cross-container-browser-20261105.config.ts',
    'cross-container-verification-20261105.json', 'cross-container-final-checks-20261105.json',
    'cross-container-final-runtime-checks-20261105.json', 'cross-container-parent-baseline-20261105.json',
    'cross-container-package-20261105.json', 'cross-container-loaded-size-20261105.json', 'cross-container-retention-checks-20261105.json',
    'cross-container-source-paths-20261105.txt', 'cross-container-pr-body-20261105.md',
    'cross-container-parent-baseline-20261105.log', 'cross-container-attribute-control-20261105.log',
    'cross-container-policy-fixture-browser-20261105.log', 'cross-container-packed-scope-control-20261105.log',
    'cross-container-packed-node-20261105.log', 'cross-container-performance-20261105.log',
    'cross-container-retention-position-mapping-20261105.log', 'cross-container-retention-shared-direction-20261105.log',
    'cross-container-units-20261105.log',
]
names += [f'cross-container-final-{name}-20261105.log' for name in
          ['api', 'browser', 'budget', 'build', 'conformance', 'headless', 'package', 'site', 'tsc', 'types', 'unit', 'worker']]
paths = [root / 'artifacts' / name for name in names]
paths += [path for path in (root / 'artifacts/cross-container-native-final-browser-20261105').rglob('*')
          if path.is_file() and path.suffix in ['.md', '.json', '.png'] and path.name != '.last-run.json']
paths += [path for path in (root / 'artifacts/cross-container-visual-review-20261105').iterdir()
          if path.name == 'index.json' or path.name.endswith(('-captures.png', '-video-contact.png'))]
paths += [path for path in (root / 'artifacts/cross-container-image-fixture-before-20261105').iterdir() if path.is_file()]
paths += [path for path in (root / 'artifacts/cross-container-final-browser-20261105').rglob('*')
          if path.is_file() and path.name in ['error-context.md', 'different-quote-direction-original.md', 'test-failed-1.png']]
assert all(path.is_file() and path.is_relative_to(root) for path in paths)
manifest = root / 'artifacts/cross-container-staging-paths-20261105.nul'
manifest.write_bytes(b'\0'.join(path.relative_to(root).as_posix().encode() for path in paths) + b'\0')
subprocess.run(['git', 'add', '-f', '--pathspec-from-file=' + str(manifest), '--pathspec-file-nul'], cwd=root, check=True)
print(f'Staged {len(paths)} explicit dated artifact paths.')
