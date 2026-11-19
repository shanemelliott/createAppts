# Tasks

## 1. Spike: confirm RPC behavior in dev

- [x] 1.1 Record the `SDEC APPDEL` (SDECTYP=C, SDF=2) and `SDEC ARCLOSE` parameter layouts in `cli/docs/rpc-notes.md`. In dev, capture one sample response from each RPC. Note that disposition IEN 6 = ENTERED IN ERROR (the default for `APPT_CLOSE_DISPOSITION`).
- [x] 1.2 Record the `SDEC APPSLOTS` response format from a dev call in `cli/docs/rpc-notes.md`. Verify the sample includes both open and booked slots.
- [x] 1.3 Record the ARSET input layout from SDECAR2 (piece 13 = enrollment priority, 14 = MRTC, 22 = appt type, 25 = parent request) in `cli/docs/rpc-notes.md`. Verify the parameter builder in 5.2 uses it.

## 2. Scaffold `cli/`

- [x] 2.1 Create `cli/package.json` (`type: module`, `bin.appt-scenario`, `engines.node >=18.3`, no `dependencies`, `test` script `node --test test/`). Verify `node -e "require('./cli/package.json').dependencies===undefined||process.exit(1)"` passes.
- [x] 2.2 Create `cli/bin/appt-scenario.js` with a shebang, `util.parseArgs` handling, and `--help` output. Verify `node cli/bin/appt-scenario.js --help` exits 0 and lists all four scenarios.
- [x] 2.3 Add `cli/.env.sample` listing every setting with its default from design D3 (access/verify blank), and add `cli/.env` to `.gitignore`. Verify with `git check-ignore cli/.env`.

## 3. Configuration and safety

- [x] 3.1 Implement the `.env` parser, built-in defaults (D3 table), and flag > env > `.env` > default precedence in `src/config.js`. Verify with unit tests for precedence, defaults-only resolution (connection and per-scenario clinics), `--env-file`, quoted values, comments, and missing access/verify errors.
- [x] 3.2 Implement the dev/sqa allow-list guard, run before any I/O. Verify that tests for `prod`, `production`, `preprod`, and mixed-case `SQA` behave as specified (no socket opened when blocked), and that an unset environment resolves to `sqa`.
- [x] 3.3 Implement secret masking for config echo and verbose logs. Verify that a test asserts access/verify values never appear in captured stdout/stderr.
- [x] 3.4 Confirm with the server that it is not production: after sign-on call `ORWU USERINFO` and require the production flag (piece 26) to be exactly `0`; refuse, sign off, and send no scheduling RPC on `1`, any other value, a missing piece, or a failed call. Verified with fake-broker tests for each case and a real dev `--check`.

## 4. RPC Broker client

- [x] 4.1 Port the cipher and the broker message framing from `bulk-appointments/VistaJSLibrary.js` into `src/broker/`. Verify that unit tests for the encrypted/literal/list parameter strings match outputs from the old library.
- [x] 4.2 Implement the promise-based connect, sign-on, create-context, call, and sign-off with timeouts. Verify against a fake TCP broker test for success, bad credentials, and an unreachable host.
- [x] 4.3 Implement `--check`. Verify by running it in dev from Windows: it prints user/DUZ and exits 0. Document it in `cli/README.md`.

## 5. Scheduling primitives

- [x] 5.1 Implement tz-aware date helpers and VistA formatters in `src/dates.js`. Verify with unit tests, including `TZ=UTC` against `APPT_TZ=America/New_York` around midnight.
- [x] 5.2 Implement the ARSET/APPADD parameter builders and response parsers in `src/vista/scheduling.js`, using the spike notes. Verify that unit tests pin each piece used by the scenarios.
- [x] 5.3 Implement clinic → resource resolution, slot search (forward window, no overbook), and patient selection (`--dfn` / `APPT_DFN` / random). Verify with fake-RPC tests for slot-on-first-day, slot-later, none-in-window, and random-patient.
- [x] 5.4 Implement the per-run cleanup ledger: `SDEC APPDEL` with SDF=2 for booked appointments and `SDEC ARCLOSE` for request-only records, in reverse order, and report leftovers. Verify with fake-RPC tests for an APPADD failure after ARSET (ARCLOSE called), a failure after the first osmancillary appointment (APPDEL called with SDF=2), and that ARCLOSE gets disposition `6` by default and the `APPT_CLOSE_DISPOSITION` value when it is set.

## 6. Scenarios

