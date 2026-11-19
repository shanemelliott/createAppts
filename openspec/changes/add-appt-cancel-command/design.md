# Design

## Context

See proposal.md (Why). Relevant existing pieces in `cli/`:

- `src/vista/scheduling.js` already has `buildAppdelParams(apptIen, duz)` and `parseAppdelResponse`, used by the failure clean-up. The verified call on dev (2026-11-17) is `SDEC APPDEL` with `[apptIen, 'C', '', 'appt-scenario cleanup', '', duz, '', '2']`; success is the header `T00020ERRORID` and no data row.
- The `SDEC APPDEL` documentation gives: 1 SDECAPTID, 2 SDECTYP (`C` cancelled by clinic, `PC` cancelled by patient), 3 SDECCR (cancellation reason IEN, optional), 4 SDECNOT (note), 5 SDECDATE (defaults to now), 6 USERIEN (defaults to the current user), 8 SDF (`1` or empty reopens the request, `2` does not reopen and closes it as REMOVED/EXTERNAL APP), 9 SDECCMT, 10 NEWPID (only for patient cancellations), 11 EAS tracking number.
- `src/settings.js` owns command names, option parsing and validation; `src/cli.js` owns routing, connection, output, and exit codes. `cancel-availability` already shows the pattern for a command with `--dry-run` that connects only when it really sends something.

## Goals / Non-Goals

**Goals:**
- One explicit, auditable cancel of one appointment, with the choices the user asked for (reopen by default, reason only when given).
- Reuse the existing RPC wrapper, connection, guards, and output conventions.

**Non-Goals:**
- No cancel by patient, clinic, or date range, and no confirmation prompt (a single explicit IEN is the confirmation; `--dry-run` previews).
- No look-up of the appointment before cancelling (the appointment IEN alone has no verified read RPC; `appts --dfn` is how to find the IEN).
- No cancel-hashtag comments (`SDECCMT`), new-PID handling, or EAS tracking number.

## Decisions

### D1. Command and options
Add the command name `cancel`. Options: `--appt <ien>` (required, numeric), `--by clinic|patient` (default `clinic`), `--no-reopen` (boolean, because Node 18's `util.parseArgs` has no `--no-` negation), `--reason-ien <n>`, `--note <text>`, `--dry-run`, `--json`. `--dfn`, `--from`, `--to`, `--months` are not used by this command; if given without `--appt` the command fails with "--appt is required" before connecting. Validation runs before any connection.

### D2. RPC parameters
`SDEC APPDEL` with `[apptIen, type, reasonIen, note, '', duz, '', sdf]` where `type` is `C` or `PC`, `reasonIen` is `''` unless `--reason-ien`, `note` defaults to `appts cancel`, `duz` is the signed-on user, and `sdf` is `'1'` (reopen, the default) or `'2'` (`--no-reopen`). `buildAppdelParams` gains optional arguments (type, reason, note, sdf) with the current clean-up defaults unchanged (`C`, `''`, `appt-scenario cleanup`, `2`), so clean-up behaviour does not change.

### D3. Results and failures
`parseAppdelResponse` already treats a data row with text, or a leading `-`, as failure. The handler throws a `ScenarioError` with VistA's text on failure; nothing is rolled back (there is no ledger entry). Success returns `{ appointmentIen, cancelType, reopened, reasonIen, note }`; human output prints one line such as `cancelled appointment 65491 (by clinic, request reopened)` followed by the usual `OK`.

### D4. Dry run
`--dry-run` skips the connection and credentials and prints the intended values (the DUZ shown as `<signed-on user>`), like `cancel-availability --dry-run`.

### D5. Testing
Extend `testlib/fakeVista.js` so `SDEC APPDEL` can be given an error reply and records its parameters (it already answers success). Unit tests cover parameter building for each option combination, validation failures before connecting, dry run making no calls, failure text surfacing with a non-zero exit, `--json` shape, and that `--no-reopen` sends SDF `2` while the default sends `1`. The clean-up tests keep passing unchanged.

## Risks / Trade-offs

- [`SDF=1` may not behave as expected on dev, or the cancel-reason argument may be rejected] → A spike task cancels throwaway appointments on dev with and without a reason and records the replies, including an unknown IEN and an already-cancelled appointment, before the handler is finalized.
- [A wrong IEN cancels someone else's appointment] → Dev and sqa only, one IEN per run, and `--dry-run` to preview; the tool does not try to guess or verify ownership.
- [Cancel type `PC` may need extra arguments (NEWPID)] → Not sent; the spike confirms `PC` works without it, otherwise `--by patient` is dropped from this change.

## Open Questions

- Whether a successful cancel with `SDF=1` visibly reopens the request on dev. There is no verified request-status read RPC, so the spike confirms what it can (appointment status in `SDES GET APPTS BY PATIENT DFN3`) and notes the rest.
