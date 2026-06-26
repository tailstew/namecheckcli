# namecheck helper — finds namecheckcli repo root and runs the CLI.
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

$dir = $PSScriptRoot
while ($dir) {
    $pkg = Join-Path $dir "package.json"
    $cli = Join-Path $dir "dist/cli.js"
    if ((Test-Path $pkg) -and (Test-Path $cli)) {
        $pkgJson = Get-Content $pkg -Raw | ConvertFrom-Json
        if ($pkgJson.name -eq "namecheckcli") {
            node $cli @Args
            exit $LASTEXITCODE
        }
    }

    $parent = Split-Path $dir -Parent
    if ($parent -eq $dir) { break }
    $dir = $parent
}

$namecheck = Get-Command namecheck -ErrorAction SilentlyContinue
if ($namecheck) {
    & namecheck @Args
    exit $LASTEXITCODE
}

Write-Error "namecheck CLI not found. Install with: npm install -g github:tailstew/namecheckcli"
exit 1
