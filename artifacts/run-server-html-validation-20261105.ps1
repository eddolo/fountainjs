$ErrorActionPreference = 'Continue'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$taskSteps = @(
  @{ name='unit'; exe='pnpm'; arguments=@('exec','vitest','run','--maxWorkers=1') },
  @{ name='types'; exe='pnpm'; arguments=@('typecheck') },
  @{ name='api'; exe='pnpm'; arguments=@('test:api') },
  @{ name='headless'; exe='pnpm'; arguments=@('test:headless') },
  @{ name='conformance'; exe='pnpm'; arguments=@('test:markdown-conformance') },
  @{ name='package'; exe='pnpm'; arguments=@('test:package') },
  @{ name='worker'; exe='pnpm'; arguments=@('test:server-runtimes') },
  @{ name='browser'; exe='pnpm'; arguments=@('exec','playwright','test','--config','artifacts/server-html-conversion-browser-20261105.config.ts','--grep','keeps per-file HTML conversion settings') },
  @{ name='size'; exe='pnpm'; arguments=@('test:budget') },
  @{ name='loaded-size'; exe='node'; arguments=@('artifacts/measure-loaded-build-size-20261104.mjs','.','artifacts/server-html-loaded-size-20261105.json') }
)
$taskResults = [System.Collections.Generic.List[object]]::new()
foreach ($taskStep in $taskSteps) {
  $taskLog = "artifacts/server-html-final-$($taskStep.name)-20261105.log"
  $taskArguments = $taskStep.arguments
  & $taskStep.exe @taskArguments *> $taskLog
  $taskResults.Add([pscustomobject]@{ name=$taskStep.name; exitCode=$LASTEXITCODE; log=$taskLog })
  $taskResults | ConvertTo-Json -Depth 4 | Set-Content artifacts/server-html-final-checks-20261105.json -Encoding utf8
  Write-Output "$($taskStep.name): $LASTEXITCODE"
}
