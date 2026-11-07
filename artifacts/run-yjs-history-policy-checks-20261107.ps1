$ErrorActionPreference='Stop'
$taskProcess=Get-Process -Id $PID
$taskProcess.PriorityClass='BelowNormal'
$taskProcess.ProcessorAffinity=192
$checks=@(
  @{Name='types';Args=@('exec','tsc','--noEmit');Expected=0},
  @{Name='focused';Args=@('exec','vitest','run','tests/yjs-history-policy.test.ts','tests/yjs-collaboration.test.ts','tests/yjs-structured-attributes.test.ts','tests/node-ids-yjs.test.ts','tests/collaboration-appended-repair.test.ts','tests/yjs-retained-adapter.test.ts','tests/trailing-editable-block.test.ts','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-history-policy-focused-20261107.json');Expected=0},
  @{Name='full-source';Args=@('exec','vitest','run','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-history-policy-full-source-20261107.json');Expected=1},
  @{Name='build';Args=@('build');Expected=0},
  @{Name='api';Args=@('test:api');Expected=0},
  @{Name='headless';Args=@('test:headless');Expected=0},
  @{Name='budget';Args=@('test:budget');Expected=1}
)
$results=@()
foreach($check in $checks){
  Write-Output ('START '+$check.Name)
  $log='artifacts/yjs-history-policy-'+$check.Name+'-20261107.log'
  $started=Get-Date
  $checkArgs=$check.Args
  & pnpm @checkArgs *> $log
  $taskExit=$LASTEXITCODE
  $results+=@{check=$check.Name;exitCode=$taskExit;expectedExitCode=$check.Expected;log=$log;seconds=((Get-Date)-$started).TotalSeconds}
  $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/yjs-history-policy-checks-20261107.json
  Write-Output ($check.Name+' exit='+$taskExit)
  if($taskExit -ne $check.Expected){Get-Content -LiteralPath $log -Tail 16;exit 1}
}
# Exact source failures and size overruns are verified separately.
exit 0
