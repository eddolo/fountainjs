param([string]$ResumeFrom = '')
$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$script:TaskChecks = if ($ResumeFrom) { @(Get-Content artifacts/structural-formatting-checks-20261105.json -Raw | ConvertFrom-Json) } else { @() }
$script:TaskStarted = -not $ResumeFrom
function Invoke-Checkpoint {
  param([string]$TaskCheckName, [string]$TaskExecutable, [string[]]$TaskArguments, [switch]$AllowFailure)
  if ($TaskCheckName -eq $ResumeFrom) { $script:TaskStarted = $true }
  if (-not $script:TaskStarted) {
    $taskPrevious = @($script:TaskChecks | Where-Object { $_.name -eq $TaskCheckName })
    if ($taskPrevious.Count -ne 1 -or -not (Test-Path -LiteralPath $taskPrevious[0].log) -or
      ($taskPrevious[0].exitCode -ne 0 -and -not $AllowFailure)) { throw "Missing prior evidence for $TaskCheckName" }
    return
  }
  $taskLog = "artifacts/structural-formatting-$TaskCheckName-20261105.log"
  & $TaskExecutable @TaskArguments *> $taskLog
  $taskExit = $LASTEXITCODE
  $script:TaskChecks += [ordered]@{ name = $TaskCheckName; executable = $TaskExecutable; arguments = $TaskArguments; exitCode = $taskExit; log = $taskLog }
  $script:TaskChecks | ConvertTo-Json -Depth 6 | Set-Content artifacts/structural-formatting-checks-20261105.json -Encoding utf8
  Write-Output "$TaskCheckName exit: $taskExit"
  if ($taskExit -ne 0 -and -not $AllowFailure) { Get-Content -LiteralPath $taskLog -Tail 35; throw "$TaskCheckName failed" }
}
Invoke-Checkpoint 'build-verified' 'pnpm' @('build')
Invoke-Checkpoint 'types-verified' 'pnpm' @('typecheck')
Invoke-Checkpoint 'api-verified' 'node' @('scripts/check-api-surface.mjs')
Invoke-Checkpoint 'headless-verified' 'pnpm' @('test:headless')
Invoke-Checkpoint 'unit-verified' 'pnpm' @('exec', 'vitest', 'run', '--maxWorkers=1')
Invoke-Checkpoint 'package-verified' 'pnpm' @('test:package')
Invoke-Checkpoint 'server-runtimes-verified' 'pnpm' @('test:server-runtimes')
Invoke-Checkpoint 'conformance-verified' 'pnpm' @('test:markdown-conformance')
Invoke-Checkpoint 'size-verified' 'pnpm' @('test:budget') -AllowFailure
Invoke-Checkpoint 'performance-verified' 'pnpm' @('test:performance')
Invoke-Checkpoint 'demo-build-verified' 'pnpm' @('exec', 'vite', 'build', '--config', 'vite.input-audit.config.ts')
Invoke-Checkpoint 'table-browser-verified' 'pnpm' @('exec', 'playwright', 'test', '--config', 'artifacts/structural-formatting-table-browser-20261105.config.ts', '--output', 'artifacts/structural-formatting-table-verified-browser-20261105')
Invoke-Checkpoint 'formatting-browser-verified' 'pnpm' @('exec', 'playwright', 'test', '--config', 'artifacts/structural-formatting-browser-20261105.config.ts', '--output', 'artifacts/structural-formatting-verified-browser-20261105')
Invoke-Checkpoint 'focus-browser-verified' 'pnpm' @('exec', 'playwright', 'test', '--config', 'artifacts/structural-formatting-focus-browser-20261105.config.ts')
Invoke-Checkpoint 'loaded-size-verified' 'node' @('artifacts/measure-loaded-build-size-20261104.mjs', '.', 'artifacts/structural-formatting-loaded-size-20261105.json')
New-Item -ItemType Directory -Force -Path artifacts/structural-formatting-package-20261105 | Out-Null
Invoke-Checkpoint 'pack-verified' 'pnpm' @('pack', '--pack-destination', 'artifacts/structural-formatting-package-20261105')
Invoke-Checkpoint 'packed-consumer-verified' 'node' @('artifacts/run-structural-formatting-packed-20261105.mjs', 'artifacts/structural-formatting-package-20261105/fountainjs-editor-0.4.0-beta.2.tgz')
