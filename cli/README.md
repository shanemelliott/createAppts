# appts (appt-scenario)

Portable command-line tool that creates VistA appointment test scenarios in **dev / sqa only**. It talks directly to the VistA RPC Broker over TCP with access/verify codes, so it needs nothing but Node.js 18.3+: no `npm install`, no .NET, no PIV card. It runs the same on an Amazon Linux EC2 console and on Windows.

## Install

You need Node.js 18.3 or later. Nothing else: no `npm install`, no admin rights, no PATH edits. The installer puts the program in `./appt-cli` in the current folder, and can add a short `appts` command (see below).

**Windows (PowerShell)**

```powershell
cd $HOME          # optional: install into your home folder
iwr -useb https://downloads.example.com/appt-cli | iex
```

**Linux (including an EC2 console)**

```bash
cd ~              # optional: install into your home folder
curl -fsSL https://downloads.example.com/appt-cli-sh | sh
```

The `cd` is optional. The installer uses the folder you are in, so run it from wherever you want `appt-cli` to live. If that folder is not writable (an elevated PowerShell opens in `C:\Windows\System32`, for example), it says so and installs into your home folder automatically; it never fails just because of the starting folder.

The installer downloads the package, checks its SHA-256 against the published checksum, extracts it, asks for your access/verify codes (hidden input; the file is readable only by you) to create `appt-cli/.env`, and then asks whether to create the `appts` command. Then:

```bash
appts --check          # if you said yes to the appts command
appts osm
# or, without the command:
node appt-cli/bin/appt-scenario.js --check
node appt-cli/bin/appt-scenario.js osm
```

### The `appts` command

The launcher is a two-line file that runs `node <install folder>/bin/appt-scenario.js` with your arguments, so `appts regular`, `appts osm --dfn 100677`, `appts cancel-availability --dry-run` work from any folder. It goes in `~/.local/bin` on Linux. On Windows it is `appts.cmd` in `%USERPROFILE%\.local\bin` or `%LOCALAPPDATA%\Microsoft\WindowsApps`, whichever is already on your PATH. No admin rights, npm, or PATH edit is involved. If the folder is not on your PATH, the installer says so and prints the one command that adds it, plus the full path to use until then.

Re-running the installer refreshes the launcher. It never overwrites a file named `appts` that it did not create. If you move the `appt-cli` folder, re-run the installer.

Run the same command again to update. Program files are replaced and your `.env` is kept. If Node.js is missing or too old, the installer stops and tells you how to install it (for example `sudo dnf install -y nodejs` on Amazon Linux, `winget install OpenJS.NodeJS.LTS` on Windows).

Installer options (environment variables):

| Variable | Effect |
|---|---|
| `APPT_CLI_BASE_URL` | Download folder instead of `https://downloads.example.com/files/appt-cli/latest` |
| `VISTA_ACCESS_CODE` / `VISTA_VERIFY_CODE` | Write `.env` with these values without prompting |
| `APPT_CLI_NO_PROMPT` | Never prompt; create `.env` without codes and no launcher (unless `APPT_CLI_LAUNCHER=1`) |
| `APPT_CLI_LAUNCHER` | `1` = create the `appts` command without asking, `0` = skip it |
| `APPT_CLI_BIN_DIR` | Folder for the `appts` launcher instead of the default |
| `APPT_CLI_NODE` | Node executable to check (default `node`) |

With no terminal (or if you answer `n`), the installer creates `.env` from the sample without codes and tells you which two settings to fill in. With `curl ... | sh` it prompts through the terminal (`/dev/tty`), so the pipe does not get in the way.

## Quick start from a git checkout

```bash
git clone <this repo> && cd createAppts/cli
cp .env.sample .env          # then set VISTA_ACCESS_CODE and VISTA_VERIFY_CODE
node bin/appt-scenario.js --check
node bin/appt-scenario.js osm
```

All examples below use `appts`, the installed command (see above). From a git checkout, use `node bin/appt-scenario.js` in its place. Optional: `npm link` (or `pnpm link --global`) inside `cli/` puts `appt-scenario` on your PATH.

## Configuration

Precedence: **command-line flag > environment variable > `.env` file > built-in default**. The `.env` file is read from `--env-file <path>`, else `./.env`, else `cli/.env`.

