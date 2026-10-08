param([Parameter(Mandatory)][string]$Root, [string]$FilePattern = 'block-direction-*.png', [switch]$EnginePrefix, [ValidateRange(1, 12)][int]$MaxColumns = 3)
Add-Type -AssemblyName System.Drawing
$taskFiles = Get-ChildItem -LiteralPath $Root -Recurse -Filter $FilePattern | Where-Object { $_.Name -notlike 'qa-board-*' }
foreach ($taskGroup in ($taskFiles | Group-Object { if ($EnginePrefix) { $_.Name -replace '^(chromium|firefox|webkit)-', '' } else { $_.Name } })) {
  $taskPictures = @($taskGroup.Group | Sort-Object FullName)
  for ($taskStart = 0; $taskStart -lt $taskPictures.Count; $taskStart += $MaxColumns) {
  $taskBatch = @($taskPictures | Select-Object -Skip $taskStart -First $MaxColumns)
  $taskBoard = [System.Drawing.Bitmap]::new(($taskBatch.Count * 800), 1120)
  $taskGraphics = [System.Drawing.Graphics]::FromImage($taskBoard)
  $taskFont = [System.Drawing.Font]::new('Arial', 14)
  try {
    $taskGraphics.Clear([System.Drawing.Color]::White)
    for ($taskIndex = 0; $taskIndex -lt $taskBatch.Count; $taskIndex++) {
      $taskPicture = [System.Drawing.Image]::FromFile($taskBatch[$taskIndex].FullName)
      try {
        $taskX = $taskIndex * 800
        $taskEngine = if ($EnginePrefix) { $taskBatch[$taskIndex].Name -replace '^(chromium|firefox|webkit)-.*$', '$1' } else { $taskBatch[$taskIndex].Directory.Name -replace '^.*-(chromium|firefox|webkit)$', '$1' }
        $taskGraphics.DrawString("${taskEngine}: $($taskGroup.Name)", $taskFont, [System.Drawing.Brushes]::Black, $taskX + 5, 5)
        $taskScale = [Math]::Min(790 / $taskPicture.Width, 1080 / $taskPicture.Height)
        $taskGraphics.DrawImage($taskPicture, [int]($taskX + 5), 35, [int]($taskPicture.Width * $taskScale), [int]($taskPicture.Height * $taskScale))
      } finally { $taskPicture.Dispose() }
    }
    $taskSuffix = if ($taskPictures.Count -gt $MaxColumns) { "-$([int]($taskStart / $MaxColumns))" } else { '' }
    $taskBoard.Save((Join-Path ([IO.Path]::GetFullPath($Root)) ("qa-board-" + [IO.Path]::GetFileNameWithoutExtension($taskGroup.Name) + $taskSuffix + '.png')))
  } finally { $taskGraphics.Dispose(); $taskBoard.Dispose(); $taskFont.Dispose() }
  }
}
