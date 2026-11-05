$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
Set-Location (Split-Path $PSScriptRoot -Parent)
$taskSteps = @(
  @{ name = 'types'; args = @('typecheck') },
  @{ name = 'build'; args = @('build') },
  @{ name = 'api'; args = @('test:api') },
  @{ name = 'headless'; args = @('test:headless') },
  @{ name = 'package'; args = @('test:package') },
  @{ name = 'worker'; args = @('test:server-runtimes') },
  @{ name = 'conformance'; args = @('test:markdown-conformance') },
  @{ name = 'budget'; args = @('test:budget') },
  @{ name = 'site'; args = @('exec', 'vite', 'build', '--config', 'vite.input-audit.config.ts') }
)
$taskResults = @()
foreach ($taskStep in $taskSteps) {
  $taskLog = "artifacts/cross-container-final-$($taskStep.name)-20261105.log"
  $taskArgs = $taskStep.args
  & pnpm @taskArgs *> $taskLog
  $taskCode = $LASTEXITCODE
  $taskResults += @{ name = $taskStep.name; exitCode = $taskCode; log = $taskLog }
  $taskResults | ConvertTo-Json -Depth 5 | Set-Content artifacts/cross-container-final-checks-20261105.json -Encoding utf8
  Write-Output "$($taskStep.name): $taskCode"
  if ($taskCode -ne 0 -and $taskStep.name -ne 'budget') { Get-Content $taskLog -Tail 35; exit $taskCode }
}
