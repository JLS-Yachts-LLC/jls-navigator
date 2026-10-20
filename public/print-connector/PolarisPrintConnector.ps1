<#
  Polaris Print Connector
  -----------------------
  Collects label jobs from Polaris and sends them to Zebra printers on this network.

  * Calls OUT to Polaris over HTTPS only (POST /api/print-connector/poll). Nothing listens here.
  * Prints only to the printer addresses in AllowedHosts (config.json), on port 9100 or 6101.
  * Sends only the ZPL commands Polaris' label renderer uses (src/lib/printing/zpl.ts) —
    anything else, including every "~" command, is refused, so a job can't reconfigure a printer.
  * Reads each printer's status (~HS) every minute and before each job: out of labels,
    head open, paused or unreachable shows on ShipSync -> Printers and on the phones.

  Installed by install.ps1 to "C:\Program Files\Polaris Print Connector" and run at start-up
  by the "Polaris Print Connector" scheduled task as NT AUTHORITY\LOCAL SERVICE.
  Config and log: C:\ProgramData\PolarisPrintConnector\ (config.json, connector.log).
#>
param([string]$ConfigPath = (Join-Path $env:ProgramData 'PolarisPrintConnector\config.json'))

$ErrorActionPreference = 'Stop'
$Version = '1.0.0'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LogPath = Join-Path (Split-Path $ConfigPath) 'connector.log'
function Write-Log([string]$Message) {
  try {
    if ((Test-Path $LogPath) -and (Get-Item $LogPath).Length -gt 1MB) { Move-Item $LogPath "$LogPath.1" -Force }
    Add-Content -Path $LogPath -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $Message)
  } catch { }
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$Base = ([string]$cfg.PolarisUrl).TrimEnd('/')
$Token = [string]$cfg.Token
$Allowed = @($cfg.AllowedHosts | ForEach-Object { ([string]$_).Trim().ToLowerInvariant() } | Where-Object { $_ })
if (-not $Base.StartsWith('https://')) { Write-Log 'PolarisUrl must start with https:// - stopping.'; exit 1 }
if (-not $Token) { Write-Log 'No token in config.json - stopping.'; exit 1 }

# Every command Polaris' renderer emits. Keep in step with ZPL_COMMANDS in src/lib/printing/zpl.ts.
$AllowedCommands = @('XA', 'XZ', 'CI', 'PW', 'LL', 'LH', 'FO', 'BQ', 'FD', 'FS', 'A0', 'FB', 'FH', 'PQ')

function Test-Zpl([string]$Zpl) {
  if ($Zpl.Length -gt 500000) { return 'The job is too large' }
  if (-not $Zpl.TrimStart().StartsWith('^XA')) { return 'The job is not a label' }
  if ($Zpl.Contains('~')) { return 'The job contains a printer control command' }
  foreach ($m in [regex]::Matches($Zpl, '\^(.{0,2})')) {
    if ($AllowedCommands -notcontains $m.Groups[1].Value.ToUpperInvariant()) { return "The job contains a command this connector doesn't send (^$($m.Groups[1].Value))" }
  }
  return $null
}

function Test-Target([string]$PrinterHost, [int]$Port) {
  if ($Allowed -notcontains $PrinterHost.ToLowerInvariant()) { return "$PrinterHost is not one of this connector's allowed printers (AllowedHosts in config.json)" }
  if ($Port -ne 9100 -and $Port -ne 6101) { return "Port $Port is not a printer port" }
  return $null
}

