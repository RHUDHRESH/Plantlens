<#
.SYNOPSIS
  PlantLens gateway launcher for Windows (double-click start-gateway.bat, or run this in PowerShell).

.DESCRIPTION
  Finds Python 3.12+ (py launcher or python on PATH), creates apps\gateway\.venv, installs the
  gateway, runs the setup wizard when no config exists yet (or with -Setup), then runs the gateway
  and restarts it with backoff if it crashes. Works from any current directory and from paths
  with spaces. The config (with the ingest token) is saved per user in
  %APPDATA%\PlantLens\gateway.env, never in the repository.

.EXAMPLE
  .\start-gateway.ps1                     # first run: wizard, then gateway
  .\start-gateway.ps1 -Setup              # re-run the wizard (new PC, new device, new token)
  .\start-gateway.ps1 -Profile uno        # a second device on the same PC (own config + health port)
  .\start-gateway.ps1 -Setup -Server http://192.168.1.50:8000 -Token XXX -Mode modbus -Yes
  start-gateway.bat -Setup -Port COM5          # pick the device yourself (also sn:SERIAL or VID:PID)
#>
[CmdletBinding()]
param(
    [switch]$Setup,
    [Alias('Profile')][string]$GatewayProfile = $env:PLANTLENS_GATEWAY_PROFILE,
    [switch]$NoRestart,
    [switch]$NoInstall,
    [switch]$NoPause,
    # Passed to the setup wizard (python -m gateway.setup_wizard --help):
    [string]$Server,
    [string]$Token,
    [ValidateSet('', 'modbus', 'line')][string]$Mode = '',
    [string]$Port,
    [switch]$Yes
)

$WizardArgs = @()
if ($Server) { $WizardArgs += @('--server', $Server) }
if ($Token) { $WizardArgs += @('--token', $Token) }
if ($Mode) { $WizardArgs += @('--mode', $Mode) }
if ($Port) { $WizardArgs += @('--port', $Port) }
if ($Yes) { $WizardArgs += '--yes' }

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

function Say([string]$Message) { Write-Host "[plantlens] $Message" }
function Fail([string]$Message) {
    Write-Host "[plantlens] ERROR: $Message" -ForegroundColor Red
    # Keep a double-clicked window open long enough to read the message.
    if (-not $NoPause -and $Host.Name -eq 'ConsoleHost' -and [Environment]::UserInteractive) {
        try { Read-Host 'Press Enter to close' | Out-Null } catch { }
    }
    exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$GwDir = (Resolve-Path (Join-Path $ScriptDir '..')).Path
$Venv = Join-Path $GwDir '.venv'
$VPy = Join-Path $Venv 'Scripts\python.exe'

if ($GatewayProfile) {
    if ($GatewayProfile -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') { Fail "invalid profile name '$GatewayProfile' (letters, digits, - and _)" }
    $env:PLANTLENS_GATEWAY_PROFILE = $GatewayProfile
}

# ------------------------------------------------------------------ Python 3.12+
function Test-Python([string[]]$Cmd) {
    try {
        $exe = $Cmd[0]
        $rest = @()
        if ($Cmd.Length -gt 1) { $rest = $Cmd[1..($Cmd.Length - 1)] }
        & $exe @rest -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

function Find-Python {
    $candidates = @(
        @('py', '-3.13'), @('py', '-3.12'), @('py', '-3'),
        @('python'), @('python3')
    )
    foreach ($c in $candidates) {
        if (Get-Command $c[0] -ErrorAction SilentlyContinue) {
            if (Test-Python $c) { return , $c }
        }
    }
    return $null
}

if (-not (Test-Path -LiteralPath $VPy)) {
    $py = Find-Python
    if (-not $py) {
        Fail 'Python 3.12 or newer is required. Install it from https://www.python.org/downloads/ (tick "Add python.exe to PATH") or: winget install Python.Python.3.12 -- then run this again.'
    }
    Say "creating virtual environment in $Venv (using $($py -join ' '))"
    $exe = $py[0]
    $rest = @()
    if ($py.Length -gt 1) { $rest = $py[1..($py.Length - 1)] }
    & $exe @rest -m venv "$Venv"
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $VPy)) { Fail 'could not create the virtual environment' }
}

$Stamp = Join-Path $Venv '.plantlens-installed'
$Pyproject = Join-Path $GwDir 'pyproject.toml'
$needInstall = -not (Test-Path -LiteralPath $Stamp)
if (-not $needInstall) { $needInstall = (Get-Item -LiteralPath $Pyproject).LastWriteTime -gt (Get-Item -LiteralPath $Stamp).LastWriteTime }
if (-not $NoInstall -and $needInstall) {
    Say 'installing the gateway into the venv (first run or updated dependencies)'
    & $VPy -m pip install --disable-pip-version-check -q --upgrade pip
    & $VPy -m pip install --disable-pip-version-check -q -e "$GwDir"
    if ($LASTEXITCODE -ne 0) { Fail 'pip install failed (network or proxy?)' }
    Set-Content -LiteralPath $Stamp -Value (Get-Date -Format o)
}

Set-Location -LiteralPath $GwDir   # tag map and .\.env resolve the same way from any directory

$Config = (& $VPy -m gateway.setup_wizard --config-path | Select-Object -Last 1)
if ($LASTEXITCODE -ne 0 -or -not $Config) { Fail 'could not determine the config path (is the venv healthy? try deleting apps\gateway\.venv)' }

# ------------------------------------------------------------------ setup wizard
if ($Setup -or $WizardArgs.Count -gt 0 -or -not (Test-Path -LiteralPath $Config)) {
    Say "running the setup wizard (config: $Config)"
    & $VPy -m gateway.setup_wizard @WizardArgs
    if ($LASTEXITCODE -ne 0) { Fail 'setup did not complete; nothing started' }
}

$HealthPort = '9101'
$line = Select-String -LiteralPath $Config -Pattern "^HEALTH_PORT=['`"]?(\d+)" -ErrorAction SilentlyContinue | Select-Object -Last 1
if ($line) { $HealthPort = $line.Matches[0].Groups[1].Value }
$suffix = ''
if ($GatewayProfile) { $suffix = " (profile $GatewayProfile)" }
Say "starting the gateway$suffix; health: http://localhost:$HealthPort/health ; Ctrl+C to stop"

# ------------------------------------------------------------------ run with restart
$delay = 2
while ($true) {
    $started = Get-Date
    & $VPy -m gateway.main
    $code = $LASTEXITCODE
    if ($code -eq 0) { Say 'gateway exited normally'; exit 0 }
    if ($NoRestart) { Fail "gateway exited with code $code" }
    $ran = [int]((Get-Date) - $started).TotalSeconds
    if ($ran -gt 60) { $delay = 2 }
    Say "gateway exited with code $code after ${ran}s; restarting in ${delay}s (Ctrl+C to stop)"
    Start-Sleep -Seconds $delay
    $delay = [Math]::Min($delay * 2, 60)
}
