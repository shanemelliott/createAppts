# Design

## Context

See proposal.md (Why). Constraints that shape the design:

- `bulk-appointments/VistaJSLibrary.js` already speaks the RPC Broker protocol over `net`, but it depends on `async`, `underscore`, `underscore.string`, `bunyan`, and `node-cache`, and it is CommonJS with callbacks.
- `single-appointment-api` gets its tokens from a Windows-only .NET STS exe plus PIV. That can't work on headless Linux, so this design doesn't use it.
- The RPC parameter layouts for `SDEC ARSET` (29 pieces) and `SDEC APPADD` (25 pieces) are already captured in `bulk-appointments/index.js`, `single-appointment-api/src/services/appointmentService.js`, and `reference/brunoRequest Samples.md`.
- EC2 instances usually run in UTC. VistA dates are site-local.

## Goals / Non-Goals

**Goals:**
- One self-contained folder (`cli/`) that runs from a `git clone` or a copied tarball with `node`.
- Scenario logic is separated from transport, so scenarios can be unit-tested against a fake RPC layer.
- Deterministic date math with an explicit timezone.

**Non-Goals:**
- No vista-api-x / JWT / STS support.
- No changes to clinic templates or grids. Availability is only changed by `cancel-availability` or the opt-in `osmxgroup --block-availability`, and is never restored automatically.
- No bulk generation. One scenario instance per run; callers loop in shell when they need more.
- No changes to the existing `single-appointment-api` or `bulk-appointments` code.

## Decisions

### D1. Node ESM, zero dependencies, Node 18+
Use the built-in `net`, `node:test`, `node:assert`, `util.parseArgs` (available since Node 18.3), and `fs`. Set `"engines": { "node": ">=18.3" }`.
- *Alternatives:* a Node SEA single binary (fragile build and cross-compiling for Linux from Windows); Docker (may not be available on locked-down EC2). Either could be added later on top of the same source.

### D2. Port the RPC Broker client rather than reuse it
Rewrite the parts of `VistaJSLibrary.js` this tool needs as a small promise-based module: TCP connect, `XUS SIGNON SETUP`, `XUS AV CODE` (with the existing cipher pad encryption), `XWB CREATE CONTEXT`, RPC call, and `#BYE#`. Use a single persistent connection per run, with a connect/read timeout.
- *Alternatives:* vendoring the old file plus its dependencies would break the zero-dependency rule. Shelling out to an existing tool isn't portable.

### D3. Layered configuration with a built-in `.env` parser
Precedence is flags > `process.env` > `.env` (the `--env-file` path, or `./.env`, then `cli/.env`) > built-in defaults. The parser handles `KEY=VALUE`, quoted values, `#` comments, and blank lines, and nothing more (no interpolation). Node 20.6+ `--env-file` is not used because it doesn't exist in Node 18. The built-in defaults target the dev VistA (station 500), so only access/verify codes are required out of the box.

| Setting | Flag | Env var | Default |
|---|---|---|---|
| Environment (dev/sqa) | `--env` | `APPT_ENV` | `sqa` |
| Broker host | `--host` | `VISTA_HOST` | `vista.example.com` |
| Broker port | `--port` | `VISTA_PORT` | `9094` |
| RPC context | `--context` | `VISTA_CONTEXT` | `CDSP RPC CONTEXT` |
| Station | `--station` | `VISTA_STATION` | `500` |
| Access / verify | (env/.env only) | `VISTA_ACCESS_CODE` / `VISTA_VERIFY_CODE` | none (required) |
| Patient DFN | `--dfn` | `APPT_DFN` | random test patient |
| Clinic IEN (regular, osm) | `--clinic` | `APPT_CLINIC` | `195` (CARDIOLOGY) |
| Primary clinic (osmancillary) | `--clinic` | `APPT_PRIMARY_CLINIC` | `532` (DEV PACT MD 4) |
| Ancillary clinic | `--ancillary-clinic` | `APPT_ANCILLARY_CLINIC` | `521` (LABORATORY) |
| Group clinics | `--group-clinics` | `APPT_GROUP_CLINICS` | `478,485` (DEV/ENDOCRINE/5, DEV/ENDOCRINE/6) |
| Search window | `--search-days` | `APPT_SEARCH_DAYS` | `30` |
| Timezone | `--tz` | `APPT_TZ` | `America/New_York` |
| Cleanup disposition IEN (409.853) | (env/.env only) | `APPT_CLOSE_DISPOSITION` | `6` (ENTERED IN ERROR) |
| Clinic to block (cancel-availability) | `--clinic` | `APPT_BLOCK_CLINIC` | `478` (DEV/ENDOCRINE/5) |

