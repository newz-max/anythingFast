$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSCommandPath
Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath 'package.json' -PathType Leaf)) {
    throw "package.json not found. Please run this script from the project repository."
}

Write-Host 'Starting desktop build...'
yarn check:version

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

yarn tauri build --bundles nsis --config '{"bundle":{"createUpdaterArtifacts":false}}'

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ''
Write-Host 'Build completed.'
Write-Host 'Bundle output: src-tauri/target/release/bundle'

$NsisOutputDir = Join-Path -Path $ProjectRoot -ChildPath 'src-tauri/target/release/bundle/nsis'

if (Test-Path -LiteralPath $NsisOutputDir -PathType Container) {
    Write-Host "Opening NSIS output directory: $NsisOutputDir"
    Invoke-Item -LiteralPath $NsisOutputDir
} else {
    Write-Warning "NSIS output directory not found: $NsisOutputDir"
}
