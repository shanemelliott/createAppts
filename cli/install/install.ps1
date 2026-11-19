# appt-scenario installer for Windows.
#   iwr -useb <install-url> | iex      (ask shane.elliott@va.gov for the install URL)
# Installs into .\appt-cli (no admin rights, no PATH changes). Re-running upgrades and keeps .env.
# Optionally adds an 'appts' command (appts.cmd in a user folder that is already on PATH:
# %USERPROFILE%\.local\bin, else %LOCALAPPDATA%\Microsoft\WindowsApps).
#
# Environment overrides:
#   APPT_CLI_BASE_URL   download folder (the release build fills in a default; a plain checkout has none)
#   VISTA_ACCESS_CODE / VISTA_VERIFY_CODE   write .env without prompting
#   APPT_CLI_NO_PROMPT  never prompt
#   APPT_CLI_LAUNCHER   1 = create the 'appts' command, 0 = skip it (default: ask)
#   APPT_CLI_BIN_DIR    where appts.cmd goes (default: a user folder already on PATH, else %USERPROFILE%\.local\bin)
#   APPT_CLI_NODE       node executable to check (default: node)
#
# Keep this file ASCII: Windows PowerShell 5.1 misreads UTF-8 without a BOM.

function Invoke-ApptCliInstall {
    $ErrorActionPreference = 'Stop'

    # Filled in by scripts/build-package.ps1 from cli/release.local.json (never committed).
    $defaultBaseUrl = ''
    $baseUrl = if ($env:APPT_CLI_BASE_URL) { $env:APPT_CLI_BASE_URL.TrimEnd('/') } else { $defaultBaseUrl.TrimEnd('/') }
    if (-not $baseUrl) { throw "No download location. Set APPT_CLI_BASE_URL, or ask shane.elliott@va.gov for the install command." }
    $nodeBin = if ($env:APPT_CLI_NODE) { $env:APPT_CLI_NODE } else { 'node' }
    $pkg = 'appt-cli.zip'
    $here = (Get-Location).Path
    $target = Join-Path $here 'appt-cli'
    $minMajor = 18
    $minMinor = 3

    # ---- prerequisites ----
    if (-not (Get-Command $nodeBin -ErrorAction SilentlyContinue)) {
        throw "Node.js $minMajor.$minMinor or later is required but 'node' was not found.`n  Install it:  winget install OpenJS.NodeJS.LTS`n  Then open a new terminal and run this installer again."
    }
    $nodeVersion = [string](& $nodeBin -v 2>$null | Select-Object -First 1)
    if ($nodeVersion -notmatch '^v?(\d+)\.(\d+)') {
        throw "Could not read the Node.js version (got '$nodeVersion')."
    }
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    if ($major -lt $minMajor -or ($major -eq $minMajor -and $minor -lt $minMinor)) {
        throw "Node.js $minMajor.$minMinor or later is required; found $nodeVersion. Upgrade Node.js and run this installer again."
    }

    # A folder we cannot write to (for example C:\Windows\System32): use the user profile folder instead.
    if (-not (Test-FolderWritable $here)) {
        $fallback = if ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
        if (-not $fallback -or -not (Test-FolderWritable $fallback)) {
            throw "Cannot write to $here and there is no writable user folder. Open a terminal in a folder you own (for example: cd `$HOME) and run this installer again."
        }
        Write-Host "Cannot write to $here; installing into $fallback instead."
        $here = $fallback
        $target = Join-Path $here 'appt-cli'
    }
    $scriptHint = if ($here -eq (Get-Location).Path) { 'appt-cli\bin\appt-scenario.js' } else { Join-Path $target 'bin\appt-scenario.js' }

    $tmp = Join-Path $here ".appt-cli-install-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $oldProgress = $ProgressPreference
    try {
        # ---- download and verify ----
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $ProgressPreference = 'SilentlyContinue'
        $zipPath = Join-Path $tmp $pkg
        $shaPath = "$zipPath.sha256"

        Write-Host "Downloading $baseUrl/$pkg"
        try {
            Invoke-WebRequest -Uri "$baseUrl/$pkg" -OutFile $zipPath -UseBasicParsing
        } catch {
            throw "Download failed: $baseUrl/$pkg ($($_.Exception.Message))"
        }
        try {
            Invoke-WebRequest -Uri "$baseUrl/$pkg.sha256" -OutFile $shaPath -UseBasicParsing
        } catch {
            throw "Checksum download failed: $baseUrl/$pkg.sha256 (refusing to install an unverified package)."
        }

        $expected = (((Get-Content -Raw -LiteralPath $shaPath).Trim()) -split '\s+')[0].ToLowerInvariant()
        $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
        if (-not $expected) { throw 'The published checksum file is empty.' }
        if ($expected -ne $actual) {
            throw "Checksum mismatch for $pkg (expected $expected, got $actual). Nothing was installed."
        }
        Write-Host 'Checksum OK'

        # ---- extract and swap in ----
        $newDir = Join-Path $tmp 'new'
        Expand-Archive -LiteralPath $zipPath -DestinationPath $newDir -Force
        if (-not (Test-Path -LiteralPath (Join-Path $newDir 'bin\appt-scenario.js'))) {
            throw 'Package is missing bin\appt-scenario.js. Nothing was installed.'
        }

        $upgrade = Test-Path -LiteralPath $target
        $oldDir = Join-Path $tmp 'old'
        if ($upgrade) {
            try { Move-Item -LiteralPath $target -Destination $oldDir } catch { throw "Could not replace the existing install at $target ($($_.Exception.Message))." }
        }
        try {
            Move-Item -LiteralPath $newDir -Destination $target
        } catch {
            if ($upgrade) { Move-Item -LiteralPath $oldDir -Destination $target }
            throw "Could not install into $target ($($_.Exception.Message))."
        }
        $envPath = Join-Path $target '.env'
        $keptEnv = $false
        if ($upgrade -and (Test-Path -LiteralPath (Join-Path $oldDir '.env'))) {
            Move-Item -LiteralPath (Join-Path $oldDir '.env') -Destination $envPath
            $keptEnv = $true
        }

        # ---- credentials ----
        $note = "Kept your existing $envPath."
        if (-not $keptEnv) {
            $sample = Join-Path $target '.env.sample'
            if (-not (Test-Path -LiteralPath $sample)) { throw 'Package is missing .env.sample.' }

            $ac = $env:VISTA_ACCESS_CODE
            $vc = $env:VISTA_VERIFY_CODE
            $interactive = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected -and -not $env:APPT_CLI_NO_PROMPT
            if ((-not $ac -or -not $vc) -and $interactive) {
                $ac = $null
                $vc = $null
                $answer = Read-Host 'Enter your VistA access/verify codes now? [Y/n]'
                if ($answer -notmatch '^[nN]') {
                    $ac = Read-HiddenValue 'Access code'
                    $vc = Read-HiddenValue 'Verify code'
                }
            }

            # Create the file and lock it down before any secret is written.
            New-Item -ItemType File -Path $envPath | Out-Null
            Protect-EnvFile $envPath

            $withCodes = [bool]($ac -and $vc)
            $lines = foreach ($line in (Get-Content -LiteralPath $sample)) {
                if ($withCodes -and $line -match '^VISTA_ACCESS_CODE=') { "VISTA_ACCESS_CODE=$ac" }
                elseif ($withCodes -and $line -match '^VISTA_VERIFY_CODE=') { "VISTA_VERIFY_CODE=$vc" }
                else { $line }
            }
            [IO.File]::WriteAllText($envPath, (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
            $ac = $null
            $vc = $null
            if ($withCodes) {
                $note = "Wrote $envPath (readable only by you)."
            } else {
                $note = "Created $envPath without codes. Edit it and set VISTA_ACCESS_CODE and VISTA_VERIFY_CODE."
            }
        }

        $version = ''
        try { $version = (Get-Content -Raw -LiteralPath (Join-Path $target 'package.json') | ConvertFrom-Json).version } catch { }

        $launcher = Install-ApptLauncher $target

        Write-Host ''
        if ($upgrade) { Write-Host "Updated appt-cli $version in $target" } else { Write-Host "Installed appt-cli $version in $target" }
        Write-Host $note
        if ($launcher.Note) { Write-Host $launcher.Note }
        Write-Host ''
        Write-Host 'Next:'
        if ($launcher.Run) {
            Write-Host "  $($launcher.Run) --check     # test the connection"
            Write-Host "  $($launcher.Run) --help      # list scenarios"
        } else {
            Write-Host "  node $scriptHint --check     # test the connection"
            Write-Host "  node $scriptHint --help      # list scenarios"
        }
    }
    finally {
        $ProgressPreference = $oldProgress
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Test-FolderWritable([string]$Path) {
    $probe = Join-Path $Path ".appt-cli-write-test-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
    try {
        New-Item -ItemType File -Path $probe -ErrorAction Stop | Out-Null
        Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
        return $true
    } catch {
        return $false
    }
}

function Read-HiddenValue([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Protect-EnvFile([string]$Path) {
    if ($IsWindows -eq $false) {
        & chmod 600 $Path
        if ($LASTEXITCODE -ne 0) { throw "Could not restrict permissions on $Path." }
        return
    }
    $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $Path /inheritance:r /grant:r "${user}:(M)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not restrict permissions on $Path." }
}

function Install-ApptLauncher([string]$Target) {
    $result = @{ Note = ''; Run = '' }
    if ($IsWindows -eq $false) { return $result }

    $binDir = $env:APPT_CLI_BIN_DIR
    if (-not $binDir) {
        $pathDirs = @($env:PATH -split ';' | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\') })
        $candidates = @((Join-Path $env:USERPROFILE '.local\bin'), (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps'))
        $binDir = $candidates | Where-Object { $pathDirs -contains $_.TrimEnd('\') } | Select-Object -First 1
        if (-not $binDir) { $binDir = $candidates[0] }
    }
    $launcher = Join-Path $binDir 'appts.cmd'
    $mark = 'rem appt-scenario launcher'
    $want = $false

    if (Test-Path -LiteralPath $launcher) {
        if ((Get-Content -Raw -LiteralPath $launcher) -match [regex]::Escape($mark)) {
            $want = $true
        } else {
            $result.Note = "Left the existing $launcher alone (it was not created by this installer)."
            return $result
        }
    }

    switch ($env:APPT_CLI_LAUNCHER) {
        '0' { return $result }
        '1' { $want = $true }
        default {
            $interactive = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected -and -not $env:APPT_CLI_NO_PROMPT
            if (-not $want -and $interactive) {
                $answer = Read-Host "Create an 'appts' command in $binDir so you can type 'appts osm'? [Y/n]"
                if ($answer -notmatch '^[nN]') { $want = $true }
            }
        }
    }
    if (-not $want) { return $result }

    try {
        New-Item -ItemType Directory -Path $binDir -Force | Out-Null
        $script = "@echo off`r`n$mark`r`nnode `"$(Join-Path $Target 'bin\appt-scenario.js')`" %*`r`n"
        [IO.File]::WriteAllText($launcher, $script, (New-Object Text.ASCIIEncoding))
    } catch {
        $result.Note = "Could not create $launcher ($($_.Exception.Message)); use: node $(Join-Path $Target 'bin\appt-scenario.js')"
        return $result
    }

    $result.Note = "Created the 'appts' command: $launcher"
    $result.Run = 'appts'
    $onPath = @($env:PATH -split ';' | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\') }) -contains $binDir.TrimEnd('\')
    if (-not $onPath) {
        $result.Note += "`n  $binDir is not on your PATH yet. Add it to your user PATH (then open a new terminal):`n    [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';$binDir', 'User')`n  Until then, run: $launcher"
        $result.Run = $launcher
    }
    return $result
}

function Install-ApptCli {
    try {
        $null = Invoke-ApptCliInstall
        return 0
    } catch {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        return 1
    }
}

$ApptCliExit = Install-ApptCli
$global:LASTEXITCODE = $ApptCliExit
# `iex` has no script path and must not close the user's terminal; a file run reports the exit code.
if ($MyInvocation.MyCommand.Path) { exit $ApptCliExit }
