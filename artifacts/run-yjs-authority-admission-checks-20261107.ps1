$ErrorActionPreference='Stop'
$taskProcess=Get-Process -Id $PID
$taskProcess.PriorityClass='BelowNormal'
$taskProcess.ProcessorAffinity=192
$results=@()
$checks=@(
 @{Name='prepare-controls';Command='node';Args=@('artifacts/prepare-yjs-authority-admission-controls-20261107.mjs');Expected=0},
 @{Name='types';Command='pnpm';Args=@('exec','tsc','--noEmit');Expected=0},
 @{Name='focused';Command='pnpm';Args=@('exec','vitest','run','tests/yjs-retained-authority-admission.test.ts','tests/yjs-retained-admission.test.ts','tests/yjs-retained-adapter.test.ts','tests/yjs-history-policy.test.ts','tests/yjs-cross-format-handoff.test.ts','tests/yjs-namespace-migration.test.ts','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-authority-admission-focused-20261107.json');Expected=0},
 @{Name='before';Command='pnpm';Args=@('exec','vitest','run','--config','artifacts/yjs-authority-admission-baseline-20261107.config.ts','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-authority-admission-before-20261107.json');Expected=1},
 @{Name='history-control';Command='pnpm';Args=@('exec','vitest','run','--config','artifacts/yjs-authority-admission-history-control-20261107.config.ts','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-authority-admission-history-control-20261107.json');Expected=1},
 @{Name='node-es';Command='node';Args=@('artifacts/yjs-authority-admission-node-20261107.mjs','es');Expected=0},
 @{Name='node-cjs';Command='node';Args=@('artifacts/yjs-authority-admission-node-20261107.mjs','cjs');Expected=0},
 @{Name='curate';Command='node';Args=@('artifacts/curate-yjs-authority-admission-20261107.mjs');Expected=0},
 @{Name='full-source';Command='pnpm';Args=@('exec','vitest','run','--maxWorkers=1','--reporter=json','--outputFile=artifacts/yjs-authority-admission-full-source-20261107.json');Expected=1},
 @{Name='build';Command='pnpm';Args=@('build');Expected=0},
 @{Name='api';Command='pnpm';Args=@('test:api');Expected=0},
 @{Name='headless';Command='pnpm';Args=@('test:headless');Expected=0},
 @{Name='budget';Command='pnpm';Args=@('test:budget');Expected=1}
)
foreach($check in $checks){
 Write-Output ('START '+$check.Name)
 $log='artifacts/yjs-authority-admission-'+$check.Name+'-20261107.log';$started=Get-Date;$argsForCheck=$check.Args
 & $check.Command @argsForCheck *> $log
 $taskExit=$LASTEXITCODE
 $results+=@{check=$check.Name;exitCode=$taskExit;expectedExitCode=$check.Expected;log=$log;seconds=((Get-Date)-$started).TotalSeconds}
 $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/yjs-authority-admission-checks-20261107.json
 Write-Output ($check.Name+' exit='+$taskExit)
 if($taskExit -ne $check.Expected){Get-Content -LiteralPath $log -Tail 18;exit 1}
}
# Exact failures, negative controls and unchanged bytes are verified separately.
exit 0