`--clinic` means the primary clinic for `osmancillary` and the booking clinic for `regular`/`osm`, so separate env vars keep the per-scenario defaults apart. The context is configurable because the sign-on option must contain the SDEC RPCs; `CDSP RPC CONTEXT` is used on dev.

Access and verify codes are deliberately not accepted as flags, so they don't show up in shell history or `ps` output.

### D4. Production block is an allow-list checked first, then confirmed by the server
Before any I/O, the resolved `APPT_ENV` (default `sqa`) must match `/^(dev|sqa)$/i`. There is no override flag. That label is only what the user typed (it does not stop `VISTA_HOST` pointing at a production system), so right after sign-on `openSession` calls `ORWU USERINFO` and reads piece 26, the production-account flag (`0` on dev, verified). It continues only on an exact `0`: a `1`, any other value, a missing piece, or a failed call all sign off and refuse, and no scheduling RPC is ever sent. This applies to every connected command, including `--check`, and has no override. Every output line includes the environment name, so screenshots and logs make the target clear.

### D5. Module layout
```
cli/
  package.json            (type: module, bin: appt-scenario, no deps)
  bin/appt-scenario.js    (shebang entry; arg parsing, exit codes)
  src/settings.js         (env file parse, layering, validation, masking; not config.js - root .gitignore ignores that name)
  src/broker/protocol.js  (message framing)
  src/broker/rpcClient.js (TCP RPC Broker client)
  src/broker/cipher.js    (XUS AV CODE encryption)
  src/vista/scheduling.js (ARSET/APPADD/APPSLOTS/RESCE/patient wrappers + response parsers)
  src/dates.js            (tz-aware offsets, VistA date formats)
  src/engine.js           (cleanup ledger, booking, availability cancel)
  src/scenarios/{singleClinic,osmxgroup,osmancillary,cancelAvailability,index}.js
  src/output.js           (human / JSON)
  test/*.test.js          (node:test; run with `node --test` from cli/)
  testlib/                (fake VistA, legacy framing fixtures - outside test/ so discovery skips them)
  install/install.ps1     (Windows one-liner target)
  install/install.sh      (Linux one-liner target)
  scripts/build-package.ps1 (builds cli/dist/ release files)
  .env.sample
  README.md
```
Each scenario takes `(ctx)`, where `ctx = { rpc, config, log }`, and returns a result object. Only `bin/` calls `process.exit`.

### D6. Date handling
All "today ± N days" calculations use the configured IANA timezone through `Intl.DateTimeFormat`, so a UTC EC2 host produces the same dates as a workstation at the site. Formats: ARSET desired date `M/D/YYYY`, ARSET request time `M/D/YYYY@HH:MM`, APPADD start/end `MON DD, YYYY@HH:MM`.

