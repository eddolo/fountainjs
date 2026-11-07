$ErrorActionPreference='Stop'
$taskProcess=Get-Process -Id $PID
$taskProcess.PriorityClass='BelowNormal'
$taskProcess.ProcessorAffinity=192
$checks=@(
  @{Name='types';Args=@('exec','tsc','--noEmit');Expected=0},
  @{Name='focused';Args=@('exec','vitest','run','tests/yjs-namespace-migration.test.ts','tests/yjs-legacy-migration.test.ts','tests/yjs-cross-format-handoff.test.ts','tests/yjs-retained-migration.test.ts','tests/yjs-retained-checkpoint.test.ts','tests/yjs-retained-room-store.test.ts','tests/yjs-retained-room-coordinator.test.ts','tests/yjs-retained-handoff.test.ts','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-namespace-focused-20261107.json');Expected=0},
  @{Name='full-source';Args=@('exec','vitest','run','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-namespace-full-source-20261107.json');Expected=1},
  @{Name='build';Args=@('build');Expected=0},
  @{Name='api';Args=@('test:api');Expected=0},
  @{Name='headless';Args=@('test:headless');Expected=0},
  @{Name='budget';Args=@('test:budget');Expected=1}
)
$results=@()
foreach($check in $checks){
  Write-Output ('START '+$check.Name)
  $log='artifacts/yjs-namespace-'+$check.Name+'-20261107.log'
  $started=Get-Date
  $checkArgs=$check.Args
  & pnpm @checkArgs *> $log
  $taskExit=$LASTEXITCODE
  $results+=@{check=$check.Name;exitCode=$taskExit;expectedExitCode=$check.Expected;log=$log;seconds=((Get-Date)-$started).TotalSeconds}
  $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/yjs-namespace-checks-20261107.json
  Write-Output ($check.Name+' exit='+$taskExit)
  if($taskExit -ne $check.Expected){Get-Content -LiteralPath $log -Tail 16;exit 1}
}
# Exact required failures, identical public bytes and size overruns are verified separately.
exit 0
