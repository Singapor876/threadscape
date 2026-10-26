$ErrorActionPreference = 'Stop'
$runtimeRoot = 'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node'
$nodeExe = Join-Path $runtimeRoot 'bin\node.exe'
$pnpmEntry = Join-Path $runtimeRoot 'node_modules\pnpm\bin\pnpm.mjs'

if (-not (Test-Path -LiteralPath $nodeExe)) {
  throw 'Node 24 runtime was not found. Install Node.js 22.13 or newer.'
}

$major = & $nodeExe -p "Number(process.versions.node.split('.')[0])"
if ([int]$major -lt 22) {
  throw 'Threadscape requires Node.js 22.13 or newer.'
}

& $nodeExe $pnpmEntry install --registry https://registry.npmjs.org
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $nodeExe $pnpmEntry dev
exit $LASTEXITCODE
