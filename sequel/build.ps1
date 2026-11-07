# Build the sequel -> sequel/build/ddd2.ssd (SHIFT+BREAK runs it). -Run: and boot it in b2
# (B2 from local.ps1 or the environment, else the PATH).
# Needs the original built first (.\build.ps1 at the top): the sprites come out of build/ddd.ssd,
# the course out of data/course.json.
param([switch]$Run)
$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$top   = Join-Path $root '..'
$build = Join-Path $root 'build'
$local = Join-Path $top 'local.ps1'
if (Test-Path $local) { . $local }
$baron = $env:BARON
if (-not $baron) { $baron = Join-Path $top 'bin\baron.exe' }
if (-not (Test-Path $baron)) { $baron = (Get-Command baron -ErrorAction Stop).Source }
New-Item -ItemType Directory -Force -Path $build | Out-Null
& python (Join-Path $root 'make_data.py')
if ($LASTEXITCODE -ne 0) { throw "make_data.py failed" }
Push-Location $root
try {
    & $baron --warn 2 -o build\ddd2.ssd --title DDD2 --opt 2 --symbols build\ddd2.symbols.json -v src\main.6502 |
        Out-File -FilePath build\ddd2.lst -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        Remove-Item build\ddd2.ssd, build\ddd2.symbols.json -ErrorAction SilentlyContinue
        Get-Content build\ddd2.lst | Select-Object -Last 20; throw "baron failed"
    }
} finally { Pop-Location }
"Built $build\ddd2.ssd"
if ($Run) {
    $b2 = $env:B2
    if (-not $b2) { $b2 = (Get-Command b2 -ErrorAction Stop).Source }
    & $b2 -0 (Join-Path $build 'ddd2.ssd') -b
}
