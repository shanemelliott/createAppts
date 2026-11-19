# cli-distribution Specification

## Purpose
Lets users install and update the `appt-scenario` CLI on Linux (including an AWS EC2 console) and Windows with a single pasted command, with no source checkout, package manager, or admin rights required.

## Requirements

### Requirement: One-line install commands
The project SHALL provide one command per platform that downloads and installs the CLI (Windows: `iwr -useb <install-url> | iex`; Linux: `curl -fsSL <install-url> | sh`). Each command SHALL fetch the matching installer, which downloads the package from a base URL (override `APPT_CLI_BASE_URL`). The installer scripts committed to the repository SHALL NOT contain a download URL: the release build SHALL insert the default from a git-ignored local config file, and an installer without any URL SHALL stop with a message naming the project contact.

#### Scenario: Windows install
- **WHEN** a user runs the Windows one-liner in PowerShell
- **THEN** the package is downloaded, verified, and extracted to `appt-cli` in the current directory, and the installer prints the command to run the tool

#### Scenario: Linux install
- **WHEN** a user runs the Linux one-liner in a shell with only `curl`, `tar`, and Node.js installed
- **THEN** the package is downloaded, verified, and extracted to `appt-cli` in the current directory, and the installer prints the command to run the tool

#### Scenario: Alternate download location
- **WHEN** `APPT_CLI_BASE_URL` is set before running an installer
- **THEN** the installer downloads the package and checksum from that base URL instead of the default

### Requirement: Package integrity check
The installer SHALL download the SHA-256 checksum published next to the package and SHALL extract nothing unless the downloaded package matches it.

#### Scenario: Checksum mismatch
- **WHEN** the downloaded package does not match its published checksum
- **THEN** the installer deletes the download, extracts nothing, leaves any existing installation untouched, and exits non-zero with a message naming the mismatch

#### Scenario: Checksum missing
- **WHEN** the checksum file cannot be downloaded
- **THEN** the installer stops with a non-zero exit and does not install the package

### Requirement: Node.js prerequisite check
The installer SHALL verify that Node.js 18.3 or later is on the PATH before installing. If it is not, the installer SHALL stop with a non-zero exit and print how to install Node.js. It SHALL NOT install Node.js itself.

#### Scenario: Node.js missing
- **WHEN** `node` is not found on the PATH
- **THEN** the installer installs nothing and prints the Node.js requirement and a suggested install command for the platform

#### Scenario: Node.js too old
- **WHEN** the installed Node.js is older than 18.3
- **THEN** the installer installs nothing and reports the version found and the minimum required

### Requirement: Self-contained, unprivileged install
The installer SHALL need no administrator or root rights, no package manager, and no network access beyond the download. It SHALL install the program only into the `appt-cli` folder in the current directory, or in the user's home folder when the current directory is not writable, and SHALL NOT change the PATH, shell profile, or registry. The only file it may write elsewhere is the optional launcher described below.

#### Scenario: Install as a normal user
- **WHEN** a non-administrator user runs an installer
- **THEN** it completes without prompting for elevation and writes only inside `appt-cli`

#### Scenario: Run immediately after install
- **WHEN** the install finishes
- **THEN** the printed command (for example `node appt-cli/bin/appt-scenario.js --check`) runs with no further install step

#### Scenario: Current directory not writable
- **WHEN** an installer is run from a folder the user cannot write to, such as `C:\Windows\System32` or `/`
- **THEN** it says so, installs into `appt-cli` in the user's home folder instead, and prints the next-step command with the full path to the installed script

#### Scenario: No writable location
- **WHEN** neither the current directory nor the home folder is writable
- **THEN** the installer installs nothing, exits non-zero, and tells the user to run it from a folder they own

