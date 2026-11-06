$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$probes = @(
  @{ Name = 'cost-candidate'; Args = @('artifacts/retained-read-controlled-cost-20261106.mjs','cursor-overlay-build-20261106','retained-native-plan-cost-candidate-20261106','3','1000,5000,10000') },
  @{ Name = 'work-baseline'; Args = @('artifacts/measure-retained-native-plan-work-20261106.mjs','retained-native-plan-baseline-20261106-build','retained-native-plan-work-baseline-20261106','5000') },
  @{ Name = 'work-candidate'; Args = @('artifacts/measure-retained-native-plan-work-20261106.mjs','cursor-overlay-build-20261106','retained-native-plan-work-candidate-20261106','5000') },
  @{ Name = 'snapshot-baseline'; Args = @('--expose-gc','artifacts/retained-snapshot-cost-20261106.mjs','retained-native-plan-baseline-20261106-build','retained-native-plan-snapshots-baseline-20261106','1000','64') },
  @{ Name = 'peer-baseline'; Args = @('artifacts/retained-peer-cost-20261106.mjs','retained-native-plan-baseline-20261106-build','retained-native-plan-peer-baseline-20261106','1','1000,5000,10000') },
  @{ Name = 'snapshot-candidate'; Args = @('--expose-gc','artifacts/retained-snapshot-cost-20261106.mjs','cursor-overlay-build-20261106','retained-native-plan-snapshots-candidate-20261106','1000','64') },
  @{ Name = 'peer-candidate'; Args = @('artifacts/retained-peer-cost-20261106.mjs','cursor-overlay-build-20261106','retained-native-plan-peer-candidate-20261106','1','1000,5000,10000') },
  @{ Name = 'interop'; Args = @('artifacts/retained-seed-interop-20261106.mjs','retained-native-plan-baseline-20261106-build','cursor-overlay-build-20261106','retained-native-plan-interop-20261106') },
  @{ Name = 'node-es'; Args = @('artifacts/retained-adapter-node-20261106.mjs','es','cursor-overlay-build-20261106','retained-native-plan-node') },
  @{ Name = 'node-cjs'; Args = @('artifacts/retained-adapter-node-20261106.mjs','cjs','cursor-overlay-build-20261106','retained-native-plan-node') },
  @{ Name = 'session-baseline'; Args = @('--expose-gc','artifacts/retained-session-20261106.mjs','1024','retained-native-plan-session-baseline-20261106','retained-native-plan-baseline-20261106-build','3') },
  @{ Name = 'session-candidate'; Args = @('--expose-gc','artifacts/retained-session-20261106.mjs','1024','retained-native-plan-session-candidate-20261106','cursor-overlay-build-20261106','3') },
  @{ Name = 'edit-after'; Args = @('artifacts/profile-retained-edit-20261106.mjs','cursor-overlay-build-20261106','retained-native-plan-edit-after-20261106','5000') },
  @{ Name = 'comparison'; Args = @('artifacts/compare-retained-native-plan-20261106.mjs') },
  @{ Name = 'visual-sources'; Args = @('artifacts/curate-retained-native-plan-20261106.mjs') }
)
foreach ($probe in $probes) {
  $log = 'artifacts/retained-native-plan-' + $probe.Name + '-20261106.log'
  $probeArgs = $probe.Args
  & node @probeArgs *> $log
  $taskExit = $LASTEXITCODE
  Write-Output ($probe.Name + ' exit=' + $taskExit)
  if ($taskExit -ne 0) { Get-Content -LiteralPath $log -Tail 16; exit $taskExit }
}
node -e 'const fs=require("node:fs"),z=require("node:zlib"),p="artifacts/retained-native-plan-edit-after-20261106.cpuprofile";fs.writeFileSync(p+".gz",z.gzipSync(fs.readFileSync(p)));'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node artifacts/analyze-server-html-profile-20261105.mjs artifacts/retained-native-plan-edit-after-20261106.cpuprofile artifacts/retained-native-plan-edit-after-frames-20261106.json *> artifacts/retained-native-plan-edit-after-frames-20261106.log
exit $LASTEXITCODE
