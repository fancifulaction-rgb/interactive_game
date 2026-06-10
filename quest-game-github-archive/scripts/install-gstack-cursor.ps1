# Install / refresh gstack for Cursor on Windows (Quest Game).
# Runtime and bin/* run in Git Bash; this script is a PowerShell launcher only.
#
# Usage (from repo root or this folder):
#   powershell -ExecutionPolicy Bypass -File quest-game-github-archive/scripts/install-gstack-cursor.ps1
#
# Optional: set GSTACK_SRC to your gstack git clone (default G:\Code\gstack-main\gstack-main).

$ErrorActionPreference = 'Stop'

$GstackSrc = if ($env:GSTACK_SRC) { $env:GSTACK_SRC } else { 'G:\Code\gstack-main\gstack-main' }
$GitBash = 'C:\Program Files\Git\bin\bash.exe'
$CursorSkills = Join-Path $env:USERPROFILE '.cursor\skills'
$CursorGstack = Join-Path $CursorSkills 'gstack'
$ClaudeGstack = Join-Path $env:USERPROFILE '.claude\skills\gstack'

function Require-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing $name. $hint"
  }
}

function To-GstackBashPath([string]$WindowsPath) {
  $normalized = $WindowsPath -replace '\\', '/'
  if ($normalized -match '^([A-Za-z]):/(.*)$') {
    return ('/' + $Matches[1].ToLower() + '/' + $Matches[2])
  }
  return $normalized
}

function Read-GstackVersion([string]$Root) {
  if (-not $Root -or -not (Test-Path $Root)) { return $null }
  $versionFile = Join-Path $Root 'VERSION'
  if (-not (Test-Path $versionFile)) { return $null }
  return (Get-Content -Raw $versionFile).Trim()
}

function Compare-GstackVersion([string]$Left, [string]$Right) {
  if (-not $Left -and -not $Right) { return 0 }
  if (-not $Left) { return -1 }
  if (-not $Right) { return 1 }
  try {
    $l = [version]$Left
    $r = [version]$Right
    return $l.CompareTo($r)
  }
  catch {
    return [string]::Compare($Left, $Right, [StringComparison]::OrdinalIgnoreCase)
  }
}