| Setting | Flag | Env var | Default |
|---|---|---|---|
| Environment | `--env` | `APPT_ENV` | `sqa` (only `dev`/`sqa`; prod always blocked) |
| Broker host / port | `--host` / `--port` | `VISTA_HOST` / `VISTA_PORT` | `vista.example.com` / `9094` |
| RPC context | `--context` | `VISTA_CONTEXT` | `CDSP RPC CONTEXT` |
| Station | `--station` | `VISTA_STATION` | `500` |
| Access / verify codes | env or `.env` only | `VISTA_ACCESS_CODE` / `VISTA_VERIFY_CODE` | required |
| Patient DFN | `--dfn` | `APPT_DFN` | random test patient |
| Clinic (regular, osm) | `--clinic` | `APPT_CLINIC` | `195` CARDIOLOGY |
| Primary clinic (osmancillary) | `--clinic` | `APPT_PRIMARY_CLINIC` | `532` DEV PACT MD 4 |
| Ancillary clinic | `--ancillary-clinic` | `APPT_ANCILLARY_CLINIC` | `521` LABORATORY |
| Group clinics (osmxgroup) | `--group-clinics` | `APPT_GROUP_CLINICS` | `478,485` DEV/ENDOCRINE/5,6 |
| Clinic to block | `--clinic` | `APPT_BLOCK_CLINIC` | `478` |
| Slot search window (days) | `--search-days` | `APPT_SEARCH_DAYS` | `30` |
| Timezone for all dates | `--tz` | `APPT_TZ` | `America/New_York` |
| Cleanup disposition (409.853) | env or `.env` only | `APPT_CLOSE_DISPOSITION` | `6` ENTERED IN ERROR |

Access/verify codes are never accepted as flags (keeps them out of shell history and `ps`) and are masked as `****` in all output, including `--verbose`.

## Connectivity check

```bash
appts --check
# [SQA] check @ vista.example.com:9094 station 500 as LASTNAME,FIRST (12345)
# [SQA] OK
```

Signs on, prints environment/host/user/DUZ, signs off. No scheduling RPCs are called. Use this first on a new EC2 instance; a timeout usually means the security group or network path to the broker port is closed.

## Safety: dev and sqa only

Two checks stop the tool from touching production, and neither has an override:

1. **Environment label.** `APPT_ENV` (default `sqa`) must be `dev` or `sqa`; anything else, including `prod`, exits with code 2 before connecting. This is only a label you set, so on its own it would not stop `VISTA_HOST` pointing at a production server.
2. **The server's own answer.** Right after sign-on, before any scheduling call, the tool asks VistA (`ORWU USERINFO`, production-account flag) whether it is a production account. It continues only if VistA says no (`0`). If VistA says it is production, or the answer is missing, unreadable, or the call fails, the tool signs off and exits with an error without sending anything else. This applies to every command that connects, including `--check`.

The access and verify codes are also specific to each VistA system, so production would need production codes, which this tool is not meant to be given.

## Scenarios

Every scenario looks up open slots **before** creating anything, books with overbook off, and searches forward up to `--search-days` from the earliest allowed date. If a step fails after records were created, the run rolls them back (appointments: `SDEC APPDEL` with SDF=2; request-only: `SDEC ARCLOSE` with `APPT_CLOSE_DISPOSITION`) and reports anything it could not remove.

### regular

```bash
appts regular [--clinic 195] [--dfn 100677] [--at "T+1@9:30"] [--length 45] [--dry-run]
```
One request (desired date = today) and one linked appointment at the next open slot after now.

`--at "<date>@<time>"` books at that start instead (site time), and `--length N` sets the appointment length in minutes instead of the clinic's own. Both are checked against the clinic's open slots before anything is created: if the whole span is not open, nothing is written, the exit code is 1, and the output lists the five nearest open starts for that length. With `--length` alone, the earliest start that fits is booked. These two options are for `regular` only.

```bash
appts regular --at "1/1/2027@9:30"           # a specific day and time
appts regular --at "T+1@2:30 PM" --length 45  # tomorrow at 14:30 for 45 minutes
appts regular --length 60                     # next start with a free hour
appts regular --at "T+3@9:00" --dry-run       # show what would be booked; no connection
```

`--dry-run` needs no credentials. It prints the clinic, start, and length; the end time appears only with `--length` because the clinic's own length is read from VistA.

#### Dates and times

