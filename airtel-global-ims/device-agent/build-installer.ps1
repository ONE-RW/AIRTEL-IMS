param(
  [string]$PythonCommand = "python"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $scriptDir "dist"
$buildDir = Join-Path $scriptDir "build-installer"
$specFile = Join-Path $scriptDir "AirtelIMSDeviceAgentSetup.spec"
$agentExe = Join-Path $distDir "AirtelIMSDeviceAgent.exe"

Push-Location $scriptDir
try {
  if (-not (Test-Path $agentExe)) {
    throw "Build AirtelIMSDeviceAgent.exe first. Expected file: $agentExe"
  }

  & $PythonCommand -m pip install -r requirements.txt pyinstaller

  if (Test-Path $buildDir) {
    Remove-Item -Recurse -Force $buildDir
  }

  if (Test-Path $specFile) {
    Remove-Item -Force $specFile
  }

  & $PythonCommand -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --name AirtelIMSDeviceAgentSetup `
    --specpath $scriptDir `
    --distpath $distDir `
    --workpath $buildDir `
    --add-data "$agentExe;." `
    installer.py

  Write-Host ""
  Write-Host "Installer build complete:"
  Write-Host "  $distDir\AirtelIMSDeviceAgentSetup.exe"
}
finally {
  Pop-Location
}