function Sync-CursorRuntime([string]$SourceRoot, [string]$DestRoot) {
  New-Item -ItemType Directory -Force -Path `
    "$DestRoot\browse\dist", `
    "$DestRoot\browse\bin", `
    "$DestRoot\review", `
    "$DestRoot\gstack-upgrade" | Out-Null

  Copy-Item -Recurse -Force (Join-Path $SourceRoot 'bin') (Join-Path $DestRoot 'bin')
  Copy-Item -Recurse -Force (Join-Path $SourceRoot 'browse\dist\*') (Join-Path $DestRoot 'browse\dist\')
  $browseBin = Join-Path $SourceRoot 'browse\bin'
  if (Test-Path $browseBin) {
    Copy-Item -Recurse -Force "$browseBin\*" (Join-Path $DestRoot 'browse\bin\')
  }

  foreach ($rel in @('ETHOS.md', 'VERSION')) {
    $file = Join-Path $SourceRoot $rel
    if (Test-Path $file) {
      Copy-Item -Force $file (Join-Path $DestRoot $rel)
    }
  }

  $upgradeSrc = Join-Path $SourceRoot 'gstack-upgrade'
  if (Test-Path $upgradeSrc) {
    Copy-Item -Recurse -Force $upgradeSrc (Join-Path $DestRoot 'gstack-upgrade')
  }

  foreach ($f in @('checklist.md', 'TODOS-format.md', 'design-checklist.md', 'greptile-triage.md')) {
    $reviewFile = Join-Path $SourceRoot "review\$f"
    if (Test-Path $reviewFile) {
      Copy-Item -Force $reviewFile (Join-Path $DestRoot "review\$f")
    }
  }

  $rootSkill = Join-Path $SourceRoot '.cursor\skills\gstack\SKILL.md'
  if (Test-Path $rootSkill) {
    Copy-Item -Force $rootSkill (Join-Path $DestRoot 'SKILL.md')
  }
}

function Sync-CursorSkillStubs([string]$SourceRoot) {
  $cursorSkillsSrc = Join-Path $SourceRoot '.cursor\skills'
  if (-not (Test-Path $cursorSkillsSrc)) { return }

  Get-ChildItem $cursorSkillsSrc -Directory | Where-Object { $_.Name -ne 'gstack' } | ForEach-Object {
    $target = Join-Path $CursorSkills $_.Name
    if (Test-Path $target) { Remove-Item -Recurse -Force $target }
    Copy-Item -Recurse -Force $_.FullName $target
  }
}

function Ensure-NodeModulesLink([string]$SourceRoot, [string]$DestRoot) {
  $srcNodeModules = Join-Path $SourceRoot 'node_modules'
  $destNodeModules = Join-Path $DestRoot 'node_modules'
  if ((Test-Path $srcNodeModules) -and -not (Test-Path $destNodeModules)) {
    cmd /c mklink /J "$destNodeModules" "$srcNodeModules" | Out-Null
  }
}

Write-Host 'Quest Game - gstack setup for Cursor (Windows)' -ForegroundColor Cyan

if (-not (Test-Path $GitBash)) {
  throw 'Git for Windows (Git Bash) required: https://git-scm.com/download/win'
}
Require-Command bun 'Install Bun: https://bun.sh'
Require-Command node 'Install Node.js LTS: https://nodejs.org'
if (-not (Test-Path $GstackSrc)) {
  throw "gstack source not found at $GstackSrc. Clone: git clone https://github.com/garrytan/gstack.git"
}

$env:Path = "$env:USERPROFILE\.bun\bin;C:\Program Files\Git\bin;C:\Program Files\nodejs;" + $env:Path

$GstackBashPath = To-GstackBashPath $GstackSrc
$HasGit = Test-Path (Join-Path $GstackSrc '.git')
$srcVerBefore = Read-GstackVersion $GstackSrc
$claudeVerBefore = Read-GstackVersion $ClaudeGstack

if ($HasGit) {
  Write-Host "Updating gstack source at $GstackSrc ..."
  & $GitBash -lc "cd '$GstackBashPath' && git fetch origin && (git pull --ff-only origin main || git pull --ff-only || true)"
  Write-Host "Running ./setup in $GstackSrc ..."
  & $GitBash -lc "cd '$GstackBashPath' && ./setup --prefix --quiet --no-plan-tune-hooks"
  if ($LASTEXITCODE -ne 0) {
    throw "./setup failed with exit code $LASTEXITCODE"
  }
}
else {
  Write-Warning "GSTACK_SRC is not a git repo ($GstackSrc). Skipping git pull and ./setup there."
  Write-Warning 'For a single source of truth: git clone https://github.com/garrytan/gstack.git and set GSTACK_SRC.'
}

$srcVer = Read-GstackVersion $GstackSrc
$claudeVer = Read-GstackVersion $ClaudeGstack

$syncSource = $GstackSrc
$syncLabel = 'GSTACK_SRC'

if ((Compare-GstackVersion $claudeVer $srcVer) -gt 0) {
  if (-not (Test-Path $ClaudeGstack)) {
    throw "Claude gstack install missing at $ClaudeGstack but is newer than GSTACK_SRC."
  }
  $syncSource = $ClaudeGstack
  $syncLabel = 'Claude global install'
  Write-Host "Using $syncLabel (v$claudeVer) because it is newer than GSTACK_SRC (v$srcVer)."
}
elseif (-not $HasGit -and (Compare-GstackVersion $srcVer $claudeVer) -gt 0) {
  Write-Host "Running ./setup in GSTACK_SRC to refresh Claude install ..."
  & $GitBash -lc "cd '$GstackBashPath' && ./setup --prefix --quiet --no-plan-tune-hooks"
  if ($LASTEXITCODE -ne 0) {
    throw "./setup failed with exit code $LASTEXITCODE"
  }
  $claudeVer = Read-GstackVersion $ClaudeGstack
}

if ($syncSource -eq $GstackSrc) {
  Write-Host 'Building browse and regenerating Cursor skill docs from source tree ...'
  Push-Location $GstackSrc
  try {
    & $GitBash -lc "cd '$GstackBashPath' && bash scripts/build.sh"
    if ($LASTEXITCODE -ne 0) { throw "scripts/build.sh failed with exit code $LASTEXITCODE" }
    bun run gen:skill-docs --host cursor
    if ($LASTEXITCODE -ne 0) { throw "gen:skill-docs failed with exit code $LASTEXITCODE" }
  }
  finally {
    Pop-Location
  }
}
else {
  Write-Host 'Skipping source build; copying runtime and skills from Claude global install.'
}

Write-Host "Syncing Cursor from $syncLabel ..."
Sync-CursorRuntime -SourceRoot $syncSource -DestRoot $CursorGstack
Sync-CursorSkillStubs -SourceRoot $syncSource
Ensure-NodeModulesLink -SourceRoot $syncSource -DestRoot $CursorGstack

$BrowseExe = Join-Path $CursorGstack 'browse\dist\browse.exe'
if (-not (Test-Path $BrowseExe)) {
  throw "browse.exe missing after install. Check $syncSource\browse\dist"
}

$srcVer = Read-GstackVersion $GstackSrc
$cursorVer = Read-GstackVersion $CursorGstack
$claudeVer = Read-GstackVersion $ClaudeGstack

Write-Host ''
Write-Host 'gstack ready for Cursor.' -ForegroundColor Green
Write-Host ('  GSTACK_SRC: {0} (v{1}){2}' -f $GstackSrc, $srcVer, $(if ($HasGit) { '' } else { ' [not a git repo]' }))
Write-Host ('  Claude:     {0} (v{1})' -f $ClaudeGstack, $claudeVer)
Write-Host ('  Cursor:     {0} (v{1})' -f $CursorGstack, $cursorVer)
Write-Host ('  Synced from: {0}' -f $syncLabel)
Write-Host ('  Browse:     {0}' -f $BrowseExe)
Write-Host '  Terminal: use Git Bash in Cursor (workspace .vscode/settings.json)'
Write-Host '  Verify:     ~/.cursor/skills/gstack/bin/gstack-slug (Git Bash)'
Write-Host ''

if ($cursorVer -and $claudeVer -and ($cursorVer -ne $claudeVer)) {
  throw "Cursor ($cursorVer) and Claude ($claudeVer) versions differ after sync."
}
if ($HasGit -and $srcVer -and $cursorVer -and ($srcVer -ne $cursorVer)) {
  throw "GSTACK_SRC ($srcVer) and Cursor ($cursorVer) versions differ after sync."
}
if (-not $HasGit -and $srcVer -and $claudeVer -and ($srcVer -ne $claudeVer)) {
  Write-Warning "GSTACK_SRC (v$srcVer) is stale. Cursor and Claude are aligned at v$claudeVer."
  Write-Warning 'Re-clone gstack into GSTACK_SRC or run gstack-upgrade, then re-run this script.'
}
