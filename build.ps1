$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSCommandPath
Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath 'package.json' -PathType Leaf)) {
    throw "package.json not found. Please run this script from the project repository."
}

Write-Host 'Starting desktop build...'
yarn tauri:build

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ''
Write-Host 'Build completed.'
Write-Host 'Bundle output: src-tauri/target/release/bundle'