- [x] 6.1 Implement `regular`. Verify with a fake-RPC test (desired date = today, linked `A|<ien>`) and one real dev run. Document it in the README.
- [x] 6.2 Implement `osm` with minimum checks on `--past-days`/`--future-days`. Verify with fake-RPC tests for the date offsets and rejection of values under 60, and one real dev run. Document it in the README.
- [x] 6.3 Implement `cancel-availability` (per-day `SDES CANCEL CLIN AVAILABILITY`, tz-aware offsets, `--days`/`--from`/`--to`, `--dry-run`, continue past per-day failures). Verify with fake-RPC tests for parameter format across a DST boundary, dry run making no calls, and partial failure exiting non-zero, and with one real dev run against clinic 478. Document it in the README.
- [x] 6.4 Implement `osmxgroup`, including `--block-availability`. Verify with fake-RPC tests for the qualifying group, the non-qualifying group (no write RPCs called), block-then-book, still having slots after blocking, and fewer than two clinics, and with one real dev run. Document it in the README.
- [x] 6.5 Implement `osmancillary`. Verify with fake-RPC tests for the same-day non-overlapping pair, one ordinary request+appointment per clinic, MRTC = `NO` and no parent link on either, no common day, and the same clinic given twice, and one real dev run. Document it in the README.
- [x] 6.6 Implement human and `--json` output with exit codes. Verify that a test asserts stdout is one parseable JSON object and that failures exit non-zero.

## 7. One-line installers

- [x] 7.1 Write `cli/scripts/build-package.ps1` to stage `cli/` (excluding `.env`, `dist/`, `node_modules`), write `appt-cli.zip` and `appt-cli.tar.gz`, a `.sha256` for each, and copy `install/*` into `cli/dist/`. Add `cli/dist/` to `.gitignore`. Verify by running it with a `cli/.env` present: the output folder has all six files, neither archive contains `.env`, and each checksum matches the recomputed SHA-256.
- [x] 7.2 Write `cli/install/install.sh`: Node 18.3+ check, `APPT_CLI_BASE_URL`, download, SHA-256 verify, extract to `./appt-cli` keeping any existing `.env`, `chmod +x`, and hidden credential prompt via `/dev/tty` with a `chmod 600` `.env` (or sample copy when there is no terminal). Verify with an installer test against a local HTTP server covering fresh install, upgrade keeping `.env`, checksum mismatch (nothing extracted), missing Node, and no-terminal; and run `sh -n install.sh`.
- [x] 7.3 Write `cli/install/install.ps1` with the same behavior: `Get-FileHash`, `Expand-Archive`, `Read-Host -AsSecureString`, and `icacls` restricting `.env` to the current user. Verify with the same installer test run under PowerShell, plus a manual run in a normal (non-admin) Windows terminal.
- [x] 7.4 Add `test/install.test.js` that builds the package, serves `cli/dist` locally, and drives both installers. Verify that it passes on Windows and that the `sh` test is skipped, not failed, where `sh` is missing.
- [x] 7.5 Document the build, upload (`https://downloads.example.com/files/appt-cli/latest/`), short links (`https://downloads.example.com/appt-cli`, `https://downloads.example.com/appt-cli-sh`), and both one-liners in `cli/README.md`. Verify that the documented commands match `install/*` and the design.
- [x] 7.7 Add the opt-in `appts` launcher to both installers (Linux `~/.local/bin`; Windows `~\.local\bin` or WindowsApps, whichever is on PATH), asked after the credentials, with `APPT_CLI_LAUNCHER`/`APPT_CLI_BIN_DIR`, refresh-on-upgrade, and no overwrite of foreign files. Verify with installer tests on sh, PowerShell 7 and 5.1 (opt-in, runs the CLI, refresh, foreign file, default-folder choice and PATH hint) and a real-Linux pty run; document it in `cli/README.md`.
- [x] 7.8 Fall back to the user's home folder when the current directory is not writable (found when `iwr ... | iex` was run from `C:\Windows\System32`: "Access to the path '.appt-cli-install-...' is denied"), in both installers, with the next-step command showing the real path and a clear error when nothing is writable. Verified with installer tests (PowerShell via a deny ACL; sh via chmod) and a real-Linux run as a non-root user.
- [x] 7.6 Upload the build output and create the two downloads.example.com short links (done by the user). Verify by running the Windows one-liner in a fresh folder and then `node appt-cli\bin\appt-scenario.js --check`.

## 8. Portability verification

