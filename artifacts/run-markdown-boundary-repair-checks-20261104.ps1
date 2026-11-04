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
  @{ name='size'; exe='pnpm'; arguments=@('test:budget') },
  @{ name='loaded-size'; exe='node'; arguments=@('artifacts/measure-loaded-build-size-20261104.mjs','.','artifacts/boundary-repair-loaded-build-size-review-20261104.json') },
  @{ name='latency'; exe='node'; arguments=@('--expose-gc','scripts/check-performance-budgets.mjs','--report','artifacts/markdown-boundary-repair-latency-20261104.json') },
  @{ name='direction-retention'; exe='node'; arguments=@('--expose-gc','scripts/check-shared-direction-retention.mjs') },
  @{ name='mapping-retention'; exe='node'; arguments=@('--expose-gc','scripts/check-position-mapping-retention.mjs') }
)
$taskResults = [System.Collections.Generic.List[object]]::new()
foreach ($taskStep in $taskSteps) {
  $taskLog = "artifacts/markdown-boundary-repair-$($taskStep.name)-20261104.log"
  $taskArguments = $taskStep.arguments
  & $taskStep.exe @taskArguments *> $taskLog
  $taskResults.Add([pscustomobject]@{ name=$taskStep.name; exitCode=$LASTEXITCODE; log=$taskLog })
  $taskResults | ConvertTo-Json -Depth 4 | Set-Content artifacts/markdown-boundary-repair-check-results-20261104.json -Encoding utf8
  Write-Output "$($taskStep.name): $LASTEXITCODE"
}
