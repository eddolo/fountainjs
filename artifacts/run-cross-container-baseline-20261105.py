"""Run the new regressions against the actual parent step, then restore bytes.

Run only with no build/test process reading the worktree. No baseline assertions
are disabled; a failing exit is the expected negative control, not a green gate.
"""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
step = root / 'src/core/transaction/replace-text-range-step.ts'
current = step.read_bytes()
parent = subprocess.check_output(['git', 'show', 'b6fc8e905c6190b90e2091c6c160b78489b1276b:src/core/transaction/replace-text-range-step.ts'], cwd=root)
log = root / 'artifacts/cross-container-parent-baseline-20261105.log'
try:
    step.write_bytes(parent)
    with log.open('wb') as output:
        result = subprocess.run(['cmd.exe', '/d', '/c', 'pnpm exec vitest run tests/cross-container-range.test.ts --maxWorkers=1 --no-file-parallelism'],
                                cwd=root, stdout=output, stderr=subprocess.STDOUT)
finally:
    step.write_bytes(current)
assert step.read_bytes() == current
report = dict(parentCommit='b6fc8e905c6190b90e2091c6c160b78489b1276b', exitCode=result.returncode,
              parentStepSha256=hashlib.sha256(parent).hexdigest(), restoredStepSha256=hashlib.sha256(current).hexdigest(),
              testSha256=hashlib.sha256((root / 'tests/cross-container-range.test.ts').read_bytes()).hexdigest(),
              restoredExactly=True, log=log.relative_to(root).as_posix())
(root / 'artifacts/cross-container-parent-baseline-20261105.json').write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps(report))
assert result.returncode != 0, 'Negative control unexpectedly passed; inspect regression coverage.'