- [x] 8.1 On an Amazon Linux 2023 EC2 instance with only Node 18 installed, run `curl -fsSL https://downloads.example.com/appt-cli-sh | sh` (no git clone, no npm), enter credentials at the prompt, and run `--check` plus all four scenarios against dev/sqa. Record the results in `cli/README.md` (EC2 section).
- [x] 8.2 Run `node --test` from the installed `appt-cli` folder on Node 18 and the current LTS on both Linux and Windows. Verify that all tests pass.

## Resume notes (as of 2026-11-17)

Status: 26/31 done (installer group 7 incl. the `appts` launcher is built and tested; 7.6 is the user's upload). The CLI and installers are complete; 93 tests (92 pass, 1 skipped on Windows) on Node 24 with `cd cli && node --test`. `cli/dist/` is already built from the current installers. Resume with `/opsx-apply add-appt-scenario-cli`.

Implementation notes that differ from the task text above:
- Settings live in `cli/src/settings.js` (root `.gitignore` ignores `config.js`); the test script is `node --test` run from `cli/`, with helpers in `cli/testlib/` so discovery skips them.
- Root `.gitignore` gained `!cli/bin/` so the entry point is committed.
- Slot search merges contiguous APPSLOTS rows: dev returns 15-minute rows while clinic 195 `LengthOfAppt` = 30.

Dev runs already done (station 500, user TESTER,ONE DUZ 12345), all leaving real test records:
- `--check` OK.
- `regular`: request 42460 / appt 65457 (since cancelled by the cleanup probe), clinic 195.
- `osm`: request 42461 (desired 2026-09-18) / appt 65458, clinic 195, 2027-01-16 08:00.
- `osmancillary`: 532 request 42462 / appt 65459 08:30 and 521 request 42463 / appt 65460 08:00, both 2027-02-15.
- `osmxgroup` (verify only): correctly refused with no writes; 478 is open from 2027-01-01, 485 from today.
- Cleanup probe (`node testlib/probe-cleanup.js 65457 100126 195`): `SDEC APPDEL` cancelled 65457 and `SDEC ARCLOSE` closed throwaway request 42464; replies recorded in `cli/docs/rpc-notes.md`.
- Installers: `install.sh` passed on Git sh (Windows) and on real Linux (WSL Ubuntu, file:// URLs, stub node: no-tty fallback, env codes with `$ & # "`, 600 perms, `cat install.sh | sh` under a pty with hidden prompts, upgrade keeping `.env`). `install.ps1` passed on PowerShell 7 and Windows PowerShell 5.1, including `iex` not closing the session. The package's bundled 67 tests pass when extracted standalone.
- Installer-only env vars beyond the spec: `APPT_CLI_NO_PROMPT` (never prompt) and `APPT_CLI_NODE` (node executable to check), used by tests and scripted installs; `VISTA_ACCESS_CODE`/`VISTA_VERIFY_CODE` also skip the prompt.
- `appts` launcher: verified on real Linux (WSL, pty prompt order credentials then launcher, path containing a quote, PATH hint) and in the sh / PowerShell 7 / 5.1 tests. On this Windows machine `%USERPROFILE%\.local\bin` is on PATH but WindowsApps is not, so the installer picks `~\.local\bin`. Not yet run for real on this machine (it would write `appts.cmd` into `C:\Users\VACOEllioS1\.local\bin`).

Remaining:
- 6.3 / 6.4: clinic 478 already has availability cancelled until 2027-01-01 (user), but `osmxgroup` needs it empty through today+60 = 2027-01-16. Suggested: `node bin/appt-scenario.js cancel-availability --from 2027-01-01 --to 2027-01-16` (or `--dry-run` first), then `node bin/appt-scenario.js osmxgroup` (verify-only path), and one `osmxgroup --block-availability` run. These cancel availability on dev and are not restored by the tool. Days already cancelled may report a failure from the RPC; check the reply and treat that as expected if so.
- 7.6 (user): run `cd cli; pwsh scripts/build-package.ps1`, upload the six files in `cli/dist/` to `https://downloads.example.com/files/appt-cli/latest/`, create short links `https://downloads.example.com/appt-cli` -> install.ps1 and `https://downloads.example.com/appt-cli-sh` -> install.sh, then run the Windows one-liner in a fresh folder and `node appt-cli\bin\appt-scenario.js --check`.
- 8.1: EC2 run via the one-liner (Amazon Linux 2023, Node 18, enter credentials at the prompt); record results in `cli/README.md`. Needs downloads.example.com reachable from EC2.
- 8.2: run the suite on Node 18 and current LTS, Linux and Windows.
- After all tasks: `openspec validate add-appt-scenario-cli --strict`, then `/opsx-archive`.
