# SosyalCan tek komutla kurulum (Windows, PowerShell). Gerekli: Docker Desktop açık olmalı.
#   powershell -ExecutionPolicy Bypass -File kurulum.ps1
# .env yoksa gizli anahtarları ve ilk Admin şifresini rastgele üretir, ardından her şeyi Docker ile kurar.
# Soru sormadan: kurulum.ps1 -AdminEmail admin@ajansiniz.com
param([string]$AdminEmail)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function New-Secret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  return ([Convert]::ToBase64String($buffer) -replace '[+/=]', '')
}

docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker çalışmıyor. Docker Desktop'ı açıp tekrar dene." -ForegroundColor Red; exit 1 }

if (-not (Test-Path ".env")) {
  $email = $AdminEmail
  if (-not $email) {
    try { $email = Read-Host "İlk Admin e-postası (boş bırakırsan admin@sosyalcan.local)" } catch { $email = "" }
  }
  if (-not $email) { $email = "admin@sosyalcan.local" }
  $adminPassword = "Sc-" + (New-Secret 9) + "7"
  $content = (Get-Content ".env.example" -Raw)
  $content = $content -replace "POSTGRES_PASSWORD=.*", "POSTGRES_PASSWORD=$(New-Secret 24)"
  $content = $content -replace "AUTH_SECRET=.*", "AUTH_SECRET=$(New-Secret 48)"
  $content = $content -replace "CRON_SECRET=.*", "CRON_SECRET=$(New-Secret 24)"
  $content = $content -replace "SEED_ADMIN_EMAIL=.*", "SEED_ADMIN_EMAIL=$email"
  $content = $content -replace "SEED_ADMIN_PASSWORD=.*", "SEED_ADMIN_PASSWORD=$adminPassword"
  [System.IO.File]::WriteAllText("$PSScriptRoot\.env", $content, (New-Object System.Text.UTF8Encoding $false))
  Write-Host ".env oluşturuldu (gizli anahtarlar rastgele üretildi)." -ForegroundColor Green
} else {
  Write-Host ".env zaten var, olduğu gibi kullanılıyor."
}

Write-Host "Docker imajları hazırlanıyor ve başlatılıyor (ilk seferde birkaç dakika sürer)..."
docker compose --profile app up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host "Kurulum başarısız. Ayrıntı: docker compose --profile app logs" -ForegroundColor Red; exit 1 }

$port = ((Get-Content ".env" | Where-Object { $_ -match '^APP_PORT=' }) -replace 'APP_PORT=', '')
if (-not $port) { $port = "3000" }
Write-Host "Uygulamanın açılması bekleniyor..."
for ($i = 0; $i -lt 60; $i++) {
  try { if ((Invoke-WebRequest "http://localhost:$port/api/health" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200) { break } } catch {}
  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "SosyalCan hazır: http://localhost:$port" -ForegroundColor Green
$admin = (Get-Content ".env" | Where-Object { $_ -match '^SEED_ADMIN_(EMAIL|PASSWORD)=' })
Write-Host "İlk giriş bilgileri (.env dosyasında da var; ilk girişte şifre değiştirilir):"
$admin | ForEach-Object { Write-Host "  $_" }
