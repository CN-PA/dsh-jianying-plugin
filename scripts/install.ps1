[CmdletBinding()]
param(
  [string]$Profile = 'desktop',
  [string]$Version = 'latest',
  [string]$DshCommand = ''
)

$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$repository = 'CN-PA/dsh-jianying-plugin'
$headers = @{
  'User-Agent' = 'dsh-jianying-plugin-installer'
  'Accept' = 'application/vnd.github+json'
}

if ($Version -eq 'latest') {
  $releaseUri = "https://api.github.com/repos/$repository/releases/latest"
} else {
  $tag = if ($Version.StartsWith('v')) { $Version } else { "v$Version" }
  $releaseUri = "https://api.github.com/repos/$repository/releases/tags/$tag"
}

Write-Host "Resolving dsh-jianying-plugin release..." -ForegroundColor Cyan
$release = Invoke-RestMethod -Headers $headers -Uri $releaseUri -TimeoutSec 30
$asset = $release.assets |
  Where-Object { $_.name -match '^dsh-jianying-plugin-.+\.tgz$' } |
  Select-Object -First 1
if (-not $asset) {
  throw "Release $($release.tag_name) does not contain a .tgz plugin asset."
}

if (-not $DshCommand) {
  $resolved = Get-Command dsh -ErrorAction SilentlyContinue
  if ($resolved) {
    $DshCommand = $resolved.Source
  }
}
if (-not $DshCommand) {
  $candidates = @(
    $env:DSH_CLI,
    'F:\dsh\resources\runtime\cli\bin\dsh.cmd',
    (Join-Path $env:LOCALAPPDATA 'Programs\dsh\resources\runtime\cli\bin\dsh.cmd'),
    (Join-Path $env:LOCALAPPDATA 'Programs\DSH\resources\runtime\cli\bin\dsh.cmd'),
    (Join-Path $env:ProgramFiles 'DSH\resources\runtime\cli\bin\dsh.cmd')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  $DshCommand = $candidates | Select-Object -First 1
}
if (-not $DshCommand -or -not (Test-Path -LiteralPath $DshCommand)) {
  throw 'DSH CLI was not found. Pass -DshCommand with the absolute path to dsh.cmd.'
}

$downloadRoot = if (Test-Path -LiteralPath 'F:\') {
  'F:\Codex\.dsh-jianying-plugin\downloads'
} else {
  Join-Path $env:TEMP 'dsh-jianying-plugin\downloads'
}
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
$downloadPath = Join-Path $downloadRoot $asset.name

Write-Host "Downloading $($asset.name) from $($release.tag_name)..." -ForegroundColor Cyan
$downloadHeaders = @{
  'User-Agent' = 'dsh-jianying-plugin-installer'
  'Accept' = 'application/octet-stream'
}
Invoke-WebRequest -Headers $downloadHeaders -Uri $asset.url -OutFile $downloadPath -TimeoutSec 120

$actualHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($asset.digest -and $asset.digest -match '^sha256:([0-9a-f]{64})$') {
  $expectedHash = $Matches[1]
  if ($actualHash -ne $expectedHash) {
    throw "Downloaded plugin hash mismatch. Expected $expectedHash, got $actualHash."
  }
}

Write-Host "Installing into DSH profile '$Profile'..." -ForegroundColor Cyan
& $DshCommand plugin --profile $Profile add "file:$($downloadPath.Replace('\', '/'))"
if ($LASTEXITCODE -ne 0) {
  throw "DSH plugin installation failed with exit code $LASTEXITCODE."
}

Write-Host ''
Write-Host "Installed $($release.tag_name). Restart DSH, then call jianying_doctor." -ForegroundColor Green
Write-Host "Plugin file: $downloadPath"