### D7. Scenario flows
- **Common:** resolve patient, then resolve clinic → resource (`SDEC RESCE`), then find a slot (`SDEC APPSLOTS` over the date window), then `SDEC ARSET` (desired date), then `SDEC APPADD` (piece 15 = `A|<requestIen>`, piece 10 = desired date, overbook = `0`).
- Slots are looked up **before** the request is created, so a "no slot" result leaves nothing to clean up.
- **osmxgroup:** with `--block-availability`, first run the cancel-availability flow on the first group clinic for today..today+60. Then call `SDEC APPSLOTS` for each group clinic from today to today+60. Clinics with zero open slots are the "empty" clinics. If there are none, fail. Otherwise book the first other clinic that has a slot from today+90 onward.
- **cancel-availability:** ported from `single-appointment-api/cancel-november-availability.js`. For each date, call `SDES CANCEL CLIN AVAILABILITY` with `[clinicIen, 'F', '<YYYY-MM-DD>T00:00<offset>', '<YYYY-MM-DD>T21:00<offset>', reason]`. The UTC offset is computed per date from `APPT_TZ`, so DST gives `-04:00` or `-05:00` rather than the old script's hard-coded `-05:00`. It runs over the broker connection instead of vista-api-x, keeps going after per-day errors, and `--dry-run` prints the parameters only.
- **osmancillary:** find slots in both clinics in the window starting at today+90, and pick the first date with a slot in each where the times don't overlap. Create the primary ARSET+APPADD, then the ancillary ARSET+APPADD with the same parameters apart from clinic and time. There is no ancillary marker in VistA; the pairing lives in the VEText OSM configuration. The two are not linked: ARSET piece 25 (parent request) and APPADD piece 24 stay empty, and ARSET piece 14 (multiple appointment RTC) stays `NO` on both.
- **Cleanup:** keep a per-run ledger of created IENs and undo it in reverse order on failure:
  - Appointment created: `SDEC APPDEL` with `[apptIen, 'C', '', 'appt-scenario cleanup', '', duz, '', '2']`. Positions 1–6 and 8 are SDECAPTID, SDECTYP=C (cancelled by clinic), SDECCR, SDECNOT, SDECDATE, USERIEN and SDF=2. With SDF=2 the appointment is not reopened, and its request is closed with disposition REMOVED/EXTERNAL APP. A successful response contains `ERRORID` with no error text.
  - Request with no appointment: `SDEC ARCLOSE` with `[reqIen, dispositionIen, duz]`. It returns the IEN on success, or `-1^msg` / `-2^msg` on failure. `dispositionIen` (pointer to file 409.853) comes from `APPT_CLOSE_DISPOSITION`. It defaults to `6` (ENTERED IN ERROR), and can be overridden per site.

### D8. One-line installers
Modeled on `clinicListEditor/web-install.ps1`, but simpler because the CLI has no dependencies, so there is no Scoop, `npm install`, or Node bootstrap.

