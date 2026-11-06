$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$taskStarted = Get-Date
pnpm typecheck *> artifacts/retained-direct-text-manual-types-20261106.log
$taskExit = $LASTEXITCODE
$taskChecks = @(Get-Content -Raw -LiteralPath artifacts/retained-direct-text-checks-20261106.json | ConvertFrom-Json | Where-Object { $_.check -ne 'manual-types' })
$taskChecks += [pscustomobject]@{ check = 'manual-types'; exitCode = $taskExit; expectedExitCode = 0; log = 'artifacts/retained-direct-text-manual-types-20261106.log'; seconds = ((Get-Date) - $taskStarted).TotalSeconds }
$taskChecks | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/retained-direct-text-checks-20261106.json
Write-Output ('manual-types exit=' + $taskExit)
if ($taskExit -ne 0) { Get-Content artifacts/retained-direct-text-manual-types-20261106.log -Tail 16; exit $taskExit }
$probes = @(
  @{ Name = 'cost-candidate'; Args = @('artifacts/retained-read-controlled-cost-20261106.mjs','cursor-overlay-build-20261106','retained-direct-text-cost-candidate-20261106','3','1000,5000,10000') },
  @{ Name = 'counts-candidate'; Args = @('artifacts/measure-retained-node-reads-20261106.mjs','cursor-overlay-build-20261106','retained-direct-text-counts-candidate-20261106','5000') },
  @{ Name = 'interop'; Args = @('artifacts/retained-seed-interop-20261106.mjs','retained-direct-text-baseline-20261106-build','cursor-overlay-build-20261106','retained-direct-text-interop-20261106') },
  @{ Name = 'node-es'; Args = @('artifacts/retained-adapter-node-20261106.mjs','es','cursor-overlay-build-20261106','retained-direct-text-node') },
  @{ Name = 'node-cjs'; Args = @('artifacts/retained-adapter-node-20261106.mjs','cjs','cursor-overlay-build-20261106','retained-direct-text-node') },
  @{ Name = 'session-baseline'; Args = @('--expose-gc','artifacts/retained-session-20261106.mjs','1024','retained-direct-text-session-baseline-20261106','retained-direct-text-baseline-20261106-build','3') },
  @{ Name = 'session-candidate'; Args = @('--expose-gc','artifacts/retained-session-20261106.mjs','1024','retained-direct-text-session-candidate-20261106','cursor-overlay-build-20261106','3') },
  @{ Name = 'edit-after'; Args = @('artifacts/profile-retained-edit-20261106.mjs','cursor-overlay-build-20261106','retained-direct-text-edit-after-20261106','5000') },
  @{ Name = 'comparison'; Args = @('artifacts/compare-retained-direct-text-20261106.mjs') },
  @{ Name = 'visual-sources'; Args = @('artifacts/curate-retained-direct-text-20261106.mjs') }
)
foreach ($probe in $probes) {
  $log = 'artifacts/retained-direct-text-' + $probe.Name + '-20261106.log'
  $probeArgs = $probe.Args
  & node @probeArgs *> $log
  $taskExit = $LASTEXITCODE
  Write-Output ($probe.Name + ' exit=' + $taskExit)
  if ($taskExit -ne 0) { Get-Content -LiteralPath $log -Tail 16; exit $taskExit }
}
node -e 'const fs=require("node:fs"),z=require("node:zlib"),p="artifacts/retained-direct-text-edit-after-20261106.cpuprofile";fs.writeFileSync(p+".gz",z.gzipSync(fs.readFileSync(p)));'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node artifacts/analyze-server-html-profile-20261105.mjs artifacts/retained-direct-text-edit-after-20261106.cpuprofile artifacts/retained-direct-text-edit-after-frames-20261106.json *> artifacts/retained-direct-text-edit-after-frames-20261106.log
exit $LASTEXITCODE
