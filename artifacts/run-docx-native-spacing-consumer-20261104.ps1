$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $PID
$taskProcess.PriorityClass = 'BelowNormal'
$taskProcess.ProcessorAffinity = 192
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  $taskConsumer = Join-Path (Get-Location) 'artifacts/docx-native-spacing-tarball-consumer-20261104'
  if (Test-Path -LiteralPath $taskConsumer) { throw 'Consumer destination already exists.' }
  New-Item -ItemType Directory -Path "$taskConsumer/node_modules/fountainjs-editor" | Out-Null
  pnpm pack --pack-destination "$taskConsumer" *> artifacts/docx-native-spacing-pack-20261104.log
  if ($LASTEXITCODE -ne 0) { throw 'Pack failed.' }
  tar -xzf "$taskConsumer/fountainjs-editor-0.4.0-beta.2.tgz" -C "$taskConsumer/node_modules/fountainjs-editor" --strip-components=1
  if ($LASTEXITCODE -ne 0) { throw 'Tarball extraction failed.' }
  '{"type":"module","private":true}' | Set-Content -LiteralPath "$taskConsumer/package.json" -Encoding utf8
  Copy-Item -LiteralPath artifacts/docx-native-spacing-consumer-20261104.mjs -Destination "$taskConsumer/consumer.mjs"
  node "$taskConsumer/consumer.mjs" *> artifacts/docx-native-spacing-consumer-20261104.log
  if ($LASTEXITCODE -ne 0) { throw 'Actual packed consumer contracts failed.' }
  Get-Content artifacts/docx-native-spacing-consumer-20261104.log
} finally { Pop-Location }
