# Build the software-scroll spike -> spikes/swscroll/build/spike.ssd (*RUN SPIKE, or SHIFT+BREAK)
# Needs the game built first (.\build.ps1 at the top): the sprites come out of build/ddd.ssd.
$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$top   = Join-Path $root '..\..'
$build = Join-Path $root 'build'
$baron = $env:BARON
if (-not $baron) { $baron = Join-Path $top 'bin\baron.exe' }
if (-not (Test-Path $baron)) { $baron = (Get-Command baron -ErrorAction Stop).Source }
if (-not (Test-Path $build)) { New-Item -ItemType Directory -Path $build | Out-Null }
& python (Join-Path $root 'make_data.py')
if ($LASTEXITCODE -ne 0) { throw "make_data.py failed" }
Push-Location $root
try {
    & $baron --warn 2 -o build\spike.ssd --title SWSCROLL --opt 2 --symbols build\spike.symbols.json -v src\main.6502 |
        Out-File -FilePath build\spike.lst -Encoding utf8
    if ($LASTEXITCODE -ne 0) { Get-Content build\spike.lst | Select-Object -Last 20; throw "baron failed" }
} finally { Pop-Location }
"Built $build\spike.ssd"