- **Hosting:** release files go to `https://downloads.example.com/files/appt-cli/latest/`: `appt-cli.zip`, `appt-cli.tar.gz`, a `.sha256` for each, `install.ps1`, `install.sh`. The short links `https://downloads.example.com/appt-cli` and `https://downloads.example.com/appt-cli-sh` point at the two installers. The installers read `APPT_CLI_BASE_URL` (default the folder above); this also lets tests serve a local build. The package file names under `files/appt-cli/` are an assumption based on the clinic-list-editor layout and are easy to change.
- **Formats:** `.tar.gz` for Linux (`curl` and `tar` are always present; `unzip` is not on Amazon Linux 2023) and `.zip` for Windows (`Expand-Archive`, as in the existing installer).
- **Integrity:** the installer downloads the `.sha256` and compares it with the package before extracting (`sha256sum` or `shasum -a 256` on Linux, `Get-FileHash` on Windows). This matters because `curl | sh` runs whatever it fetches.
- **Node check:** require 18.3+ (`util.parseArgs`). If missing or older, print the requirement plus an example command (`sudo dnf install -y nodejs` on Amazon Linux, `winget install OpenJS.NodeJS.LTS` on Windows) and exit non-zero. No automatic Node install.
- **Location:** extract into `./appt-cli` under the current directory. If the current directory is not writable (a probe file cannot be created; for example an elevated PowerShell opens in `C:\Windows\System32`), say so and use the user profile / `$HOME` instead, and print the next-step command with the absolute script path; if neither is writable, stop with a message. No PATH, profile, or registry changes, no sudo or admin. On Linux the installer runs `chmod +x bin/appt-scenario.js`. It prints `node appt-cli/bin/appt-scenario.js --check` as the next step (or `appts --check` when the launcher below was created).
- **Launcher (`appts`):** an opt-in two-line script that runs `node '<install>/bin/appt-scenario.js' "$@"` (Linux) or `node "<install>\bin\appt-scenario.js" %*` (Windows `appts.cmd`), marked with a comment so later runs recognize it. Linux: `~/.local/bin`. Windows: `%USERPROFILE%\.local\bin` or `%LOCALAPPDATA%\Microsoft\WindowsApps`, whichever is already on PATH (the developer machine has `~\.local\bin` on PATH but not WindowsApps, so no single fixed folder works). If neither is on PATH, it uses `~\.local\bin`, prints how to add it, and prints the full path to use meanwhile. It is asked after the credentials, default yes; non-interactive runs skip it unless `APPT_CLI_LAUNCHER=1`. Re-runs rewrite a launcher that carries the marker and never touch a file that does not. It stores the absolute install path, so moving the folder means re-running the installer. A global npm package (`npm link`) was rejected: it needs npm and often sudo, against the zero-dependency design.
- **Upgrade:** extract to a temp folder next to the target, keep the existing `.env`, then swap the program files. A failed download, checksum, or extract leaves the old install intact.
- **Credentials:** after install, prompt for the access and verify codes with hidden input and write `.env` from `.env.sample` with the codes filled in. Linux: with `curl | sh` the script is on stdin, so `read` must use `/dev/tty`, and `.env` is `chmod 600`. Windows: `Read-Host -AsSecureString`, and the file ACL is restricted to the current user with `icacls`. With no terminal, or if the user skips, copy `.env.sample` to `.env` and print what to fill in. `VISTA_ACCESS_CODE` and `VISTA_VERIFY_CODE` set in the environment skip the prompt, and `APPT_CLI_NO_PROMPT` forces the no-prompt path (also used by tests so they never touch the developer's terminal). `APPT_CLI_NODE` names the node executable to check, so tests can fake missing and old versions. The codes never go in arguments, logs, or installer output.
- **Build:** `scripts/build-package.ps1` (the dev machine is Windows) stages `cli/` without `.env`, `dist/`, and `node_modules`, then writes the `.zip` (`Compress-Archive`), the `.tar.gz` (`tar -czf`, bundled with Windows 10+), the `.sha256` files, and copies `install/*` into `cli/dist/`. Uploading to downloads.example.com stays manual.
- *Alternatives:* a single zip for both platforms (needs `unzip` on Linux); auto-installing Node (more to test, and often not permitted on locked-down hosts); installing on the PATH (changes the user environment, not needed for a test tool).

### D9. Testing
- Unit tests for config precedence, env guard, `.env` parsing, date math (including the UTC host case), parameter builders, and response parsers.
- Scenario tests against an in-memory fake RPC layer that asserts which RPCs were called and with what parameters (OSM offsets, MRTC/parent fields left empty, no writes in osmxgroup when the group doesn't qualify).
- One broker-protocol test against a local fake TCP server, to check sign-on and secret masking.
- Run with `node --test cli/test`.
- Installer tests (`test/install.test.js`) build the package, serve `cli/dist` from a local Node HTTP server, and run each installer against it through `APPT_CLI_BASE_URL`. They cover install, upgrade keeping `.env`, checksum mismatch, missing Node, and the no-terminal path. The `install.sh` test is skipped where `sh` is unavailable, and the `install.ps1` test where PowerShell is unavailable.

## Risks / Trade-offs

- [Desired date in the past] → Already used successfully with `single-appointment-api`. If a build rejects it, the scenario fails loudly rather than silently changing dates.
- [Cancelled availability is not restored] → Output lists the blocked clinic and dates. `cancel-availability --dry-run` lets users preview before running. Restoring availability is out of scope.
- [EC2 security groups may block the broker port] → README includes a connectivity check (`appt-scenario ping`-style sign-on test, built into `--check`).
- [Timezone mismatch near midnight] → Use an explicit `APPT_TZ`. Minimum offsets are checked against the computed dates before any RPC.
- [Cipher pad or broker protocol differences between sites] → Port it exactly from the working `VistaJSLibrary.js`. The fake broker test locks in the behavior.
- [Cleanup RPC failure leaves orphan records] → Report leftover IENs in both human and JSON output.

## Migration Plan

New tool, nothing to migrate. Deploy by `git clone` (or copying `cli/`) to the EC2 host, creating `cli/.env` from `.env.sample`, and running `node cli/bin/appt-scenario.js --check`. Roll back by deleting the folder.

## Open Questions

- ARSET piece 13 is ENROLLMENT PRIORITY (the patient's VA priority group, `GROUP 1`–`GROUP 8`). It is not related to clinic grouping, so `osmxgroup` doesn't use it. Default `GROUP 1`. Note that SDECAR2 only maps `GROUP3`/`GROUP4` without a space.
- Which RPC to use for random test-patient selection on each site (`SDEC GET PATIENT DEMOG` as in `bulk-appointments`, with a fallback to `ORWPT LIST ALL`).
