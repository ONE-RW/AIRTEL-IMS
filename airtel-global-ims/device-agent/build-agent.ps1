param(
  [string]$PythonCommand = "python"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$distDir = Join-Path $scriptDir "dist"
$buildDir = Join-Path $scriptDir "build"
$specFile = Join-Path $scriptDir "AirtelIMSDeviceAgent.spec"

Push-Location $scriptDir
try {
  & $PythonCommand -m pip install -r requirements.txt pyinstaller

  if (Test-Path $distDir) {
    Remove-Item -Recurse -Force $distDir
  }

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
    --name AirtelIMSDeviceAgent `
    agent.py

  Write-Host ""
  Write-Host "Build complete:"
  Write-Host "  $distDir\AirtelIMSDeviceAgent.exe"
}
finally {
  Pop-Location
}