### Requirement: Short launcher command
The installer SHALL offer to create an `appts` command so the user can type `appts <scenario>` instead of the full `node` command. The launcher SHALL be a small file that runs the installed CLI with `node`, written to `~/.local/bin` on Linux, and on Windows to `%USERPROFILE%\.local\bin` or `%LOCALAPPDATA%\Microsoft\WindowsApps`, whichever is already on PATH (else `%USERPROFILE%\.local\bin`). Creating it SHALL need no admin rights, no npm, and no PATH change. In an interactive run the question SHALL default to yes. A non-interactive run SHALL NOT create it unless `APPT_CLI_LAUNCHER=1`, and `APPT_CLI_LAUNCHER=0` SHALL always skip it. `APPT_CLI_BIN_DIR` SHALL override the folder.

#### Scenario: Launcher created
- **WHEN** the user accepts the launcher question on a machine where the launcher folder is on PATH
- **THEN** `appts --check` and `appts regular` run the installed CLI from any folder

#### Scenario: Non-interactive run
- **WHEN** the installer runs with no terminal or with `APPT_CLI_NO_PROMPT` set and `APPT_CLI_LAUNCHER` unset
- **THEN** no launcher is created

#### Scenario: Folder not on PATH
- **WHEN** the launcher folder is not on PATH
- **THEN** the installer still creates the launcher, prints the command to add the folder to PATH, and prints the full launcher path to use until then

#### Scenario: Upgrade refreshes the launcher
- **WHEN** the installer runs again and a launcher it created already exists
- **THEN** the launcher is rewritten for the current install without asking

#### Scenario: Foreign file is never overwritten
- **WHEN** a file named `appts` (or `appts.cmd`) exists in the launcher folder that this installer did not create
- **THEN** the installer leaves it unchanged and says so

### Requirement: Credential setup
After installing, the installer SHALL offer to create `appt-cli/.env` by prompting for the access and verify codes with hidden input. It SHALL write the file readable only by the current user, SHALL NOT echo, log, or put the codes in command-line arguments, and SHALL otherwise write the `.env.sample` defaults. If there is no interactive terminal, or the user declines, it SHALL copy `.env.sample` to `.env` without codes and say which settings to fill in.

#### Scenario: Interactive credential entry
- **WHEN** the installer runs in a terminal and the user enters the codes
- **THEN** `appt-cli/.env` contains them, is readable only by the current user, and the codes never appear in the installer output

#### Scenario: Codes supplied by the environment
- **WHEN** `VISTA_ACCESS_CODE` and `VISTA_VERIFY_CODE` are set when the installer runs
- **THEN** it writes them to `.env` without prompting, keeping special characters exactly as given, and never prints them

#### Scenario: Piped installer on Linux
- **WHEN** the installer is run as `curl ... | sh` and so has no script input from standard input
- **THEN** it still prompts through the controlling terminal (`/dev/tty`) when one exists

#### Scenario: No terminal
- **WHEN** no terminal is available
- **THEN** the installer writes `.env` from the sample without codes and exits zero with instructions

### Requirement: Re-run updates in place
Running an installer again SHALL replace the program files with the latest package and SHALL keep the existing `appt-cli/.env`.

#### Scenario: Upgrade
- **WHEN** an installer runs and `appt-cli/.env` already exists
- **THEN** the program files are replaced, the existing `.env` is unchanged, and the user is not prompted for credentials again

### Requirement: Release package build
The project SHALL include a build script that produces, in one output folder, a `.zip` (Windows) and a `.tar.gz` (Linux) of the CLI, a SHA-256 checksum file for each, and both installer scripts, ready to upload to the download location. The packages SHALL contain the program, docs, tests, and `.env.sample`, and SHALL NOT contain `.env`, credentials, or `node_modules`.

#### Scenario: Build output
- **WHEN** the build script is run
- **THEN** the output folder contains `appt-cli.zip`, `appt-cli.tar.gz`, a `.sha256` file for each, `install.ps1`, and `install.sh`

#### Scenario: Secrets excluded
- **WHEN** a developer has a `cli/.env` file and runs the build script
- **THEN** neither package contains it

#### Scenario: Checksums match
- **WHEN** each package's SHA-256 is computed
- **THEN** it equals the value in the matching `.sha256` file
