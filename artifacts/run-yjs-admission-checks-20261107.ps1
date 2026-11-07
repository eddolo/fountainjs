$ErrorActionPreference='Stop'
$taskProcess=Get-Process -Id $PID
$taskProcess.PriorityClass='BelowNormal'
$taskProcess.ProcessorAffinity=192
$results=@()
$checks=@(
 @{Name='node-es';Command='node';Args=@('artifacts/yjs-admission-node-20261107.mjs','es');Expected=0},
 @{Name='node-cjs';Command='node';Args=@('artifacts/yjs-admission-node-20261107.mjs','cjs');Expected=0},
 @{Name='curate';Command='node';Args=@('artifacts/curate-yjs-admission-20261107.mjs');Expected=0},
 @{Name='full-source';Command='pnpm';Args=@('exec','vitest','run','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-admission-full-source-20261107.json');Expected=1},
 @{Name='build';Command='pnpm';Args=@('build');Expected=0},
 @{Name='api';Command='pnpm';Args=@('test:api');Expected=0},
 @{Name='headless';Command='pnpm';Args=@('test:headless');Expected=0},
 @{Name='budget';Command='pnpm';Args=@('test:budget');Expected=1}
)
foreach($check in $checks){
 Write-Output ('START '+$check.Name)
 $log='artifacts/yjs-admission-'+$check.Name+'-20261107.log';$started=Get-Date;$argsForCheck=$check.Args
 & $check.Command @argsForCheck *> $log
 $taskExit=$LASTEXITCODE
 $results+=@{check=$check.Name;exitCode=$taskExit;expectedExitCode=$check.Expected;log=$log;seconds=((Get-Date)-$started).TotalSeconds}
 $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/yjs-admission-checks-20261107.json
 Write-Output ($check.Name+' exit='+$taskExit)
 if($taskExit -ne $check.Expected){Get-Content -LiteralPath $log -Tail 18;exit 1}
}
# Required six failures and exact size overruns are verified separately.
exit 0
