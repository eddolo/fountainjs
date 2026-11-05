$ErrorActionPreference = 'Continue'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
New-Item -ItemType Directory -Force artifacts/code-label-tarball-20261104 | Out-Null
$taskPython = 'C:\Users\cappu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
$taskSteps = @(
  @{ name='final-browser'; exe='pnpm'; arguments=@('exec','playwright','test','--config','artifacts/code-label-final-browser.config.ts') },
  @{ name='pack'; exe='pnpm'; arguments=@('pack','--out','artifacts/code-label-tarball-20261104/fountainjs-editor-0.4.0-beta.2.tgz') },
  @{ name='extract'; exe=$taskPython; arguments=@('artifacts/extract-code-label-package-20261104.py') },
  @{ name='packed-node'; exe='node'; arguments=@('artifacts/code-label-tarball-20261104/consumer/probe.mjs') },
  @{ name='types'; exe='pnpm'; arguments=@('typecheck') },
  @{ name='conformance'; exe='pnpm'; arguments=@('test:markdown-conformance') },
  @{ name='package'; exe='pnpm'; arguments=@('test:package') },
  @{ name='worker'; exe='pnpm'; arguments=@('test:server-runtimes') },
  @{ name='size'; exe='pnpm'; arguments=@('test:budget') },
  @{ name='loaded-size'; exe='node'; arguments=@('artifacts/measure-loaded-build-size-20261104.mjs','.','artifacts/code-label-loaded-size-20261104.json') },
  @{ name='latency'; exe='node'; arguments=@('--expose-gc','scripts/check-performance-budgets.mjs','--report','artifacts/code-label-latency-20261104.json') },
  @{ name='direction-retention'; exe='node'; arguments=@('--expose-gc','scripts/check-shared-direction-retention.mjs') },
  @{ name='mapping-retention'; exe='node'; arguments=@('--expose-gc','scripts/check-position-mapping-retention.mjs') },
  @{ name='visual-contacts'; exe=$taskPython; arguments=@('artifacts/review-code-label-20261104.py') }
)
$taskResults = [System.Collections.Generic.List[object]]::new()
foreach ($taskStep in $taskSteps) {
  $taskLog = "artifacts/code-label-$($taskStep.name)-20261104.log"
  $taskArguments = $taskStep.arguments
  & $taskStep.exe @taskArguments *> $taskLog
  $taskResults.Add([pscustomobject]@{ name=$taskStep.name; exitCode=$LASTEXITCODE; log=$taskLog })
  $taskResults | ConvertTo-Json -Depth 4 | Set-Content artifacts/code-label-check-results-20261104.json -Encoding utf8
  Write-Output "$($taskStep.name): $LASTEXITCODE"
}
