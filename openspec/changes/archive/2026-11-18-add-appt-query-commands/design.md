# Design

## Context

See proposal.md (Why) and the `add-appt-scenario-cli` change for the CLI this extends. Relevant existing pieces in `cli/`:

- `src/vista/scheduling.js` already has `resolveClinic` (SDEC RESCE plus clinic length), `getSlotBlocks`/`parseAppSlots` (SDEC APPSLOTS rows as `{ day, start, end, code, open }`), and `parseSdecRows`.
- `src/dates.js` has timezone-aware `todayIn`, `addDays`, `toIso`, `fromIso`, and `utcOffset`.
- `src/settings.js` owns command names, validation, defaults, and the dev/sqa guard; `src/cli.js` owns argument parsing, connection, output, and exit codes.
- `single-appointment-api/src/services/patientAppointmentService.js` shows the patient appointments RPC: `SDES GET APPTS BY PATIENT DFN3` with `[dfn, 'YYYY-MM-DDT00:00±HH:MM', 'YYYY-MM-DDT23:59±HH:MM']`, JSON reply, appointments array under one of several keys. Its web tab reads `AppointmentDateTime` (like `2026-11-11T08:15-0500`, offset without a colon), `Clinic`/`Resource`, `CurrentStatus`/`Status`, `AppointmentIEN`, `DataEntryClerk`/`SchedulerName`, `CancelledByUser`/`NoShowCancelledBy`.
- The VistA availability display the user supplied: a `TIME  |8      |9 ...` header, a `DATE  |` line, rows like `WE 18  |       |       |       [1]`, then the pattern legend.

## Goals / Non-Goals

**Goals:**
- Two read-only lookups that reuse the existing connection, settings, guard, and output conventions.
- An availability grid that reads like the VistA screen, built from the same `SDEC APPSLOTS` data the scenarios already use.

**Non-Goals:**
- No writes of any kind, no cancelling or booking from these commands.
- No paging prompt ("PRESS RETURN TO CONTINUE") for the appointments listing; only the availability grid is paged.
- No multi-clinic or multi-patient lookups.

## Decisions

### D1. Routing
Add two internal commands, `patient-appts` and `availability`. `availability` is typed by name. The patient listing has no name: `src/cli.js` selects it when no positional command is given, `--help` and `--check` are absent, and either one of `--dfn`, `--from`, `--to`, `--months` is present or `APPT_DFN` resolves to a value (flag, environment, or `.env`). Otherwise a bare `appts` prints help as before. `--help` always wins. A side effect to document: with `APPT_DFN` in `.env`, plain `appts` now queries VistA instead of showing help.
- *Alternative:* a named `list` command. Rejected by the user in favor of bare `appts --dfn N`.

### D2. Patient appointments
Call `SDES GET APPTS BY PATIENT DFN3` with start `<from>T00:00<offset>` and end `<to>T23:59<offset>`, offsets from `utcOffset` in `APPT_TZ`. Parse the JSON reply with the same tolerant extraction as the web tool (array, or the first array under `Appointments`, `appointments`, `Data`, `Results` and similar keys). Normalize each appointment to `{ dateTime, clinic, status, ien, scheduledBy, cancelledBy }` from the field names above, flattening object values by `Name`. Show `dateTime` as `YYYY-MM-DD HH:MM` in `APPT_TZ` (parse the colon-less offset, convert with `Intl`). Sort newest first. Default range: today through today plus 4 calendar months; `--months N` sets the end relative to the start.
- The listing shows all statuses; there is no status filter.
- Reply shape and the right RPC context are confirmed in the spike task before the parser is finalized.

