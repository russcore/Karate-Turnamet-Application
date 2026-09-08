<#
.SYNOPSIS
  Initialise git and publish this project to a NEW PRIVATE GitHub repository.
.DESCRIPTION
  Safe by design:
    * Never commits secrets or local data - .gitignore already excludes
      .env, server/.env, data/*.sqlite and uploads/*.
    * Creates a PRIVATE repository (never public unless you pass -Public).
  Two ways to publish:
    1. With the GitHub CLI (gh) installed + authenticated - fully automatic.
    2. Without gh - create an empty private repo on github.com yourself,
       then pass its URL with -RemoteUrl.
.PARAMETER RepoName
  Name for the new GitHub repo (default: karate-tournament).
.PARAMETER RemoteUrl
  Use an existing empty repo instead of gh, e.g.
  https://github.com/you/karate-tournament.git
.PARAMETER Public
  Create a PUBLIC repo instead of private. Not recommended.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\publish-to-github.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\publish-to-github.ps1 -RemoteUrl https://github.com/me/karate.git
#>
param(
  [string]$RepoName = 'karate-tournament',
  [string]$RemoteUrl = '',
  [switch]$Public
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[!] $m"  -ForegroundColor Yellow }
function Fail($m) { Write-Host "[X] $m"  -ForegroundColor Red; exit 1 }

# 1) git present
try { git --version | Out-Null } catch { Fail "git is not installed. Install from https://git-scm.com and re-run." }

# 2) init repo
if (-not (Test-Path (Join-Path $root '.git'))) {
  Info "Initialising git repository"
  git init | Out-Null
  git branch -M main
  Ok "git repo initialised (branch: main)"
} else {
  Ok "git repo already initialised"
}

# 3) safety: make sure secrets / data are ignored
Info "Verifying secrets and local data are ignored"
$leaks = @()
foreach ($p in @('server/.env', '.env')) {
  if (Test-Path (Join-Path $root $p)) {
    $tracked = (git check-ignore $p) 2>$null
    if (-not $tracked) { $leaks += $p }
  }
}
if ($leaks.Count -gt 0) {
  Fail ("These sensitive files are NOT ignored: " + ($leaks -join ', ') + ". Fix .gitignore before publishing.")
}
Ok "No secrets will be committed"

# 4) stage + commit
Info "Staging files"
git add -A
$pending = git status --porcelain
if ($pending) {
  git commit -m "Initial commit - Karate Tournament Manager" | Out-Null
  Ok "Commit created"
} else {
  Warn "Nothing to commit (working tree clean)"
}

# 5) create remote + push
$visibility = if ($Public) { '--public' } else { '--private' }

if ($RemoteUrl -ne '') {
  Info "Using provided remote: $RemoteUrl"
  git remote remove origin 2>$null | Out-Null
  git remote add origin $RemoteUrl
  git push -u origin main
  Ok "Pushed to $RemoteUrl"
}
else {
  $hasGh = $false
  try { gh --version | Out-Null; $hasGh = $true } catch { $hasGh = $false }
  if (-not $hasGh) {
    Warn "GitHub CLI (gh) not found."
    Write-Host "  Option A: install gh from https://cli.github.com, run 'gh auth login', then re-run this script."
    Write-Host "  Option B: create an empty PRIVATE repo on github.com and re-run with:"
    Write-Host "           .\publish-to-github.ps1 -RemoteUrl https://github.com/<you>/$RepoName.git" -ForegroundColor White
    exit 1
  }
  $hasOrigin = @(git remote) -contains 'origin'
  if ($hasOrigin) {
    Info "Remote 'origin' already configured - pushing"
    git push -u origin main
    if ($LASTEXITCODE -ne 0) { Fail "git push failed." }
  } else {
    $visWord = if ($Public) { 'public' } else { 'private' }
    Info "Creating $visWord GitHub repo '$RepoName' and pushing"
    gh repo create $RepoName $visibility --source=. --remote=origin --push
    if ($LASTEXITCODE -ne 0) { Fail "gh repo create failed (the repo may already exist - create it on github.com and re-run with -RemoteUrl, or run 'gh auth login')." }
  }
  Ok "Repository created and pushed"
}

Write-Host ""
Write-Host " Published. Manage the repo with the GitHub CLI or on github.com." -ForegroundColor Green
Write-Host ""
