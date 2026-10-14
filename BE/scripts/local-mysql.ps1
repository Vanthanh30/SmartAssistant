param([ValidateSet('start','stop')][string]$Action = 'start',
  [string]$ServerBinary = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe')
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $backendRoot 'storage\mysql-auth'
$pidPath = Join-Path $dataPath 'process-id'
if (!(Test-Path -LiteralPath (Join-Path $dataPath 'auto.cnf'))) { throw 'Requires an already initialized isolated auth instance; never auto-initializes DB.' }
$resolvedData = (Resolve-Path -LiteralPath $dataPath).Path.Replace('\','/')
$existingProcess = $null
if (Test-Path -LiteralPath $pidPath) {
  $recordedPid = [int](Get-Content -LiteralPath $pidPath)
  $existingProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$recordedPid"
}
if ($existingProcess) {
  if ($existingProcess.Name -ne 'mysqld.exe' -or !$existingProcess.CommandLine.Contains($resolvedData)) { throw 'PID does not match the isolated auth instance; refusing to touch another process.' }
  if ($Action -eq 'start') { Write-Output 'Local auth MySQL is already running.'; exit 0 }
}
if ($Action -eq 'stop') {
  # SQL SHUTDOWN via root.local lets InnoDB shut down cleanly, without killing a shared service.
  if ($existingProcess) {
    & node (Join-Path $PSScriptRoot 'stop-local-mysql.js')
    if ($LASTEXITCODE -ne 0) { throw 'MySQL shutdown failed.' }
    Wait-Process -Id $existingProcess.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
  }
  else { Write-Output 'Local auth MySQL is stopped.' }
  exit 0
}
if (Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 3307 is busy; refusing to start or stop another service.' }
$started = Start-Process -FilePath $ServerBinary -ArgumentList '--no-defaults',('--datadir="' + $resolvedData + '"'),'--port=3307','--bind-address=127.0.0.1','--mysqlx=0','--console' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataPath 'stdout.log') -RedirectStandardError (Join-Path $dataPath 'stderr.log')
$started.Id | Set-Content -LiteralPath $pidPath
Write-Output "Local auth MySQL started, PID $($started.Id), port 3307. Check readiness before starting API."
