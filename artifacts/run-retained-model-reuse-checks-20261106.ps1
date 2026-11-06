$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$checks = @(
  @{ Name = 'typecheck'; Args = @('typecheck'); Expected = 0 },
  @{ Name = 'focused'; Args = @('exec','vitest','run','tests/yjs-retained-text.test.ts','tests/yjs-retained-nodes.test.ts','tests/yjs-retained-document.test.ts','tests/yjs-retained-adapter.test.ts','tests/yjs-retained-mapping.test.ts','tests/yjs-document-range.test.ts','--reporter=json','--outputFile=artifacts/retained-model-reuse-focused-20261106.json','--maxWorkers=1'); Expected = 1 },
  @{ Name = 'full-source'; Args = @('exec','vitest','run','--reporter=json','--outputFile=artifacts/retained-model-reuse-full-source-20261106.json','--maxWorkers=1'); Expected = 1 },
  @{ Name = 'build'; Args = @('build'); Expected = 0 },
  @{ Name = 'test:api'; Args = @('test:api'); Expected = 0 },
  @{ Name = 'test:headless'; Args = @('test:headless'); Expected = 0 },
  @{ Name = 'test:package'; Args = @('test:package'); Expected = 0 },
  @{ Name = 'test:server-runtimes'; Args = @('test:server-runtimes'); Expected = 0 },
  @{ Name = 'test:budget'; Args = @('test:budget'); Expected = 1 },
  @{ Name = 'test:performance'; Args = @('test:performance'); Expected = 0 },
  @{ Name = 'browser'; Args = @('exec','playwright','test','--config','artifacts/retained-model-reuse-browser-20261106.config.ts'); Expected = 0 }
)
$results = @()
foreach ($check in $checks) {
  $log = 'artifacts/retained-model-reuse-' + $check.Name.Replace(':','-') + '-20261106.log'
  $started = Get-Date
  Write-Output ('START ' + $check.Name)
  $checkArgs = $check.Args
  & pnpm @checkArgs *> $log
  $taskExit = $LASTEXITCODE
  $results += @{ check = $check.Name; exitCode = $taskExit; expectedExitCode = $check.Expected; log = $log; seconds = ((Get-Date) - $started).TotalSeconds }
  $results | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 artifacts/retained-model-reuse-checks-20261106.json
  Write-Output ($check.Name + ' exit=' + $taskExit)
  if ($taskExit -ne $check.Expected) { Get-Content -LiteralPath $log -Tail 16; exit $taskExit }
}
