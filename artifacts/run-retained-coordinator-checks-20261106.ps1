$ErrorActionPreference='Stop'
$taskProcess=Get-Process -Id $PID
$taskProcess.PriorityClass='BelowNormal'
$taskProcess.ProcessorAffinity=192
& pnpm exec tsc --noEmit *> artifacts/retained-coordinator-types-20261106.log
$taskTypes=$LASTEXITCODE
@{command='pnpm exec tsc --noEmit';exitCode=$taskTypes;checkedAt=(Get-Date).ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -Encoding utf8 artifacts/retained-coordinator-types-result-20261106.json
if($taskTypes -ne 0){exit $taskTypes}
$checks=@(
  @{Name='full-source';Args=@('exec','vitest','run','--maxWorkers=1','--reporter=json','--outputFile=artifacts/retained-coordinator-full-source-20261106.json');Expected=1},
  @{Name='build';Args=@('build');Expected=0},
  @{Name='api';Args=@('test:api');Expected=0},
  @{Name='headless';Args=@('test:headless');Expected=0},
  @{Name='budget';Args=@('test:budget');Expected=1},
  @{Name='browser';Args=@('exec','playwright','test','--config','artifacts/retained-room-store-browser-20261106.config.ts');Expected=0}
)
$results=@()
foreach($check in $checks){
  Write-Output ('START '+$check.Name)
  $log='artifacts/retained-coordinator-'+$check.Name+'-20261106.log'
  $started=Get-Date
  $checkArgs=$check.Args
  & pnpm @checkArgs *> $log
  $taskExit=$LASTEXITCODE
  $results+=@{check=$check.Name;exitCode=$taskExit;expectedExitCode=$check.Expected;log=$log;seconds=((Get-Date)-$started).TotalSeconds}
  $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/retained-coordinator-checks-20261106.json
  Write-Output ($check.Name+' exit='+$taskExit)
  if($taskExit -ne $check.Expected){Get-Content -LiteralPath $log -Tail 14;exit 1}
}
foreach($mode in @('es','cjs')){
  & node artifacts/retained-coordinator-node-20261106.mjs $mode
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
}
& node artifacts/curate-retained-coordinator-20261106.mjs
exit $LASTEXITCODE
