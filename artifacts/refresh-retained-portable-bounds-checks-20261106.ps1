$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
$taskPrefix = 'artifacts/retained-portable-bounds-'
$taskResults = @(Get-Content -LiteralPath ($taskPrefix+'checks-20261106.json') -Raw | ConvertFrom-Json)
$taskNames = @('typecheck','focused','full-source','browser')
foreach ($taskResult in $taskResults | Where-Object { $_.check -in $taskNames }) {
  $taskArchive = $taskResult.log.Replace('-20261106.log','-before-getter-20261106.log')
  if (Test-Path -LiteralPath $taskArchive) { throw 'Pre-refresh log already archived' }
  Copy-Item -LiteralPath $taskResult.log -Destination $taskArchive
}
foreach ($taskName in @('checks','focused','full-source','browser')) {
  $taskPath = $taskPrefix+$taskName+'-20261106.json'
  $taskArchive = $taskPrefix+$taskName+'-before-getter-20261106.json'
  if (Test-Path -LiteralPath $taskArchive) { throw 'Pre-refresh report already archived' }
  Copy-Item -LiteralPath $taskPath -Destination $taskArchive
}
$taskChecks = @(
  @{ Name='typecheck'; Args=@('typecheck'); Expected=0 },
  @{ Name='focused'; Args=@('exec','vitest','run','tests/yjs-retained-text.test.ts','tests/yjs-retained-nodes.test.ts','tests/yjs-retained-document.test.ts','tests/yjs-retained-adapter.test.ts','tests/yjs-retained-mapping.test.ts','tests/yjs-document-range.test.ts','--reporter=json','--outputFile=artifacts/retained-portable-bounds-focused-20261106.json','--maxWorkers=1'); Expected=1 },
  @{ Name='full-source'; Args=@('exec','vitest','run','--reporter=json','--outputFile=artifacts/retained-portable-bounds-full-source-20261106.json','--maxWorkers=1'); Expected=1 },
  @{ Name='browser'; Args=@('exec','playwright','test','--config','artifacts/retained-portable-bounds-browser-20261106.config.ts'); Expected=0 }
)
foreach ($taskCheck in $taskChecks) {
  $taskStart=Get-Date
  $taskLog=$taskPrefix+$taskCheck.Name+'-20261106.log'
  Write-Output ('REFRESH '+$taskCheck.Name)
  $taskArgs=$taskCheck.Args
  & pnpm @taskArgs *> $taskLog
  $taskExit=$LASTEXITCODE
  $taskResults=@($taskResults | ForEach-Object {
    if ($_.check -eq $taskCheck.Name) { [pscustomobject]@{check=$taskCheck.Name;exitCode=$taskExit;expectedExitCode=$taskCheck.Expected;log=$taskLog;seconds=((Get-Date)-$taskStart).TotalSeconds} } else { $_ }
  })
  $taskResults | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 ($taskPrefix+'checks-20261106.json')
  Write-Output ($taskCheck.Name+' exit='+$taskExit)
  if ($taskExit -ne $taskCheck.Expected) { Get-Content -LiteralPath $taskLog -Tail 12; exit $taskExit }
}
