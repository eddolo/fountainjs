$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
Set-Location (Split-Path $PSScriptRoot -Parent)

pnpm exec playwright test --config artifacts/cross-container-browser-20261105.config.ts *> artifacts/cross-container-final-browser-20261105.log
if ($LASTEXITCODE -ne 0) { Get-Content artifacts/cross-container-final-browser-20261105.log -Tail 50; exit $LASTEXITCODE }
Write-Output 'browser: passed'
New-Item -ItemType Directory -Path artifacts/cross-container-tarball-20261105 -Force | Out-Null
pnpm pack --pack-destination artifacts/cross-container-tarball-20261105 *> artifacts/cross-container-pack-20261105.log
if ($LASTEXITCODE -ne 0) { Get-Content artifacts/cross-container-pack-20261105.log -Tail 25; exit $LASTEXITCODE }
& 'C:\Users\cappu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' artifacts/extract-cross-container-package-20261105.py *> artifacts/cross-container-package-20261105.log
if ($LASTEXITCODE -ne 0) { Get-Content artifacts/cross-container-package-20261105.log -Tail 25; exit $LASTEXITCODE }
node artifacts/cross-container-tarball-20261105/consumer/probe.mjs *> artifacts/cross-container-packed-node-20261105.log
if ($LASTEXITCODE -ne 0) { Get-Content artifacts/cross-container-packed-node-20261105.log -Tail 25; exit $LASTEXITCODE }
Write-Output 'actual packed Node ESM/CJS: passed'
node artifacts/measure-loaded-build-size-20261104.mjs . artifacts/cross-container-loaded-size-20261105.json *> artifacts/cross-container-loaded-size-20261105.log
if ($LASTEXITCODE -ne 0) { Get-Content artifacts/cross-container-loaded-size-20261105.log -Tail 25; exit $LASTEXITCODE }
pnpm test:performance *> artifacts/cross-container-performance-20261105.log
$taskPerformanceExit = $LASTEXITCODE
Write-Output "performance: $taskPerformanceExit"
pnpm exec vitest run --maxWorkers=1 --no-file-parallelism *> artifacts/cross-container-final-unit-20261105.log
$taskUnitExit = $LASTEXITCODE
Get-Content artifacts/cross-container-final-unit-20261105.log -Tail 15
@{ browser = 0; packedNode = 0; performance = $taskPerformanceExit; unit = $taskUnitExit } | ConvertTo-Json | Set-Content artifacts/cross-container-final-runtime-checks-20261105.json -Encoding utf8
exit $taskUnitExit
