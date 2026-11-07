param([switch]$AfterTypeOnlyRepair)
$ErrorActionPreference='Stop'
$taskProcess=Get-Process -Id $PID
$taskProcess.PriorityClass='BelowNormal'
$taskProcess.ProcessorAffinity=192
$checks=@(
  @{Name='types';Args=@('exec','tsc','--noEmit');Expected=0},
  @{Name='focused';Args=@('exec','vitest','run','tests/collaboration-appended-repair.test.ts','tests/yjs-retained-adapter.test.ts','tests/node-ids-yjs.test.ts','tests/trailing-editable-block.test.ts','tests/collaboration.test.ts','tests/core.test.ts','--maxWorkers=1','--reporter=json','--outputFile=artifacts/retained-repair-focused-20261107.json');Expected=0},
  @{Name='adoption';Args=@('exec','vitest','run','--config','artifacts/retained-adoption-20261107.config.ts','--maxWorkers=1','--reporter=json','--outputFile=artifacts/retained-adoption-after-20261107.json');Expected=1},
  @{Name='full-source';Args=@('exec','vitest','run','--maxWorkers=1','--reporter=json','--outputFile=artifacts/retained-repair-full-source-20261107.json');Expected=1},
  @{Name='build';Args=@('build');Expected=0},
  @{Name='api';Args=@('test:api');Expected=0},
  @{Name='headless';Args=@('test:headless');Expected=0},
  @{Name='budget';Args=@('test:budget');Expected=1}
)
$order=@($checks | ForEach-Object {$_.Name})
$results=@()
if($AfterTypeOnlyRepair){
  $results=@(Get-Content -Raw artifacts/retained-repair-checks-20261107.json | ConvertFrom-Json)
  $checks=@($checks | Where-Object {$_.Name -in @('types','build','api','headless','budget')})
}
foreach($check in $checks){
  Write-Output ('START '+$check.Name)
  $log='artifacts/retained-repair-'+$check.Name+'-20261107.log'
  $started=Get-Date
  $checkArgs=$check.Args
  & pnpm @checkArgs *> $log
  $taskExit=$LASTEXITCODE
  $results=@($results | Where-Object {$_.check -ne $check.Name})
  $results+=@{check=$check.Name;exitCode=$taskExit;expectedExitCode=$check.Expected;log=$log;seconds=((Get-Date)-$started).TotalSeconds}
  $results=@($results | Sort-Object {$order.IndexOf($_.check)})
  $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/retained-repair-checks-20261107.json
  Write-Output ($check.Name+' exit='+$taskExit)
  if($taskExit -ne $check.Expected){Get-Content -LiteralPath $log -Tail 16;exit 1}
}
# The evidence verifier checks exact failures, not merely nonzero statuses.
exit 0
