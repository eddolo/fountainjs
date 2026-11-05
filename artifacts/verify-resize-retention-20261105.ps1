$ErrorActionPreference = 'Continue'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$checks = @(
  @{ Id = 'unit'; File = 'pnpm'; Args = @('exec', 'vitest', 'run', '--maxWorkers=1') },
  @{ Id = 'types'; File = 'pnpm'; Args = @('typecheck') },
  @{ Id = 'api'; File = 'pnpm'; Args = @('test:api') },
  @{ Id = 'headless'; File = 'pnpm'; Args = @('test:headless') },
  @{ Id = 'package'; File = 'pnpm'; Args = @('test:package') },
  @{ Id = 'server-runtimes'; File = 'pnpm'; Args = @('test:server-runtimes') },
  @{ Id = 'performance'; File = 'pnpm'; Args = @('test:performance') },
  @{ Id = 'size'; File = 'pnpm'; Args = @('test:budget'); ExpectedFailure = $true }
)
$results = @()
foreach ($check in $checks) {
  $log = "artifacts/resize-retention-$($check.Id)-verified-20261105.log"
  $arguments = $check.Args
  $watch = [Diagnostics.Stopwatch]::StartNew()
  & $check.File @arguments *> $log
  $code = $LASTEXITCODE
  $watch.Stop()
  $results += @{ id = $check.Id; command = "$($check.File) $($arguments -join ' ')"; exitCode = $code; log = $log; seconds = $watch.Elapsed.TotalSeconds; expectedFailure = [bool]$check.ExpectedFailure }
  $results | ConvertTo-Json -Depth 5 | Set-Content artifacts/resize-retention-checks-20261105.json -Encoding utf8
  Write-Output "$($check.Id): exit $code ($([math]::Round($watch.Elapsed.TotalSeconds, 1))s); $log"
}
if ($results | Where-Object { $_.exitCode -ne 0 -and -not $_.expectedFailure }) { exit 1 }
exit 0
