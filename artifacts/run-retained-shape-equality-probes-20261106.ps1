$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$probes = @(
  @{ Name = 'interop'; Args = @('artifacts/retained-seed-interop-20261106.mjs','retained-shape-equality-baseline-20261106-build','cursor-overlay-build-20261106','retained-shape-equality-interop-20261106') },
  @{ Name = 'node-es'; Args = @('artifacts/retained-adapter-node-20261106.mjs','es','cursor-overlay-build-20261106','retained-shape-equality-node') },
  @{ Name = 'node-cjs'; Args = @('artifacts/retained-adapter-node-20261106.mjs','cjs','cursor-overlay-build-20261106','retained-shape-equality-node') },
  @{ Name = 'session-baseline'; Args = @('--expose-gc','artifacts/retained-session-20261106.mjs','1024','retained-shape-equality-session-baseline-20261106','retained-shape-equality-baseline-20261106-build','3') },
  @{ Name = 'session-candidate'; Args = @('--expose-gc','artifacts/retained-session-20261106.mjs','1024','retained-shape-equality-session-candidate-20261106','cursor-overlay-build-20261106','3') },
  @{ Name = 'edit-after'; Args = @('artifacts/profile-retained-edit-20261106.mjs','cursor-overlay-build-20261106','retained-shape-equality-edit-after-20261106','5000') },
  @{ Name = 'comparison'; Args = @('artifacts/compare-retained-shape-equality-20261106.mjs') },
  @{ Name = 'visual-sources'; Args = @('artifacts/curate-retained-shape-equality-20261106.mjs') }
)
foreach ($probe in $probes) {
  $log = 'artifacts/retained-shape-equality-' + $probe.Name + '-20261106.log'
  $probeArgs = $probe.Args
  & node @probeArgs *> $log
  $taskExit = $LASTEXITCODE
  Write-Output ($probe.Name + ' exit=' + $taskExit)
  if ($taskExit -ne 0) { Get-Content -LiteralPath $log -Tail 16; exit $taskExit }
}
node -e 'const fs=require("node:fs"),z=require("node:zlib"),p="artifacts/retained-shape-equality-edit-after-20261106.cpuprofile";fs.writeFileSync(p+".gz",z.gzipSync(fs.readFileSync(p)));'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node artifacts/analyze-server-html-profile-20261105.mjs artifacts/retained-shape-equality-edit-after-20261106.cpuprofile artifacts/retained-shape-equality-edit-after-frames-20261106.json *> artifacts/retained-shape-equality-edit-after-frames-20261106.log
exit $LASTEXITCODE
