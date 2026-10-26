$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonExe = Join-Path $projectRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $pythonExe)) {
  throw 'Python virtual environment is missing. Run: py -3.12 -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.txt'
}

$backend = Start-Process -FilePath $pythonExe `
  -ArgumentList '-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8000' `
  -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru

try {
  Start-Sleep -Seconds 1
  $env:PATH = 'C:\Program Files\nodejs;' + $env:PATH
  & 'C:\Program Files\nodejs\npm.cmd' run dev
} finally {
  if (-not $backend.HasExited) { Stop-Process -Id $backend.Id -Force }
}
