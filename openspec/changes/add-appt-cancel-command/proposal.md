# Proposal

## Why

Testers can create appointments with `appts` and see them with `appts --dfn`, but cleaning one up still means opening VistA. A single, explicit cancel keeps the whole create, check, and clean-up loop on the command line (including the EC2 console), and it uses the same cancel RPC the tool already relies on for its own clean-up.

## What Changes

- Add `appts cancel --appt <ien>`: cancel one appointment by its appointment IEN (the IEN shown by `appts --dfn`), using `SDEC APPDEL`.
- By default the appointment is cancelled by the clinic and its appointment request is reopened (it goes back to the pending list). `--no-reopen` closes the request instead (REMOVED/EXTERNAL APP), and `--by patient` records a cancellation by the patient.
- No cancellation reason is sent unless asked: `--reason-ien N` sends a cancellation-reason IEN and `--note "text"` sends a note.
- `--dry-run` prints what would be sent and changes nothing. `--json` is supported.
- One appointment per run. There is deliberately no patient, clinic, or date-range form.
- Same safety as the other commands: dev and sqa only, plus the server-side production check.

## Capabilities

### New Capabilities
- `appt-cancel`: Cancelling a single appointment by IEN from the `appts` CLI, including cancel type, request reopening, reason and note, dry run, output, and failure handling.

### Modified Capabilities

## Impact

- **New code**: a `cancel` command handler and settings in `cli/src`, help text, README, tests.
- **RPC**: `SDEC APPDEL` (already used for clean-up; the new part is `SDF=1` to reopen and `PC` for patient cancellations).
- **No change** to the scenarios, queries, or installers. The next release build carries the command.
- **Depends on** the `add-appt-scenario-cli` change (CLI, broker client, settings, production guard). That change is not archived yet, so this change adds a new capability instead of modifying its specs.
