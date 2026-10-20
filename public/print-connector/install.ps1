<#
  Installs (or updates) the Polaris Print Connector on this server.

  Run in an ADMINISTRATOR PowerShell. Get the exact command — with this connector's token —
  from Polaris: ShipSync -> Printers -> Add connector (or "New token" on an existing one).

    -Token         the connector token Polaris showed (pc_...)
    -AllowedHosts  the printers' IP addresses; the connector prints to these and nothing else
    -PolarisUrl    defaults to https://polaris.jlsyachts.com

  What it does:
    * puts PolarisPrintConnector.ps1 in "C:\Program Files\Polaris Print Connector" (admin-only write)
    * writes C:\ProgramData\PolarisPrintConnector\config.json, readable only by Administrators,
      SYSTEM and LOCAL SERVICE (the token is in it)
    * registers the "Polaris Print Connector" scheduled task: runs at start-up as
      NT AUTHORITY\LOCAL SERVICE (no password, no domain rights), no run-time limit,
      restarts if it stops, and a 5-minute check that starts it again if it isn't running
    * starts it and checks each printer answers on port 9100

  Running it again replaces the token / printer list and restarts the connector.
  To remove:  Unregister-ScheduledTask 'Polaris Print Connector' -Confirm:$false; then delete the two folders.
#>
param(
  [Parameter(Mandatory = $true)][string]$Token,
  [Parameter(Mandatory = $true)][string[]]$AllowedHosts,
  [string]$PolarisUrl = 'https://polaris.jlsyachts.com'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run this in an administrator PowerShell.' }
if (-not $Token.StartsWith('pc_')) { throw 'That does not look like a Polaris connector token (it starts with pc_).' }
$PolarisUrl = $PolarisUrl.TrimEnd('/')
if (-not $PolarisUrl.StartsWith('https://')) { throw 'PolarisUrl must start with https://' }
$hosts = @($AllowedHosts | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne 'PRINTER-IP' })
if (-not $hosts.Count) { throw 'Give at least one printer IP in -AllowedHosts.' }

$TaskName = 'Polaris Print Connector'
$AppDir = Join-Path $env:ProgramFiles 'Polaris Print Connector'
$DataDir = Join-Path $env:ProgramData 'PolarisPrintConnector'
$Script = Join-Path $AppDir 'PolarisPrintConnector.ps1'
$Config = Join-Path $DataDir 'config.json'

Write-Host "Stopping any running connector..."
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue }

Write-Host "Downloading the connector from $PolarisUrl ..."
New-Item -ItemType Directory -Force -Path $AppDir, $DataDir | Out-Null
Invoke-WebRequest "$PolarisUrl/print-connector/PolarisPrintConnector.ps1" -UseBasicParsing -OutFile $Script
if (-not (Select-String -Path $Script -Pattern 'Polaris Print Connector' -Quiet)) { throw 'The download was not the connector script.' }
Unblock-File $Script

@{ PolarisUrl = $PolarisUrl; Token = $Token; AllowedHosts = $hosts } | ConvertTo-Json | Set-Content -Path $Config -Encoding UTF8

# SYSTEM (S-1-5-18) and Administrators (S-1-5-32-544) full; LOCAL SERVICE (S-1-5-19) may write its log
# in the folder but only read the config. Nobody else can read the token.
& icacls $DataDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
& icacls $Config /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' '*S-1-5-19:R' | Out-Null

Write-Host "Registering the scheduled task..."
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`""
$atBoot = New-ScheduledTaskTrigger -AtStartup
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\LOCALSERVICE' -LogonType ServiceAccount -RunLevel Limited
# ExecutionTimeLimit 0 = no limit. (The Windows default, 72 hours, silently kills long-running agents.)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $atBoot, $watchdog -Principal $principal -Settings $settings `
  -Description 'Sends Polaris label jobs to the Zebra printers on this network. Installed from Polaris -> ShipSync -> Printers.' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Checking the printers answer on port 9100..."
foreach ($h in $hosts) {
  $ok = $false
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $iar = $c.BeginConnect($h, 9100, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(3000) -and $c.Connected
    $c.Close()
  } catch { }
  if ($ok) { Write-Host "  $h  OK" -ForegroundColor Green } else { Write-Host "  $h  NOT REACHABLE on 9100 - check the IP, and that the printer is on" -ForegroundColor Yellow }
}

Start-Sleep -Seconds 8
Write-Host ""
Write-Host "Connector log ($DataDir\connector.log):"
if (Test-Path (Join-Path $DataDir 'connector.log')) { Get-Content (Join-Path $DataDir 'connector.log') -Tail 10 } else { Write-Host '  (nothing yet - give it a minute, then refresh ShipSync -> Printers)' }
Write-Host ""
Write-Host "Done. In Polaris, ShipSync -> Printers should show this connector as Online within a minute." -ForegroundColor Green
