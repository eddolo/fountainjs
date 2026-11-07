$ErrorActionPreference='Stop'
$taskProcess=Get-Process -Id $PID
$taskProcess.PriorityClass='BelowNormal'
$taskProcess.ProcessorAffinity=192
$checks=@(
 @{Name='browser';Command='pnpm';Args=@('exec','playwright','test','--config','artifacts/yjs-authority-admission-browser-20261107.config.ts')},
 @{Name='curate';Command='node';Args=@('artifacts/curate-yjs-authority-admission-20261107.mjs')},
 @{Name='types';Command='pnpm';Args=@('exec','tsc','--noEmit')}
)
$results=@()
foreach($check in $checks){
 $log='artifacts/yjs-authority-admission-final-'+$check.Name+'-20261107.log';$started=Get-Date;$argsForCheck=$check.Args
 & $check.Command @argsForCheck *> $log
 $taskExit=$LASTEXITCODE
 $results+=@{check=$check.Name;exitCode=$taskExit;log=$log;seconds=((Get-Date)-$started).TotalSeconds}
 $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/yjs-authority-admission-final-browser-checks-20261107.json
 Write-Output ($check.Name+' exit='+$taskExit)
 if($taskExit -ne 0){Get-Content $log -Tail 20;exit 1}
}
