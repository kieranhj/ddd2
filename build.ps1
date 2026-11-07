# Build Dare Devil Denis -> build/ddd.ssd, then compare it with the reference disc.
#
#   .\build.ps1             assemble, then tools/compare.py against reference/sth/DareDevilDenis.ssd
#   .\build.ps1 -NoCompare  assemble only
#   .\build.ps1 -Run        and launch b2 on the image
#
# Step 1 (this tree): the source rebuilds the Stairway to Hell disc's five files byte for byte,
# with their catalogue entries. The Makefile is the same build for POSIX and makes the same image.
#
# Tools: baron (and b2 for -Run) from the environment variable of that name in capitals, then bin\,
# then the PATH. Put this machine's paths in local.ps1 (gitignored), run first if it exists.
param([switch]$NoCompare, [switch]$Run)

$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$local = Join-Path $root 'local.ps1'
if (Test-Path $local) { . $local }

function Find-Tool([string]$name) {
    $fromEnv = [Environment]::GetEnvironmentVariable($name.ToUpper())
    if ($fromEnv) {
        if (-not (Test-Path $fromEnv)) { throw "$($name.ToUpper())=$fromEnv does not exist" }
        return $fromEnv
    }
    $inBin = Join-Path $root "bin\$name.exe"
    if (Test-Path $inBin) { return $inBin }
    $onPath = Get-Command $name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($onPath) { return $onPath.Source }
    return $null
}

# Baron 0.6.0 (decision 2): BASIC ... ENDBASIC needs 0.5.2 or newer.
$baron = Find-Tool 'baron'
if (-not $baron) { throw "baron not found: set BARON, put baron.exe in bin\ or on the PATH - https://github.com/waitingforvsync/baron/releases" }

$build   = Join-Path $root 'build'
New-Item -ItemType Directory -Force -Path $build | Out-Null
$ssd     = Join-Path $build 'ddd.ssd'
$listing = Join-Path $build 'ddd.lst'
$syms    = Join-Path $build 'ddd.symbols.json'

Push-Location $root
try {
    # Disc title and boot option are the reference's. Files are written in source order from
    # sector 2, which is the reference's layout (src/main.6502).
    & $baron --warn 2 -o $ssd --title 'DAREDEVILDEN' --opt 3 --symbols $syms -v 'src\main.6502' |
        Out-File -FilePath $listing -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        Remove-Item $ssd, $syms -ErrorAction SilentlyContinue
        throw "baron failed ($LASTEXITCODE) - see $listing"
    }
    "Built  $ssd"
    if (-not $NoCompare) {
        & python 'tools\compare.py' $ssd
        if ($LASTEXITCODE -ne 0) { throw "compare.py: the build differs from the reference" }
    }
} finally { Pop-Location }

if ($Run) {
    $b2 = Find-Tool 'b2'
    if (-not $b2) { throw "b2 not found: set B2 or put it on the PATH" }
    & $b2 -0 $ssd -b
}
