# Распаковка db_cluster-*.backup.gz для просмотра (без pg_restore)
param(
  [string]$GzPath = "..\..\archive\backups\db_cluster-09-12-2025@04-29-26.backup.gz",
  [string]$OutDir = "$PSScriptRoot\backup-extract"
)

$resolved = Resolve-Path $GzPath -ErrorAction Stop
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$dest = Join-Path $OutDir "db.backup"

if (-not (Test-Path $dest)) {
  Write-Host "Распаковка $resolved ..."
  $fs = [System.IO.File]::OpenRead($resolved)
  $gzip = New-Object System.IO.Compression.GZipStream($fs, [IO.Compression.CompressionMode]::Decompress)
  $outFs = [System.IO.File]::Create($dest)
  $gzip.CopyTo($outFs)
  $outFs.Close(); $gzip.Close(); $fs.Close()
}

Write-Host "Файл: $dest"
Write-Host "Таблицы public:"
Select-String -Path $dest -Pattern "^COPY public\." | ForEach-Object { $_.Line }
