# Builds the release files for the one-line installers into cli/dist (or -OutDir).
# Output: appt-cli.zip, appt-cli.tar.gz, a .sha256 for each, install.ps1, install.sh.
param([string]$OutDir)

$ErrorActionPreference = 'Stop'

$cliDir = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $cliDir 'dist' }
$OutDir = [IO.Path]::GetFullPath($OutDir)

$excludeDirs = @('dist', 'node_modules', 'scripts', 'install')
$excludeFiles = @('.env', 'test/install.test.js', 'testlib/fixtures/legacy-dump.cjs')

$stage = Join-Path ([IO.Path]::GetTempPath()) "appt-cli-stage-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $stage | Out-Null

try {
    Get-ChildItem -Path $cliDir -Recurse -File -Force | ForEach-Object {
        $rel = $_.FullName.Substring($cliDir.Length).TrimStart('\', '/').Replace('\', '/')
        if ($excludeDirs -contains $rel.Split('/')[0]) { return }
        if ($excludeFiles -contains $rel) { return }
        if ($_.Name -like '*.log') { return }
        $dest = Join-Path $stage $rel
        New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $dest
    }

    if (Test-Path $OutDir) { Remove-Item -LiteralPath $OutDir -Recurse -Force }
    New-Item -ItemType Directory -Path $OutDir | Out-Null

    $zip = Join-Path $OutDir 'appt-cli.zip'
    $tgz = Join-Path $OutDir 'appt-cli.tar.gz'
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
    & tar -czf $tgz -C $stage .
    if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }

    foreach ($file in @($zip, $tgz)) {
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
        $line = "$hash  $(Split-Path -Leaf $file)`n"
        [IO.File]::WriteAllText("$file.sha256", $line, (New-Object Text.UTF8Encoding($false)))
    }

    $utf8 = New-Object Text.UTF8Encoding($false)
    $sh = [IO.File]::ReadAllText((Join-Path $cliDir 'install/install.sh')).Replace("`r`n", "`n")
    [IO.File]::WriteAllText((Join-Path $OutDir 'install.sh'), $sh, $utf8)
    Copy-Item -LiteralPath (Join-Path $cliDir 'install/install.ps1') -Destination (Join-Path $OutDir 'install.ps1')

    $version = (Get-Content -Raw (Join-Path $cliDir 'package.json') | ConvertFrom-Json).version
    Write-Host "Built appt-cli $version in $OutDir"
    Get-ChildItem $OutDir | ForEach-Object { Write-Host ("  {0,10:N0}  {1}" -f $_.Length, $_.Name) }
}
finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
