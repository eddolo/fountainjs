$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$probes = @(
  @{ Name = 'cost-baseline'; Args = @('artifacts/retained-read-controlled-cost-20261106.mjs','retained-normalize-paths-baseline-20261106-build','retained-normalize-paths-cost-baseline-20261106','3','1000,5000,10000') },
  @{ Name = 'cost-candidate'; Args = @('artifacts/retained-read-controlled-cost-20261106.mjs','cursor-overlay-build-20261106','retained-normalize-paths-cost-candidate-20261106','3','1000,5000,10000') },
  @{ Name = 'work-baseline'; Args = @('artifacts/measure-retained-normalize-paths-work-20261106.mjs','retained-normalize-paths-baseline-20261106-build','retained-normalize-paths-work-baseline-20261106','5000') },
  @{ Name = 'work-candidate'; Args = @('artifacts/measure-retained-normalize-paths-work-20261106.mjs','cursor-overlay-build-20261106','retained-normalize-paths-work-candidate-20261106','5000') },
  @{ Name = 'snapshot-baseline'; Args = @('--expose-gc','artifacts/retained-snapshot-cost-20261106.mjs','retained-normalize-paths-baseline-20261106-build','retained-normalize-paths-snapshots-baseline-20261106','1000','64') },
  @{ Name = 'peer-baseline'; Args = @('artifacts/retained-peer-cost-20261106.mjs','retained-normalize-paths-baseline-20261106-build','retained-normalize-paths-peer-baseline-20261106','1','1000,5000,10000') },
  @{ Name = 'snapshot-candidate'; Args = @('--expose-gc','artifacts/retained-snapshot-cost-20261106.mjs','cursor-overlay-build-20261106','retained-normalize-paths-snapshots-candidate-20261106','1000','64') },
  @{ Name = 'peer-candidate'; Args = @('artifacts/retained-peer-cost-20261106.mjs','cursor-overlay-build-20261106','retained-normalize-paths-peer-candidate-20261106','1','1000,5000,10000') },
  @{ Name = 'interop'; Args = @('artifacts/retained-seed-interop-20261106.mjs','retained-normalize-paths-baseline-20261106-build','cursor-overlay-build-20261106','retained-normalize-paths-interop-20261106') },
  @{ Name = 'node-es'; Args = @('artifacts/retained-adapter-node-20261106.mjs','es','cursor-overlay-build-20261106','retained-normalize-paths-node') },
  @{ Name = 'node-cjs'; Args = @('artifacts/retained-adapter-node-20261106.mjs','cjs','cursor-overlay-build-20261106','retained-normalize-paths-node') },
  @{ Name = 'session-baseline'; Args = @('--expose-gc','artifacts/retained-session-20261106.mjs','1024','retained-normalize-paths-session-baseline-20261106','retained-normalize-paths-baseline-20261106-build','3') },
  @{ Name = 'session-candidate'; Args = @('--expose-gc','artifacts/retained-session-20261106.mjs','1024','retained-normalize-paths-session-candidate-20261106','cursor-overlay-build-20261106','3') },
  @{ Name = 'edit-after'; Args = @('artifacts/profile-retained-edit-20261106.mjs','cursor-overlay-build-20261106','retained-normalize-paths-edit-after-20261106','5000') },
  @{ Name = 'comparison'; Args = @('artifacts/compare-retained-normalize-paths-20261106.mjs') },
  @{ Name = 'visual-sources'; Args = @('artifacts/curate-retained-normalize-paths-20261106.mjs') }
)
foreach ($probe in $probes) {
  $log = 'artifacts/retained-normalize-paths-' + $probe.Name + '-20261106.log'
  $probeArgs = $probe.Args
  & node @probeArgs *> $log
  $taskExit = $LASTEXITCODE
  Write-Output ($probe.Name + ' exit=' + $taskExit)
  if ($taskExit -ne 0) { Get-Content -LiteralPath $log -Tail 16; exit $taskExit }
}
node -e 'const fs=require("node:fs"),z=require("node:zlib"),p="artifacts/retained-normalize-paths-edit-after-20261106.cpuprofile";fs.writeFileSync(p+".gz",z.gzipSync(fs.readFileSync(p)));'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node artifacts/analyze-server-html-profile-20261105.mjs artifacts/retained-normalize-paths-edit-after-20261106.cpuprofile artifacts/retained-normalize-paths-edit-after-frames-20261106.json *> artifacts/retained-normalize-paths-edit-after-frames-20261106.log
exit $LASTEXITCODE
