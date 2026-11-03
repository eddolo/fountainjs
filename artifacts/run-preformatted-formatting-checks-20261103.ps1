$ErrorActionPreference = 'Continue'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$taskChecks = @(
  @{ Name = 'types'; Run = { pnpm typecheck } },
  @{ Name = 'api'; Run = { pnpm test:api } },
  @{ Name = 'headless'; Run = { pnpm test:headless } },
  @{ Name = 'package'; Run = { pnpm test:package } },
  @{ Name = 'server-runtimes'; Run = { pnpm test:server-runtimes } },
  @{ Name = 'corpus'; Run = { node scripts/check-markdown-conformance.mjs --complete-source-report=artifacts/preformatted-formatting-complete-corpus-20261103.json } },
  @{ Name = 'performance'; Run = { node --expose-gc scripts/check-performance-budgets.mjs --report artifacts/preformatted-formatting-performance-report-20261103.json } },
  @{ Name = 'direction-retention'; Run = { node --expose-gc scripts/check-shared-direction-retention.mjs } },
  @{ Name = 'mapping-retention'; Run = { node --expose-gc scripts/check-position-mapping-retention.mjs } },
  @{ Name = 'size'; Run = { pnpm test:budget } },
  @{ Name = 'site'; Run = { pnpm exec vite build --base /fountainjs/ } }
)
$taskResults = @()
foreach ($taskCheck in $taskChecks) {
  $taskLog = "artifacts/preformatted-formatting-$($taskCheck.Name)-20261103.log"
  Write-Output "Starting $($taskCheck.Name)."
  & $taskCheck.Run *> $taskLog
  $taskExit = $LASTEXITCODE
  $taskResults += [ordered]@{ name = $taskCheck.Name; exitCode = $taskExit; log = $taskLog }
  $taskResults | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath 'artifacts/preformatted-formatting-check-results-20261103.json' -Encoding utf8
  Write-Output "Completed $($taskCheck.Name): exit $taskExit."
}
if (@($taskResults | Where-Object { $_.exitCode -ne 0 }).Count) { exit 1 }
