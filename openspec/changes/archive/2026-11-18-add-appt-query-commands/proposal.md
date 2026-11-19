# Proposal

## Why

Testers who create scenarios with `appts` also need to look things up without opening VistA: what appointments a patient has (including cancelled ones), and what a clinic's availability looks like day by day, in the grid format VistA staff already read. Today that means switching to the web tool or a VistA terminal, which is not possible from an EC2 console.

## What Changes

- Add a patient appointments listing: `appts --dfn 100791` (no scenario). It calls `SDES GET APPTS BY PATIENT DFN3` and prints every appointment in the date range with its status (booked, cancelled, no-show, and so on), newest first. Default range is today through four months out, the same as the web tool. `--from`/`--to` or `--months N` change it. With `APPT_DFN` set, plain `appts` does the same for that patient.
- Add `appts availability`: show one clinic's availability for a date range as the VistA-style grid (hours across, one row per day, slot codes in brackets) followed by the code legend. Default range is today through 60 days; `--from`/`--to` or `--days N` change it. Long ranges are fetched in chunks, and in a terminal the grid is paged like VistA ("PRESS RETURN TO CONTINUE OR ^ TO QUIT").
- Both are read-only, honor the existing dev/sqa-only guard and credential handling, and support `--json`.
- Fix the help text: it and the usage/error messages still call the tool `appt-scenario`. They will use `appts`, list every command (including the two new ones), and mention the `node` form once. The README examples get the same rename.

## Capabilities

### New Capabilities
- `appt-queries`: Read-only lookups in the `appts` CLI: a patient's appointments with statuses, and a clinic's availability as a VistA-style grid. Covers invocation, date ranges, output formats, and errors.

### Modified Capabilities

## Impact

- **New code**: query modules and a grid renderer under `cli/src`, command routing in `cli/src/cli.js` and `cli/src/settings.js`, tests, README and help text.
- **RPCs used**: `SDES GET APPTS BY PATIENT DFN3` (new to the CLI; already used by `single-appointment-api`), plus `SDEC APPSLOTS`, `SDEC RESCE` and `SDES GET CLINIC INFO2` (already used).
- **No effect on the existing scenarios** or the installers; the next release build and upload carries the new commands.
- **Depends on** the `add-appt-scenario-cli` change (the CLI, broker client, settings and tests it adds). That change is not archived yet, so this change adds a new capability and does not modify its specs.
