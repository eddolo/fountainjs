param([string]$CaptureRoot = 'artifacts/native-control-focus-recorded-final-20261007', [string]$OutputRoot = 'artifacts/native-control-panel-sheets-20261007')
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
foreach ($taskEngine in @('chromium', 'firefox', 'webkit')) {
  foreach ($taskWidth in @(1280, 390)) {
    $taskFiles = @(Get-ChildItem -LiteralPath $CaptureRoot -Recurse -Filter "keyboard-panel-*-$taskWidth.png" | Where-Object { $_.Directory.Name.EndsWith("-$taskEngine") } | Sort-Object Name)
    $taskImages = @($taskFiles | ForEach-Object { [System.Drawing.Image]::FromFile($_.FullName) })
    try {
      $taskCanvasWidth = ($taskImages | Measure-Object Width -Maximum).Maximum
      $taskCanvasHeight = ($taskImages | Measure-Object Height -Sum).Sum + 28 * $taskImages.Count
      $taskCanvas = [System.Drawing.Bitmap]::new([int]$taskCanvasWidth, [int]$taskCanvasHeight)
      $taskGraphics = [System.Drawing.Graphics]::FromImage($taskCanvas)
      $taskFont = [System.Drawing.Font]::new('Segoe UI', 12)
      try {
        $taskGraphics.Clear([System.Drawing.Color]::White)
        $taskY = 0
        for ($taskIndex = 0; $taskIndex -lt $taskImages.Count; $taskIndex++) {
          $taskGraphics.DrawString("$taskEngine / $taskWidth / $($taskFiles[$taskIndex].Name)", $taskFont, [System.Drawing.Brushes]::Black, 2, $taskY)
          $taskGraphics.DrawImageUnscaled($taskImages[$taskIndex], 0, $taskY + 28)
          $taskY += $taskImages[$taskIndex].Height + 28
        }
        $taskCanvas.Save((Join-Path $OutputRoot "$taskEngine-$taskWidth.png"), [System.Drawing.Imaging.ImageFormat]::Png)
      } finally { $taskFont.Dispose(); $taskGraphics.Dispose(); $taskCanvas.Dispose() }
    } finally { $taskImages | ForEach-Object { $_.Dispose() } }
  }
}
foreach ($taskFile in Get-ChildItem -LiteralPath $CaptureRoot -Recurse -Filter 'native-colour-mapped-selection.png') {
  $taskOriginal = [System.Drawing.Bitmap]::new($taskFile.FullName)
  try {
    $taskHeight = [Math]::Min($taskOriginal.Height, [int]($taskOriginal.Width * 1.2))
    $taskCrop = $taskOriginal.Clone([System.Drawing.Rectangle]::new(0, 0, $taskOriginal.Width, $taskHeight), $taskOriginal.PixelFormat)
    try { $taskCrop.Save((Join-Path $OutputRoot "$($taskFile.Directory.Name)-top.png"), [System.Drawing.Imaging.ImageFormat]::Png) }
    finally { $taskCrop.Dispose() }
  } finally { $taskOriginal.Dispose() }
}
