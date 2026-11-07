$ErrorActionPreference='Stop'
$taskProcess=Get-Process -Id $PID
$taskProcess.PriorityClass='BelowNormal'
$taskProcess.ProcessorAffinity=192
node artifacts/prepare-yjs-admission-baseline-20261107.mjs
if($LASTEXITCODE -ne 0){exit 1}
$checks=@(
 @{Name='types';Args=@('exec','tsc','--noEmit');Expected=0},
 @{Name='before';Args=@('exec','vitest','run','--config','artifacts/yjs-admission-baseline-20261107.config.ts','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-admission-before-20261107.json');Expected=1}
)
$results=@()
foreach($check in $checks){
 $log='artifacts/yjs-admission-'+$check.Name+'-20261107.log';$started=Get-Date;$argsForCheck=$check.Args
 & pnpm @argsForCheck *> $log
 $taskExit=$LASTEXITCODE
 $results+=@{check=$check.Name;exitCode=$taskExit;expectedExitCode=$check.Expected;log=$log;seconds=((Get-Date)-$started).TotalSeconds}
 $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/yjs-admission-baseline-checks-20261107.json
 Write-Output ($check.Name+' exit='+$taskExit)
 if($taskExit -ne $check.Expected){Get-Content $log -Tail 15;exit 1}
}
# The verifier checks the precise initial eighteen-case regression result.
exit 0
