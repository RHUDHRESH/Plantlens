<#
.SYNOPSIS
  Start the PlantLens gateway automatically at Windows logon (Task Scheduler).

.DESCRIPTION
  Registers a per-user scheduled task that runs start-gateway.ps1 (which restarts the gateway if
  it crashes) when you log on. It runs as YOU, so it uses your %APPDATA%\PlantLens config and your
  USB serial ports. Run start-gateway.bat once first so the setup wizard saves a config.

  For a gateway that must run with nobody logged on, run the task as a service account instead
  and point it at the config explicitly (set PLANTLENS_GATEWAY_CONFIG for that account).

.EXAMPLE
  .\install-task.ps1                   # task "PlantLens Gateway"
  .\install-task.ps1 -Profile uno      # task "PlantLens Gateway (uno)"
  .\install-task.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [Alias('Profile')][string]$GatewayProfile = '',
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'

if ($GatewayProfile -and $GatewayProfile -notmatch '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') {
    throw "invalid profile name '$GatewayProfile'"
}
$TaskName = 'PlantLens Gateway'
if ($GatewayProfile) { $TaskName = "PlantLens Gateway ($GatewayProfile)" }

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[plantlens] removed task '$TaskName'"
    exit 0
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $ScriptDir 'start-gateway.ps1'
$VPy = Join-Path (Split-Path -Parent $ScriptDir) '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $VPy)) { throw "Run start-gateway.bat once first (creates the venv and the config)." }

$argList = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$Launcher`" -NoPause"
if ($GatewayProfile) { $argList += " -Profile $GatewayProfile" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argList -WorkingDirectory $ScriptDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
# No execution time limit; restart the launcher itself if it ever dies.
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Principal $principal -Description 'PlantLens read-only gateway (apps/gateway/scripts/start-gateway.ps1)' -Force | Out-Null
Write-Host "[plantlens] registered task '$TaskName' (runs at logon). Start it now with:"
Write-Host "            Start-ScheduledTask -TaskName '$TaskName'"
