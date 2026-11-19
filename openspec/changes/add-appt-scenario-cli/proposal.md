# Proposal

## Why

Testers need repeatable appointment test data for specific scheduling scenarios, especially OSM (desired date in the past, appointment far in the future), and they need to create it from an AWS EC2 Linux console. Today's tools can't do that. `single-appointment-api` needs a Windows .NET STS exe and a PIV card. `bulk-appointments` only creates random appointments and pulls in several npm dependencies.

## What Changes

- Add a new top-level `cli/` folder with a portable Node.js command-line tool (`appt-scenario`). It must have zero npm runtime dependencies and run on Node 18+ on Amazon Linux 2023 and Windows.
- Add a zero-dependency VistA RPC Broker client built on Node's `net` module. It is ported from `bulk-appointments/VistaJSLibrary.js`, logs in with access/verify codes, and drops `async`, `underscore`, `bunyan` and `node-cache`.
- Load configuration from CLI flags, then environment variables, then an optional `.env` file, using a built-in parser (no `dotenv`).
- Block production with a hard check. Only the `dev` and `sqa` environments are allowed.
- Support four scenarios:
  1. `regular`: a standard appointment request (ARSET) plus an appointment (APPADD) at the next open slot.
  2. `osm`: desired date at least 60 days in the past, appointment at least 60 days in the future.
  3. `osmxgroup`: OSM cross-clinic grouping. The tool confirms that one clinic in the supplied group has no availability in the next 60 days. With `--block-availability`, it first cancels that clinic's availability for the next 60 days. Then it creates the request with desired date 60 days in the past and books the appointment at least 90 days out.
  4. `osmancillary`: a primary appointment plus a same-day ancillary appointment in a separate clinic, both at least 90 days out, with desired date 60 days in the past. The ancillary appointment is an ordinary appointment in a second clinic (e.g. Lab or RN for a PCP primary). The pairing exists only in the VEText OSM configuration, so nothing in VistA marks it as ancillary or links the two appointments.
- Add a `cancel-availability` command that blocks a clinic's availability day by day over a date range with `SDES CANCEL CLIN AVAILABILITY`. It is ported from `single-appointment-api/cancel-november-availability.js` and supports `--dry-run`.
- If no slot is open at the target date, search forward for up to 30 days (configurable), then fail with a clear error.
- Take the patient from `--dfn` or `APPT_DFN`. If neither is set, pick a random test patient.
- Print a human-readable summary by default, or machine-readable JSON with `--json`, and return non-zero exit codes on failure.
- Add one-line installers, modeled on the clinic list editor's `iwr -useb https://downloads.example.com/clinic-list-editor | iex`: `iwr -useb https://downloads.example.com/appt-cli | iex` on Windows and `curl -fsSL https://downloads.example.com/appt-cli-sh | sh` on Linux. They download a zip or tar.gz, verify its SHA-256, extract to `./appt-cli`, and offer to create `.env` with hidden credential prompts and a short `appts` command (so you can type `appts regular`). A build script produces the release files to upload.

## Capabilities

### New Capabilities
- `vista-rpc-client`: A portable, zero-dependency RPC Broker connection over TCP. Covers configuration loading (flags, env, `.env`), environment allow-listing (dev/sqa only, prod blocked), and secret handling.
- `appt-scenarios`: The `appt-scenario` CLI and its scenarios (`regular`, `osm`, `osmxgroup`, `osmancillary`). Covers date rules, slot search, patient selection, clinic group verification, same-day primary/ancillary pairing, and output and exit codes.
- `cli-distribution`: One-line Windows and Linux installers, package integrity check, Node.js prerequisite check, credential setup, in-place upgrades, and the release package build.

### Modified Capabilities

## Impact

- **New code**: `cli/` (package.json with no dependencies, bin entry, src modules, README, `install/` scripts, `scripts/` build).
- **Hosting**: release files uploaded to `https://downloads.example.com/files/appt-cli/latest/`, with short links `https://downloads.example.com/appt-cli` (install.ps1) and `https://downloads.example.com/appt-cli-sh` (install.sh) pointing at the installers. The EC2 host must be able to reach `downloads.example.com`.
- **Reused knowledge**: RPC parameter layouts from `bulk-appointments/index.js` and `reference/brunoRequest Samples.md`. Response parsing patterns from `single-appointment-api/src/services/appointmentService.js`.
- **RPCs used**: `SDEC ARSET`, `SDEC APPADD`, `SDEC APPSLOTS`, `SDEC RESCE`, `SDEC GET PATIENT DEMOG`, `XUS GET USER INFO`, `SDES CANCEL CLIN AVAILABILITY`, `SDEC APPDEL`, `SDEC ARCLOSE`, all called under the configured RPC context (default `CDSP RPC CONTEXT`).
- **Systems**: Only dev and sqa VistA instances. The EC2 host needs network reachability to the VistA broker port.
- **Existing tools**: No changes to `single-appointment-api` or `bulk-appointments`.
