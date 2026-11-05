$ErrorActionPreference = 'Continue'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$checks = @(
  @{ Id = 'unit'; Args = @('exec', 'vitest', 'run', '--maxWorkers=1') },
  @{ Id = 'types'; Args = @('typecheck') },
  @{ Id = 'api'; Args = @('test:api') },
  @{ Id = 'headless'; Args = @('test:headless') },
  @{ Id = 'package'; Args = @('test:package') },
  @{ Id = 'server-runtimes'; Args = @('test:server-runtimes') },
  @{ Id = 'performance'; Args = @('test:performance') },
  @{ Id = 'size'; Args = @('test:budget') }
)
$results = @()
foreach ($check in $checks) {
  $log = "artifacts/structural-history-$($check.Id)-verified-20261105.log"
  $arguments = $check.Args
  $watch = [Diagnostics.Stopwatch]::StartNew()
  & pnpm @arguments *> $log
  $code = $LASTEXITCODE
  $watch.Stop()
  $results += @{ id = $check.Id; command = "pnpm $($arguments -join ' ')"; exitCode = $code; log = $log; seconds = $watch.Elapsed.TotalSeconds }
  $results | ConvertTo-Json -Depth 5 | Set-Content artifacts/structural-history-checks-20261105.json -Encoding utf8
  Write-Output "$($check.Id): exit $code ($([math]::Round($watch.Elapsed.TotalSeconds, 1))s); $log"
}
if ($results | Where-Object { $_.exitCode -ne 0 }) { exit 1 }
exit 0
