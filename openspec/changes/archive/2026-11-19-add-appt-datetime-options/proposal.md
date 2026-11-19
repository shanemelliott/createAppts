# Proposal

## Why

`appts regular` always books the next open slot at the clinic's own appointment length. Testers who need an appointment at a specific day and time, or with a specific length (for example to line up with other test data or to reproduce a scheduling case), have to book it in VistA by hand.

## What Changes

- Add `--at "<date>@<time>"` to `appts regular`: book at that site-time start instead of the next open slot. The date and time use VistA conventions: `1/1/2027@9:30`, `T@9:30` (today), `T+1@14:00` (tomorrow, any `T+N` day offset), and an optional `AM`/`PM`. The ISO form `2027-01-01@09:30` is accepted too.
- Add `--length <minutes>` to `appts regular`: book with that appointment length instead of the clinic's default.
- Without either option, behaviour is unchanged.
- `--from` and `--to` on `appts` (patient appointments), `appts availability`, and `appts cancel-availability` accept the same VistA date forms (`1/1/2027`, `T`, `T+30`), alongside ISO dates. Date only: a time part is rejected.
- The requested time is checked against the clinic's open slots before anything is created. If it is not bookable, the tool writes nothing and reports the nearest open slots instead.
- `--dry-run` shows the chosen clinic, start, end, and length without connecting.

## Capabilities

### New Capabilities
- `appt-datetime-options`: Choosing the start date/time and appointment length when `appts regular` books an appointment, including validation, availability checking, and failure output.

### Modified Capabilities

## Impact

- **Code**: `cli/src/dates.js` (a VistA date/time parser), `cli/src/settings.js` (options and validation, including `--from`/`--to` for the query and cancel-availability commands), `cli/src/scenarios/singleClinic.js` and `cli/src/vista/scheduling.js` (slot selection and length), help text, README, tests.
- **RPC**: no new RPCs; `SDEC APPSLOTS` is used to verify the time and `SDEC APPADD` already takes start, end, and length.
- **Depends on** `add-appt-scenario-cli` (the `regular` scenario). That change is not archived yet, so this change adds a new capability instead of modifying its specs.
