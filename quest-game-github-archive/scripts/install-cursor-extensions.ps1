# Установка рекомендуемых расширений для Quest Game.
#
# ВАЖНО: все процессы Cursor должны быть завершены (не только закрыто окно).
#
# 1) Полностью выйти: File → Exit, или в PowerShell:
#      Stop-Process -Name Cursor -Force -ErrorAction SilentlyContinue
# 2) Подождать 3–5 сек, проверить:
#      Get-Process -Name Cursor -ErrorAction SilentlyContinue
# 3) Запустить этот скрипт:
#      powershell -ExecutionPolicy Bypass -File scripts/install-cursor-extensions.ps1
#
# Альтернатива (надёжнее): открыть Cursor → уведомление "Install Recommended Extensions" → Install All

$cursor = "C:\Program Files\cursor\resources\app\bin\cursor.cmd"
if (-not (Test-Path $cursor)) {
  Write-Error "Cursor CLI not found: $cursor"
  exit 1
}

$running = Get-Process -Name "Cursor" -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "ОШИБКА: Cursor всё ещё запущен ($($running.Count) процесс(ов))." -ForegroundColor Red
  Write-Host "Закройте Cursor полностью (File → Exit) или выполните:"
  Write-Host '  Stop-Process -Name Cursor -Force' -ForegroundColor Yellow
  Write-Host "Затем снова запустите этот скрипт."
  exit 1
}

$extensions = @(
  "dbaeumer.vscode-eslint",
  "esbenp.prettier-vscode",
  "bradlc.vscode-tailwindcss",
  "usernamehw.errorlens",
  "eamodio.gitlens",
  "dsznajder.es7-react-js-snippets"
)

$failed = @()
foreach ($id in $extensions) {
  Write-Host "Installing $id ..."
  & $cursor --install-extension $id --force 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) {
    $failed += $id
    Write-Warning "Failed: $id (exit $LASTEXITCODE)"
  } else {
    Write-Host "OK: $id" -ForegroundColor Green
  }
}

Write-Host "`nInstalled (matching):"
& $cursor --list-extensions 2>&1 | Select-String -Pattern "eslint|prettier|tailwind|errorlens|gitlens|es7-react"

if ($failed.Count -gt 0) {
  Write-Host "`nНе установлено: $($failed -join ', ')" -ForegroundColor Red
  Write-Host "Попробуйте в Cursor: Extensions (Ctrl+Shift+X) → поиск по ID → Install"
  exit 1
}

Write-Host "`nГотово." -ForegroundColor Green
