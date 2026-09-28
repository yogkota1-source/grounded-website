# omp-setup.ps1 - Run this ONCE from your PowerShell to finish omp configuration

Write-Host "Setting up omp for your workspace..." -ForegroundColor Cyan

# 1. Create models.yml so omp finds your Qwen model via Ollama
$configDir = "$env:USERPROFILE\.omp\agent"
New-Item -ItemType Directory -Force -Path $configDir | Out-Null

@"
providers:
  ollama:
    baseUrl: http://localhost:11434
    api: ollama

defaults:
  model: ollama/qwen2.5-coder:3b
"@ | Out-File -FilePath "$configDir\models.yml" -Encoding utf8
Write-Host "[OK] models.yml written to $configDir" -ForegroundColor Green

# 2. Save omp.exe full path to a shared file so VS Code can find it
$ompExe = "$env:USERPROFILE\AppData\Local\omp\omp.exe"
if (Test-Path $ompExe) {
    $ompExe | Out-File -FilePath "C:\Users\Dell\OneDrive\Desktop\grounded-website\.vscode\omp-path.txt" -Encoding utf8
    Write-Host "[OK] omp path saved: $ompExe" -ForegroundColor Green
} else {
    Write-Host "[ERROR] omp.exe not found at $ompExe" -ForegroundColor Red
}

Write-Host "`nSetup complete! Open VS Code in your grounded-website folder." -ForegroundColor Cyan
