$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

npm run build:pages
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git add docs
git diff --cached --quiet -- docs
if ($LASTEXITCODE -eq 0) {
    Write-Output 'No job feed changes to publish.'
    exit 0
}

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
git commit -m "Refresh job feed $stamp"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git push origin main
exit $LASTEXITCODE
