# Install / refresh gstack for Cursor on Windows (Quest Game).
# Run once after clone, and again after `git pull` in the gstack source repo.
#
# Usage (from repo root or this folder):
#   powershell -ExecutionPolicy Bypass -File quest-game-github-archive/scripts/install-gstack-cursor.ps1

$ErrorActionPreference = 'Stop'

$GstackSrc = if ($env:GSTACK_SRC) { $env:GSTACK_SRC } else { 'G:\Code\gstack-main\gstack-main' }
$RefreshScript = Join-Path $env:USERPROFILE '.cursor\skills\gstack-refresh.ps1'
$GitBash = 'C:\Program Files\Git\bin\bash.exe'

function Require-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing $name. $hint"
  }
}

Write-Host 'Quest Game — gstack setup for Cursor (Windows)' -ForegroundColor Cyan

if (-not (Test-Path $GitBash)) {
  throw 'Git for Windows (Git Bash) required: https://git-scm.com/download/win'
}
Require-Command bun 'Install Bun: https://bun.sh'
Require-Command node 'Install Node.js LTS: https://nodejs.org'
if (-not (Test-Path $GstackSrc)) {
  throw "gstack source not found at $GstackSrc. Clone: git clone https://github.com/garrytan/gstack.git"
}

$env:Path = "$env:USERPROFILE\.bun\bin;C:\Program Files\Git\bin;C:\Program Files\nodejs;" + $env:Path

# Build browse + register Claude skills (side effect: compiles browse/dist).
$GstackBashPath = '/g/' + ($GstackSrc -replace '^[A-Za-z]:\\','' -replace '\\','/')
Write-Host "Running ./setup in $GstackSrc ($GstackBashPath) ..."
& $GitBash -lc "cd '$GstackBashPath' && ./setup --prefix --quiet --no-plan-tune-hooks"

# Sync runtime + Cursor skills into ~/.cursor/skills (uses global refresh script).
if (Test-Path $RefreshScript) {
  & $RefreshScript
} else {
  Write-Warning "gstack-refresh.ps1 not found at $RefreshScript — copying minimal runtime only."
  $dest = Join-Path $env:USERPROFILE '.cursor\skills'
  $gstack = Join-Path $dest 'gstack'
  New-Item -ItemType Directory -Force -Path "$gstack\browse\dist" | Out-Null
  Copy-Item -Recurse -Force "$GstackSrc\bin" "$gstack\bin"
  Copy-Item -Recurse -Force "$GstackSrc\browse\dist\*" "$gstack\browse\dist\"
}

$BrowseExe = Join-Path $env:USERPROFILE '.cursor\skills\gstack\browse\dist\browse.exe'
if (-not (Test-Path $BrowseExe)) {
  throw "browse.exe missing after install. Check $GstackSrc\browse\dist"
}

Write-Host ''
Write-Host 'gstack ready for Cursor.' -ForegroundColor Green
Write-Host "  Skills:  $env:USERPROFILE\.cursor\skills\gstack-*"
Write-Host "  Browse:  $BrowseExe"
Write-Host '  Terminal: use Git Bash in Cursor (workspace .vscode/settings.json)'
Write-Host '  Verify:   open Agent chat, run gstack-context-restore preamble in Git Bash'
Write-Host ''
