# 从项目根目录执行：.\scripts\deploy-cf.ps1
# 会读取根目录 .cf.env（若存在）并设置环境变量，再构建并部署 Pages。
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$cfEnv = Join-Path (Get-Location) ".cf.env"
if (Test-Path $cfEnv) {
  Get-Content $cfEnv -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    if ($k) { [Environment]::SetEnvironmentVariable($k, $v, "Process") }
  }
  Write-Host "Loaded .cf.env"
}
if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Host "缺少 CLOUDFLARE_API_TOKEN。请复制 .cf.env.example 为 .cf.env 并填入 Token，或先在当前终端执行:" -ForegroundColor Yellow
  Write-Host '  $env:CLOUDFLARE_API_TOKEN = "你的token"' -ForegroundColor Gray
  exit 1
}
npm run deploy:cf
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Done." -ForegroundColor Green
