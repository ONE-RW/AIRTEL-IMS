param(
  [string]$InstallDir = "$env:ProgramData\AirtelIMSDeviceAgent",
  [string]$PythonCommand = "python"
)

$ErrorActionPreference = "Stop"

Write-Host "Preparing Airtel IMS Device Agent in $InstallDir"

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

$agentSource = Join-Path $PSScriptRoot "agent.py"
$requirementsSource = Join-Path $PSScriptRoot "requirements.txt"
$configExampleSource = Join-Path $PSScriptRoot "agent-config.example.json"

Copy-Item $agentSource (Join-Path $InstallDir "agent.py") -Force
Copy-Item $requirementsSource (Join-Path $InstallDir "requirements.txt") -Force

$targetConfig = Join-Path $InstallDir "agent-config.json"
if (-not (Test-Path $targetConfig)) {
  Copy-Item $configExampleSource $targetConfig -Force
}

Push-Location $InstallDir
try {
  & $PythonCommand -m venv .venv
  & (Join-Path $InstallDir ".venv\Scripts\python.exe") -m pip install --upgrade pip
  & (Join-Path $InstallDir ".venv\Scripts\python.exe") -m pip install -r (Join-Path $InstallDir "requirements.txt")

  $taskAction = New-ScheduledTaskAction -Execute (Join-Path $InstallDir ".venv\Scripts\python.exe") -Argument "`"$InstallDir\agent.py`""
  $taskTrigger = New-ScheduledTaskTrigger -AtLogOn
  $taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName "Airtel IMS Device Agent" -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Description "Uploads workstation health telemetry to Airtel IMS." -Force | Out-Null
}
finally {
  Pop-Location
}

Write-Host "Installation complete."
Write-Host "Update $targetConfig with the real asset tag and API settings before first launch."
Write-Host "You can test immediately with:"
Write-Host "  $InstallDir\.venv\Scripts\python.exe $InstallDir\agent.py --once"
