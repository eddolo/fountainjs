$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$checks = @(
  @{ Name='types'; Args=@('exec','tsc','--noEmit'); Expected=0 },
  @{ Name='full-source'; Args=@('exec','vitest','run','--maxWorkers=1','--reporter=json','--outputFile=artifacts/retained-room-store-full-source-20261106.json'); Expected=1 },
  @{ Name='build'; Args=@('build'); Expected=0 },
  @{ Name='api'; Args=@('test:api'); Expected=0 },
  @{ Name='headless'; Args=@('test:headless'); Expected=0 },
  @{ Name='budget'; Args=@('test:budget'); Expected=1 }
)
$results = @()
foreach ($check in $checks) {
  $log = 'artifacts/retained-room-store-' + $check.Name + '-20261106.log'
  Write-Output ('START ' + $check.Name)
  $started=Get-Date
  $checkArgs=$check.Args
  & pnpm @checkArgs *> $log
  $taskExit=$LASTEXITCODE
  $results += @{check=$check.Name;exitCode=$taskExit;expectedExitCode=$check.Expected;log=$log;seconds=((Get-Date)-$started).TotalSeconds}
  $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/retained-room-store-checks-20261106.json
  Write-Output ($check.Name + ' exit=' + $taskExit)
  if ($taskExit -ne $check.Expected) { Get-Content -LiteralPath $log -Tail 16; exit 1 }
}
foreach ($mode in @('es','cjs')) {
  & node artifacts/retained-room-store-node-20261106.mjs $mode
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& node artifacts/curate-retained-room-store-20261106.mjs
exit $LASTEXITCODE
