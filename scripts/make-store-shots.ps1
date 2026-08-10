# Generates Chrome Web Store screenshots (1280x800) from raw popup captures.
# Each source image is centered on a branded blue gradient with a caption.
Add-Type -AssemblyName System.Drawing

$W = 1280; $H = 800
$outDir = Join-Path $PSScriptRoot '..\store-assets\screenshots'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# [source path, caption]
$shots = @(
  @('C:\Users\congt\Pictures\Screenshots\Screenshot 2026-07-08 115104.png', 'Scan any marketplace search page'),
  @('C:\Users\congt\Pictures\Screenshots\Screenshot 2026-07-08 115301.png', 'Collect every product in one click'),
  @('C:\Users\congt\Pictures\Screenshots\Screenshot 2026-07-08 115410.png', 'Generate branded PDF catalogs'),
  @('C:\Users\congt\Pictures\Screenshots\Screenshot 2026-07-08 115501.png', 'Find any catalog your team created'),
  @('C:\Users\congt\Pictures\Screenshots\Screenshot 2026-07-08 115614.png', 'Send catalogs by email or fax'),
  @('C:\Users\congt\Pictures\Screenshots\Screenshot 2026-07-08 115651.png', 'Professional printable catalogs')
)

$i = 0
foreach ($s in $shots) {
  $i++
  $src = [System.Drawing.Image]::FromFile($s[0])
  $caption = $s[1]

  $canvas = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  # Blue diagonal gradient background (matches the extension header).
  $rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
  $c1 = [System.Drawing.ColorTranslator]::FromHtml('#1d4ed8')
  $c2 = [System.Drawing.ColorTranslator]::FromHtml('#3b82f6')
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 55)
  $g.FillRectangle($grad, $rect)

  # Caption text, centered near the top.
  $font = New-Object System.Drawing.Font('Segoe UI Semibold', 34, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $capRect = New-Object System.Drawing.RectangleF(80, 34, ($W - 160), 70)
  $g.DrawString($caption, $font, $white, $capRect, $fmt)

  # Fit the screenshot into the area below the caption, preserving aspect.
  $top = 120; $bottom = 40; $side = 60
  $availW = $W - (2 * $side)
  $availH = $H - $top - $bottom
  $scale = [Math]::Min($availW / $src.Width, $availH / $src.Height)
  $dw = [int]($src.Width * $scale)
  $dh = [int]($src.Height * $scale)
  $dx = [int](($W - $dw) / 2)
  $dy = [int]($top + ($availH - $dh) / 2)

  # Soft drop shadow behind the screenshot.
  $shadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
  $g.FillRectangle($shadow, $dx + 8, $dy + 10, $dw, $dh)

  $g.DrawImage($src, $dx, $dy, $dw, $dh)
  # Thin white border frame.
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 255, 255, 255), 2)
  $g.DrawRectangle($pen, $dx, $dy, $dw, $dh)

  $outPath = Join-Path $outDir ("screenshot-{0}.png" -f $i)
  $canvas.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose(); $canvas.Dispose(); $src.Dispose()
  Write-Host "Saved $outPath ($dw x $dh screenshot)"
}
Write-Host "Done. $i screenshots written to $outDir"
