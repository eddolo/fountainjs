$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$probes = @(
 @{ Name='node-es'; Args=@('artifacts/retained-checkpoint-node-20261106.mjs','es') },
 @{ Name='node-cjs'; Args=@('artifacts/retained-checkpoint-node-20261106.mjs','cjs','artifacts/retained-checkpoint-es-packet-20261106.json') },
 @{ Name='node-es-interop'; Args=@('artifacts/retained-checkpoint-node-20261106.mjs','es','artifacts/retained-checkpoint-cjs-packet-20261106.json','interop-only') },
 @{ Name='large'; Args=@('--expose-gc','artifacts/retained-checkpoint-large-20261106.mjs') },
 @{ Name='release'; Args=@('--expose-gc','artifacts/retained-checkpoint-release-20261106.mjs') },
 @{ Name='oracle'; Args=@('artifacts/reproduce-yjs-utf16-loss-20261106.mjs') },
 @{ Name='visuals'; Args=@('artifacts/curate-retained-checkpoint-20261106.mjs') }
)
foreach ($probe in $probes) {
 $probeArgs=$probe.Args
 $log='artifacts/retained-checkpoint-'+$probe.Name+'-20261106.log'
 & node @probeArgs *> $log
 $taskExit=$LASTEXITCODE
 Write-Output ($probe.Name+' exit='+$taskExit)
 if ($taskExit -ne 0) { Get-Content -LiteralPath $log -Tail 12; exit $taskExit }
}
