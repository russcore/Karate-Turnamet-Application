<#
.SYNOPSIS
  One-shot installer for the Karate Tournament (Tatami) Management app.
.DESCRIPTION
  Installs dependencies, prepares the SQLite database, seeds the first admin
  (optionally with demo data) and builds the production bundle. No Docker required.
.PARAMETER Demo
  Seed 200 synthetic demo fighters as well as the defaults.
.PARAMETER SkipBuild
  Skip the production build (faster if you only want to run `npm run dev`).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Demo
#>
param(
  [switch]$Demo,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

function Info($m)  { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "[!] $m"  -ForegroundColor Yellow }
function Fail($m)  { Write-Host "[X] $m"  -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host " Karate Tournament Manager - installer" -ForegroundColor White
Write-Host " -------------------------------------" -ForegroundColor DarkGray

# 1) Node.js >= 20
Info "Checking Node.js"
try { $nodeV = (node --version) } catch { Fail "Node.js is not installed. Install Node 20+ from https://nodejs.org and re-run." }
$major = [int]($nodeV.TrimStart('v').Split('.')[0])
if ($major -lt 20) { Fail "Node $nodeV found, but 20+ is required." }
Ok "Node $nodeV"

# 2) server/.env (create from example, with a fresh JWT secret)
$envPath = Join-Path $root 'server\.env'
if (-not (Test-Path $envPath)) {
  Info "Creating server\.env from .env.example"
  $example = Get-Content (Join-Path $root '.env.example') -Raw
  $bytes = New-Object 'System.Byte[]' 48
  (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  $example = $example -replace 'JWT_SECRET="[^"]*"', ('JWT_SECRET="' + $secret + '"')
  Set-Content -Path $envPath -Value $example -Encoding UTF8
  Ok "server\.env created (unique JWT secret generated)"
} else {
  Ok "server\.env already exists (kept)"
}

# Make sure data/ and uploads/ exist (they travel with the folder)
New-Item -ItemType Directory -Force -Path (Join-Path $root 'data')    | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root 'uploads') | Out-Null

# 3) Dependencies (npm workspaces installs server + client)
Info "Installing dependencies (npm install)"
npm install
if ($LASTEXITCODE -ne 0) { Fail "npm install failed." }
Ok "Dependencies installed"

# 4) Prisma client + database schema
Info "Generating Prisma client"
npm run prisma:generate
if ($LASTEXITCODE -ne 0) { Fail "prisma generate failed." }
Info "Creating / updating the SQLite database"
npm run prisma:push
if ($LASTEXITCODE -ne 0) { Fail "prisma db push failed." }
Ok "Database ready (data\karate.sqlite)"

# 5) Seed the first admin (+ optional demo roster)
if ($Demo) {
  Info "Seeding defaults + 200 demo fighters"
  npm run seed:demo
} else {
  Info "Seeding defaults (admin, ranks, event)"
  npm run seed
}
if ($LASTEXITCODE -ne 0) { Fail "seed failed." }
Ok "Seed complete (watch the output above for the admin credentials)"

# 6) Production build
if (-not $SkipBuild) {
  Info "Building the production bundle"
  npm run build
  if ($LASTEXITCODE -ne 0) { Fail "build failed." }
  Ok "Production build ready"
}

Write-Host ""
Write-Host " Installation complete!" -ForegroundColor Green
Write-Host " ----------------------" -ForegroundColor DarkGray
Write-Host " Development mode : " -NoNewline; Write-Host "npm run dev"   -ForegroundColor White
Write-Host "                    (client http://localhost:5173, api :4000)"
Write-Host " Production mode  : " -NoNewline; Write-Host "npm run serve" -ForegroundColor White
Write-Host "                    (serves the app on http://localhost - port 80, run as admin)"
Write-Host ""
Write-Host " First login uses the admin credentials printed during the seed step above." -ForegroundColor Yellow
Write-Host " Read MANUAL.md for full usage instructions." -ForegroundColor Yellow
Write-Host ""
