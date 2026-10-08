param([Parameter(Mandatory)][string]$Root)
Add-Type -AssemblyName System.Drawing
$taskFiles = Get-ChildItem -LiteralPath $Root -Recurse -Filter 'block-direction-*.png'
foreach ($taskGroup in ($taskFiles | Group-Object Name)) {
  $taskPictures = @($taskGroup.Group | Sort-Object DirectoryName)
  $taskBoard = [System.Drawing.Bitmap]::new(($taskPictures.Count * 800), 1120)
  $taskGraphics = [System.Drawing.Graphics]::FromImage($taskBoard)
  $taskFont = [System.Drawing.Font]::new('Arial', 14)
  try {
    $taskGraphics.Clear([System.Drawing.Color]::White)
    for ($taskIndex = 0; $taskIndex -lt $taskPictures.Count; $taskIndex++) {
      $taskPicture = [System.Drawing.Image]::FromFile($taskPictures[$taskIndex].FullName)
      try {
        $taskX = $taskIndex * 800
        $taskEngine = $taskPictures[$taskIndex].Directory.Name -replace '^.*-(chromium|firefox|webkit)$', '$1'
        $taskGraphics.DrawString("${taskEngine}: $($taskGroup.Name)", $taskFont, [System.Drawing.Brushes]::Black, $taskX + 5, 5)
        $taskScale = [Math]::Min(790 / $taskPicture.Width, 1080 / $taskPicture.Height)
        $taskGraphics.DrawImage($taskPicture, [int]($taskX + 5), 35, [int]($taskPicture.Width * $taskScale), [int]($taskPicture.Height * $taskScale))
      } finally { $taskPicture.Dispose() }
    }
    $taskBoard.Save((Join-Path ([IO.Path]::GetFullPath($Root)) ("qa-board-" + $taskGroup.Name)))
  } finally { $taskGraphics.Dispose(); $taskBoard.Dispose(); $taskFont.Dispose() }
}
