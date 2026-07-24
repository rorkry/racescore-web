# 全 *.test.ts を tsx で実行し、終了コードで集計する
# 実行: pwsh -File scripts/run-all-tests.ps1
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$files = Get-ChildItem -Recurse -Include *.test.ts, *.test.tsx -Path lib, app, pages, utils, hooks, server, src -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "node_modules" } |
  Sort-Object FullName

$okCount = 0
$ngCount = 0
$ngFiles = @()

Write-Host "テストファイル数: $($files.Count)"
Write-Host ("=" * 78)

foreach ($f in $files) {
  $rel = Resolve-Path -Relative $f.FullName
  $out = & npx tsx $f.FullName 2>&1
  if ($LASTEXITCODE -eq 0) {
    $okCount++
    Write-Host ("OK   " + $rel)
  } else {
    $ngCount++
    $ngFiles += $rel
    Write-Host ("FAIL " + $rel) -ForegroundColor Red
    $out | Select-Object -Last 25 | ForEach-Object { Write-Host "       $_" }
  }
}

Write-Host ("=" * 78)
Write-Host "OK=$okCount  FAIL=$ngCount"
if ($ngCount -gt 0) {
  Write-Host "失敗したファイル:"
  $ngFiles | ForEach-Object { Write-Host "  $_" }
  exit 1
}
exit 0