function Open-Printer([string]$PrinterHost, [int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  $iar = $client.BeginConnect($PrinterHost, $Port, $null, $null)
  if (-not $iar.AsyncWaitHandle.WaitOne(5000)) { $client.Close(); throw "Can't reach the printer at $PrinterHost" }
  $client.EndConnect($iar)
  $client.SendTimeout = 10000
  $client.ReceiveTimeout = 3000
  return $client
}

# ~HS: three status strings, each wrapped in STX ... ETX.
#   1: aaa,b,c,...   b = paper out, c = paused
#   2: mmm,n,o,p,q   o = head open, p = ribbon out, q = thermal-transfer mode
function Get-PrinterStatus([string]$PrinterHost, [int]$Port) {
  $bad = Test-Target $PrinterHost $Port
  if ($bad) { return @{ status = 'error'; detail = $bad } }
  try {
    $client = Open-Printer $PrinterHost $Port
    try {
      $stream = $client.GetStream()
      $q = [Text.Encoding]::ASCII.GetBytes("~HS`r`n")
      $stream.Write($q, 0, $q.Length)
      $buf = New-Object byte[] 1024
      $text = ''
      $deadline = (Get-Date).AddSeconds(3)
      while (([regex]::Matches($text, [char]3)).Count -lt 3 -and (Get-Date) -lt $deadline) {
        try { $n = $stream.Read($buf, 0, $buf.Length) } catch { break }
        if ($n -le 0) { break }
        $text += [Text.Encoding]::ASCII.GetString($buf, 0, $n)
      }
    } finally { $client.Close() }
    $parts = @([regex]::Matches($text, [char]2 + '([^' + [char]3 + ']*)' + [char]3) | ForEach-Object { $_.Groups[1].Value })
    if ($parts.Count -lt 2) { return @{ status = 'ready'; detail = 'Reachable (no status reply)' } }
    $s1 = $parts[0].Split(','); $s2 = $parts[1].Split(',')
    if ($s2.Count -gt 2 -and $s2[2] -eq '1') { return @{ status = 'head_open'; detail = $null } }
    if ($s1.Count -gt 1 -and $s1[1] -eq '1') { return @{ status = 'paper_out'; detail = $null } }
    if ($s2.Count -gt 4 -and $s2[3] -eq '1' -and $s2[4] -eq '1') { return @{ status = 'ribbon_out'; detail = $null } }
    if ($s1.Count -gt 2 -and $s1[2] -eq '1') { return @{ status = 'paused'; detail = $null } }
    return @{ status = 'ready'; detail = $null }
  } catch {
    return @{ status = 'unreachable'; detail = $_.Exception.Message }
  }
}

function Send-Job($Job) {
  $bad = Test-Target ([string]$Job.host) ([int]$Job.port)
  if (-not $bad) { $bad = Test-Zpl ([string]$Job.zpl) }
  if ($bad) { return @{ ok = $false; error = $bad } }

  $st = Get-PrinterStatus ([string]$Job.host) ([int]$Job.port)
  $script:Statuses[[string]$Job.printer_id] = @{ id = [string]$Job.printer_id; status = $st.status; detail = $st.detail }
  $why = @{ head_open = 'The print head is open'; paper_out = 'The printer is out of labels'; ribbon_out = 'The printer is out of ribbon'; paused = 'The printer is paused'; unreachable = "Can't reach the printer" }
  if ($st.status -ne 'ready') { return @{ ok = $false; error = $(if ($why[$st.status]) { $why[$st.status] } else { $st.detail }) } }

  try {
    $client = Open-Printer ([string]$Job.host) ([int]$Job.port)
    try {
      $bytes = [Text.Encoding]::UTF8.GetBytes([string]$Job.zpl)
      $stream = $client.GetStream()
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush()
    } finally { $client.Close() }
    return @{ ok = $true }
  } catch {
    return @{ ok = $false; error = "Sending to the printer failed: $($_.Exception.Message)" }
  }
}

Write-Log "Started v$Version on $env:COMPUTERNAME; Polaris $Base; allowed printers: $($Allowed -join ', ')"
$Results = New-Object System.Collections.ArrayList
$script:Statuses = @{}
$Printers = @()
$LastCheck = [datetime]::MinValue
$Backoff = 2

while ($true) {
  try {
    $body = @{
      hostname = $env:COMPUTERNAME
      version  = $Version
      wait     = 20
      results  = @($Results)
      printers = @($script:Statuses.Values)
    } | ConvertTo-Json -Depth 5 -Compress
    $resp = Invoke-RestMethod -Method Post -Uri "$Base/api/print-connector/poll" -Headers @{ Authorization = "Bearer $Token" } -ContentType 'application/json' -Body $body -TimeoutSec 60 -UseBasicParsing
    $Results.Clear()
    $script:Statuses = @{}
    $Printers = @($resp.printers)
    $Backoff = 2

    foreach ($job in @($resp.jobs)) {
      if (-not $job) { continue }
      $r = Send-Job $job
      [void]$Results.Add(@{ id = [string]$job.id; ok = $r.ok; error = $r.error })
      Write-Log ("Job {0} -> {1}: {2}" -f $job.id, $job.host, $(if ($r.ok) { 'sent' } else { $r.error }))
    }

    if (((Get-Date) - $LastCheck).TotalSeconds -ge 60) {
      foreach ($p in $Printers) {
        if (-not $p -or $script:Statuses.ContainsKey([string]$p.id)) { continue }
        $st = Get-PrinterStatus ([string]$p.host) ([int]$p.port)
        $script:Statuses[[string]$p.id] = @{ id = [string]$p.id; status = $st.status; detail = $st.detail }
      }
      $LastCheck = Get-Date
    }
  } catch {
    $code = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch { }
    Write-Log ("Polaris call failed{0}: {1}" -f $(if ($code) { " ($code)" } else { '' }), $_.Exception.Message)
    # A refused token won't fix itself quickly: wait longer before trying again.
    Start-Sleep -Seconds $(if ($code -eq 401) { 300 } else { $Backoff })
    $Backoff = [Math]::Min($Backoff * 2, 60)
  }
}
