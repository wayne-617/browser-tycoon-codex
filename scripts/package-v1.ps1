[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repoRoot "v1"
$zipPath = Join-Path $repoRoot "browser-tycoon-v1.zip"
$checksumPath = "$zipPath.sha256"
$contentsPath = Join-Path $repoRoot "browser-tycoon-v1.contents.txt"
$stageRoot = Join-Path $env:TEMP ("browser-tycoon-v1-release-" + [guid]::NewGuid().ToString("N"))

$runtimeFiles = @(
  "manifest.json",
  "background.js",
  "cloud-save.js",
  "game-math.js",
  "ExtPay.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "bt-logo-transparent.png",
  "fonts/fonts.css",
  "fonts/VT323-Regular.ttf",
  "icons/b-logo.png",
  "icons/b-logo-no-outline.png"
)
$runtimeFiles += 1..40 | ForEach-Object { "icons/Icon14_{0:D2}.png" -f $_ }
$runtimeFiles = $runtimeFiles | Sort-Object

$firstPartyTextFiles = @(
  "background.js",
  "cloud-save.js",
  "game-math.js",
  "manifest.json",
  "popup.css",
  "popup.html",
  "popup.js",
  "fonts/fonts.css"
)
$forbiddenPatterns = @(
  "DEV TOOLS",
  "devAddCash",
  "devAddCachePoints",
  "devResetCashAndCachePoints",
  "devResetLifetime",
  "devReplayTutorial",
  "resetOnboarding",
  "renderDev",
  "rank-sample",
  "original-rank-sample",
  "original-slot-tier"
)

function Fail([string]$message) {
  throw "Release check failed: $message"
}

foreach ($relativePath in $runtimeFiles) {
  $sourcePath = Join-Path $sourceRoot $relativePath
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    Fail "Missing runtime file: $relativePath"
  }
}

$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot "manifest.json") -Raw | ConvertFrom-Json
if ($manifest.manifest_version -ne 3) { Fail "manifest_version must be 3." }
if ($manifest.version -ne "1.0.2") { Fail "manifest version must be 1.0.2." }
if ($null -ne $manifest.host_permissions) { Fail "Broad host_permissions must not be present." }

foreach ($relativePath in $firstPartyTextFiles) {
  $sourcePath = Join-Path $sourceRoot $relativePath
  $bytes = [System.IO.File]::ReadAllBytes($sourcePath)
  if ($bytes -contains 0) { Fail "Null byte found in $relativePath" }
  $text = [System.IO.File]::ReadAllText($sourcePath)
  foreach ($pattern in $forbiddenPatterns) {
    if ($text.IndexOf($pattern, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      Fail "Forbidden production marker '$pattern' found in $relativePath"
    }
  }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "Node.js is required for JavaScript syntax checks." }
foreach ($relativePath in @("background.js", "cloud-save.js", "game-math.js", "ExtPay.js", "popup.js")) {
  & $node.Source --check (Join-Path $sourceRoot $relativePath)
  if ($LASTEXITCODE -ne 0) { Fail "JavaScript syntax check failed for $relativePath" }
}

New-Item -ItemType Directory -Path $stageRoot | Out-Null
try {
  foreach ($relativePath in $runtimeFiles) {
    $sourcePath = Join-Path $sourceRoot $relativePath
    $destinationPath = Join-Path $stageRoot $relativePath
    $destinationDir = Split-Path -Parent $destinationPath
    if (-not (Test-Path -LiteralPath $destinationDir)) {
      New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
  }

  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $actualEntries = $archive.Entries |
      Where-Object { -not [string]::IsNullOrEmpty($_.Name) } |
      ForEach-Object { $_.FullName.Replace("\", "/") } |
      Sort-Object
    $expectedEntries = $runtimeFiles | ForEach-Object { $_.Replace("\", "/") } | Sort-Object
    $difference = Compare-Object -ReferenceObject $expectedEntries -DifferenceObject $actualEntries
    if ($difference) {
      Fail ("ZIP contents differ from the runtime allowlist:`n" + ($difference | Out-String))
    }
  } finally {
    $archive.Dispose()
  }

  $zipInfo = Get-Item -LiteralPath $zipPath
  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath $checksumPath -Value "$hash  $($zipInfo.Name)" -Encoding ASCII

  $record = @(
    "Browser Tycoon release package",
    "Version: $($manifest.version)",
    "Bytes: $($zipInfo.Length)",
    "SHA256: $hash",
    "Files: $($runtimeFiles.Count)",
    "",
    "Contents:",
    ($runtimeFiles | ForEach-Object { "- $_" })
  )
  Set-Content -LiteralPath $contentsPath -Value $record -Encoding UTF8

  Write-Output "Created $zipPath"
  Write-Output "Version: $($manifest.version)"
  Write-Output "Files: $($runtimeFiles.Count)"
  Write-Output "Bytes: $($zipInfo.Length)"
  Write-Output "SHA256: $hash"
} finally {
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}