### D3. Availability grid
- Resolve the clinic with `resolveClinic`, then fetch `SDEC APPSLOTS` for `[resourceIen, from, to]`. Chunk long ranges into consecutive windows of at most 31 days, concatenate the blocks, and sort by date and time, so every day appears once.
- Group blocks by day, then by hour of `start`. Each hour cell is `[` plus the codes of that hour's blocks in time order plus `]`. A blank code (non-bookable remainder rows such as `1500..1800`) is rendered as a space inside the cell only if the hour also has coded blocks; a row that is entirely blank and has no codes leaves the hour cell empty.
- Columns run from the earliest start hour to the latest end hour across the whole range, labeled on a 12-hour clock without am/pm (`7 8 9 10 11 12 1 2 3`). Column width is 7 characters, widened to fit the longest cell in the whole grid (finer increments than 15 minutes make longer cells) so the columns stay aligned.
- Row label: two-letter weekday plus day of month, such as `WE 18`, then `|` separators matching the VistA screen. Print a month heading (`-- NOV 2026 --`) before the first row of each month. Days with no rows in the reply are omitted.
- The legend after the grid is the VistA text from the supplied screen.
- `--json` prints `{ clinic, from, to, days: [{ date, openSlots, blocks: [...] }] }`.
- Default clinic comes from `APPT_CLINIC` (default `195`); range default today through today plus 60 days; `--days N` or `--from`/`--to` override; mixing them is a usage error.

### D3a. Paging
The renderer builds the grid as pages: a list of day rows split every `--page-size` rows (default 10, `0` = one page). Each page is the `TIME`/`DATE` header, a month heading if the first row of the page is not the first of its month, and the rows. Interactive paging happens only when `process.stdin.isTTY` and `process.stdout.isTTY` are true and `--json` is off; between pages it writes `PRESS RETURN TO CONTINUE OR ^ TO QUIT` and reads one line from stdin (`^` quits, anything else continues; end of input also stops). The legend is written after the last page or on quit. All other cases write every page back to back. The reader is injected so tests can feed it lines and a fake terminal flag.

### D4. Code layout
`cli/src/queries/patientAppointments.js` (RPC, normalize, sort), `cli/src/queries/availability.js` (chunking and day grouping), `cli/src/render/availabilityGrid.js` and `cli/src/render/appointmentsTable.js` (text output), wired through `src/scenarios/index.js`-style handlers. `src/output.js` gains the two renderers and `--json` envelopes. No new dependencies.

### D5. Testing
Extend `testlib/fakeVista.js` with a `SDES GET APPTS BY PATIENT DFN3` reply (recorded shape from the spike) and use the existing slot fixtures. Unit tests for date offsets, normalization, sorting, grid cell building, chunk boundaries (a 90-day range makes 3 calls and no duplicate or missing day), month headings, empty results, and the routing rules (`appts` alone, `appts --dfn`, `appts --months` with and without `APPT_DFN`).

### D6. Command name in help
The tool is installed as `appts` (the launcher) and also runnable as `node appt-cli/bin/appt-scenario.js`; the script cannot tell which was used, so all user-facing text says `appts` and the help adds one line naming the `node` form. The `HELP` text, `Run "... --help"` hints, and unknown-scenario messages in `src/cli.js` and `src/settings.js` change, along with the tests that assert them and the README examples. The `bin` name in `package.json` stays `appt-scenario`. Launchers already installed need no change.

## Risks / Trade-offs

- [A default `APPT_DFN` makes plain `appts` run a lookup] → It is read-only and prints the patient it used; document it in the README and help.
- [`CDSP RPC CONTEXT` may not include `SDES GET APPTS BY PATIENT DFN3`] → The spike calls it on dev first. If it is not authorized, create a second RPC context for this one call (`XWB CREATE CONTEXT SDECRPC`) or ask for the RPC to be added to the context; decide from the spike result.
- [The reply may use other key names than the web tool expects] → Keep the tolerant extraction, store the recorded sample in `docs/rpc-notes.md`, and show unreadable replies in the error text.
- [The grid can get wide with fine slot increments] → Widen columns to fit and keep alignment; `--json` is available for scripts.
- [Appointment times near a daylight-saving change] → Convert with `Intl` in `APPT_TZ` rather than the host zone; covered by a test.

## Open Questions

- Whether `SDES GET APPTS BY PATIENT DFN3` returns past appointments before today when `--from` is in the past (it should, as the web tool allows it). The spike will confirm.
