$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$dirty = @(git status --porcelain --untracked-files=all | Where-Object { $_ -notmatch '^.. docs/jobs\.json$' })
if ($dirty.Count -gt 0) {
    Write-Error 'Source working tree is not clean. Scheduled publish stopped to avoid deploying unfinished code.'
    exit 2
}

git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run build:static
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

node scripts/validate-feed.mjs public/jobs.json docs/jobs.json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Copy-Item -LiteralPath (Join-Path $ProjectRoot 'public/jobs.json') -Destination (Join-Path $ProjectRoot 'docs/jobs.json') -Force

node scripts/validate-feed.mjs docs/jobs.json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git add -- docs/jobs.json
git diff --cached --quiet -- docs/jobs.json
if ($LASTEXITCODE -eq 0) {
    Write-Output 'No job feed changes to publish.'
    exit 0
}

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
git commit -m "Refresh job feed $stamp"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git push origin main
exit $LASTEXITCODE