The same date forms work for `--at`, `--from` and `--to`, always in site time (`APPT_TZ`, not the host's clock):

| Date | Meaning |
|---|---|
| `1/1/2027`, `1/1/27` | month/day/year (two-digit years are 20YY) |
| `T` | today |
| `T+1`, `T+30`, `T-1` | days from today |
| `2027-01-01` | ISO date |

`--at` also needs a time after an `@`: 24-hour `9:30` or `14:00`, or 12-hour `9:30 AM` / `2:30 PM`. `--from` and `--to` take a date only. Impossible values (`2/30/2027`, `@25:00`) and `--at` times that are not in the future are rejected before connecting. Full FileMan input such as `NOW`, `T@NOON`, or `JAN 1 2027` is not supported.

### osm

```bash
appts osm [--clinic 195] [--past-days 60] [--future-days 60]
```
Desired date at least 60 days in the past, appointment at least 60 days in the future. Offsets can be raised but not lowered below 60.

### osmxgroup

```bash
appts osmxgroup [--group-clinics 478,485] [--block-availability]
```
Checks that one group clinic has **no open slots for today..today+60**, then creates a request with desired date 60+ days in the past and books it 90+ days out in another group clinic. Without `--block-availability` it only verifies and fails (with each clinic's earliest open slot) if no clinic qualifies; nothing is written. With `--block-availability` it first cancels availability on the **first** group clinic for today..today+60 (see below), then verifies and books. Blocked availability is **not** restored.

### osmancillary

```bash
appts osmancillary [--clinic 532] [--ancillary-clinic 521]
```
Two independent request+appointment pairs for the same patient on the same day, 90+ days out, at non-overlapping times; desired date 60+ days in the past. Nothing in VistA links them: the primary/ancillary pairing is configured in VEText OSM. If the ancillary booking fails, the primary is rolled back.

## cancel

```bash
appts cancel --appt 65491                       # cancelled by the clinic, request reopened
appts cancel --appt 65491 --by patient          # recorded as cancelled by the patient
appts cancel --appt 65491 --no-reopen           # close the request instead of reopening it
appts cancel --appt 65491 --reason-ien 5 --note "test data cleanup"
appts cancel --appt 65491 --dry-run             # show what would be sent; no connection or credentials
appts cancel --appt 65491 --json
```

Cancels exactly one appointment by its appointment IEN (the IEN column of `appts --dfn <dfn>`) with `SDEC APPDEL`. There is deliberately no patient, clinic, or date-range form, and no confirmation prompt: check the IEN first (or use `--dry-run`). Dev and sqa only, with the same production checks as every command that connects.

- **Who cancelled:** the clinic by default; `--by patient` records a patient cancellation (`CANCELLED BY PATIENT` in the listing).
- **Request:** reopened by default (SDF `1`), so it goes back to the pending list; `--no-reopen` (SDF `2`) closes it as removed by an external application. The CLI cannot read a request's status, so confirm the reopened request in VistA when it matters.
- **Reason and note:** no reason is sent unless `--reason-ien N` is given (an IEN from the site's cancellation-reason file); `--note` defaults to `appts cancel` and must be a single line.
- **Output and exit codes:** one line on success (`--json`: `appointmentIen`, `cancelType`, `reopened`, `reasonIen`, `note`). If VistA rejects it, for example `SDEC08: Invalid Appointment ID` for an unknown IEN, the message is printed and the exit code is 1. VistA accepts cancelling an appointment that is already cancelled, so that run reports success and changes nothing.

## cancel-availability

```bash
appts cancel-availability [--clinic 478] [--days 60 | --from 12/1/2026 --to T+30] [--reason testing] [--dry-run]
```
Ported from `single-appointment-api/cancel-november-availability.js`: one `SDES CANCEL CLIN AVAILABILITY` call per day covering 00:00-21:00 site time, with the UTC offset computed per date (handles DST). Continues past failed days, lists them, and exits non-zero if any failed. `--dry-run` prints each day's parameters without connecting (no credentials needed). Availability is not restored by this tool.

## Patient appointments

```bash
appts --dfn 100791                     # today through 4 months, every status, newest first
appts --dfn 100791 --months 2
appts --dfn 100791 --from 2026-09-01 --to 2026-09-30
appts --dfn 100791 --from 9/1/2026 --to T+10   # VistA dates work too (see Dates and times)
appts --dfn 100791 --json
appts                                  # with APPT_DFN set (env var or .env), lists that patient
```

Read-only (`SDES GET APPTS BY PATIENT DFN3`). With no scenario name, any of `--dfn`, `--from`, `--to` or `--months` selects this listing, as does a default patient in `APPT_DFN`: **with `APPT_DFN` set, plain `appts` runs this lookup instead of showing help** (`appts --help` always shows help). The patient is required; there is no random-patient fallback here. `--from` defaults to today, `--to` to `--from` plus `--months` (default 4). Dates are site time (`APPT_TZ`).

```
[SQA] appointments for DFN 100126 ONEHUNDREDTWENTYSEVEN,PATIENT, 2026-11-18 .. 2027-03-18 @ vista.example.com:9094 as TESTER,ONE (12345)
DATE/TIME         CLINIC      STATUS               IEN    SCHEDULED BY   CANCELLED BY
----------------  ----------  -------------------  -----  -------------  -------------
2026-11-18 07:00  CARDIOLOGY  CANCELLED BY CLINIC  65457  TESTER,ONE  TESTER,ONE
[SQA] 1 appointment(s)
```

Cancelled and no-show appointments are included; the status text is VistA's. `--json` gives `patient`, `range`, `total`, and an `appointments` array.

## Clinic availability

```bash
appts availability                              # clinic 195, today through 60 days
appts availability --clinic 478 --days 90
appts availability --clinic 485 --from 2027-01-01 --to 2027-03-31
appts availability --from T --to T+30        # VistA dates work too (see Dates and times)
appts availability --page-size 20               # rows per page in a terminal (0 = no pausing)
appts availability --json
```

Read-only (`SDEC APPSLOTS`). One clinic per run: `--clinic` (default `APPT_CLINIC`, 195). Range: `--days N` from today, or `--from` and `--to` together (not both forms); default 60 days. Long ranges are fetched in 31-day windows and shown as one grid.

The grid follows the VistA availability screen: hours across, one row per day that has a pattern (closed days have no row), and each hour cell shows one code per slot increment in brackets. A month heading precedes each month's first row. Hours are on a 12-hour clock without am/pm. A slot shown as `X` is not bookable; on dev, clinic 478's days cancelled with `cancel-availability` show `[X]`.

```
[SQA] availability: clinic 195 CARDIOLOGY, 2026-11-18 .. 2026-12-02 @ vista.example.com:9094 as TESTER,ONE (12345)
TIME   |7      |8      |9      |10     |11     |12     |1      |2
DATE   |       |       |       |       |       |       |       |
-- NOV 2026 --
WE 18  |[jjjj] |[jjjj] |[jjjj] |[jjjj] |[jjjj] |[jjjj] |[jjjj] |[j99j]
SA 21  |       |[1111] |[1111] |[1111] |[1111] |[1111] |[1111] |[1111]

FOR CLINIC AVAILABILITY PATTERNS:

    0-9 and j-z --denote available slots where j=10,k=11...z=26
            A-W --denote overbooks with A being the first slot to be overbooked
                  and B being the second for that same time, etc.
      *,$,!,@,# --denote overbooks or appts. that fall outside of a clinic's
                  regular hours.
```

In a terminal the grid pauses every 10 rows (`--page-size N` to change, `0` to turn off) with `PRESS RETURN TO CONTINUE OR ^ TO QUIT`; each page repeats the header (and the month heading if the page starts mid-month). Return continues, `^` stops, and the legend is printed either way. Redirected output, a pipe, and `--json` never pause. `--json` gives `clinicIen`, `clinicName`, `from`, `to`, `totalOpenSlots` and a `days` array of `{ date, openSlots, blocks: [{ start, end, code, open }] }`.

## Output and exit codes

Human-readable output is tagged with the environment (`[SQA] ...`). `--json` prints exactly one JSON object to stdout (success or failure, including `cleanup` details); diagnostics go to stderr. `--verbose` logs every RPC to stderr.

| Exit | Meaning |
|---|---|
| 0 | success |
| 1 | scenario, VistA, or connection failure |
| 2 | usage, validation, or safety error (nothing was contacted) |

## Running on AWS EC2 (Amazon Linux 2023)

```bash
sudo dnf install -y nodejs          # Node 18+ is the only prerequisite
curl -fsSL https://downloads.example.com/appt-cli-sh | sh
node appt-cli/bin/appt-scenario.js --check
```

The EC2 instance must be able to reach `downloads.example.com` (for the install) and, for the tool itself, allow outbound TCP to `VISTA_HOST:VISTA_PORT`. EC2 runs in UTC; all scenario dates are computed in `APPT_TZ`, so they match the site calendar.

## Releasing a new version

From a Windows machine with PowerShell and `tar` (included in Windows 10+):

```powershell
cd cli
pwsh scripts/build-package.ps1        # or: powershell -File scripts/build-package.ps1
```

This writes `cli/dist/` (git-ignored) with `appt-cli.zip`, `appt-cli.tar.gz`, a `.sha256` file for each, `install.ps1`, and `install.sh`. The packages contain the program, docs, tests, and `.env.sample`; never your `.env`.

Upload all six files to `https://downloads.example.com/files/appt-cli/latest/` (replace the previous ones; keep the `.sha256` files next to the packages). The short links point at the installers and rarely change:

| Short link | Target |
|---|---|
| `https://downloads.example.com/appt-cli` | `.../files/appt-cli/latest/install.ps1` |
| `https://downloads.example.com/appt-cli-sh` | `.../files/appt-cli/latest/install.sh` |

`install.sh` must keep LF line endings (the build script and `.gitattributes` take care of this). Bump `version` in `cli/package.json` before building; the installer prints it, and `appts --version` (or `-V`) shows the installed version so you can tell which release a machine has.

## Tests

```bash
cd cli && node --test
```

Zero-dependency `node:test` suite: settings precedence and prod block, date math (including UTC host vs New York), legacy-pinned broker framing, a fake TCP broker for sign-on, every scenario against an in-memory VistA, and the installers (`test/install.test.js` builds the package, serves it locally, and drives `install.sh` and `install.ps1`; it is not shipped in the package and skips what the machine cannot run). RPC details live in [docs/rpc-notes.md](docs/rpc-notes.md).
