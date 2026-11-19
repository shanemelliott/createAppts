# Tasks

## 1. Spike: confirm the appointments RPC on dev

- [x] 1.1 Write `cli/testlib/probe-patient-appts.js` that signs on and calls `SDES GET APPTS BY PATIENT DFN3` for a dev patient with appointments (for example DFN 100791 or 100126) for a range that includes past and future dates. Record in `cli/docs/rpc-notes.md` the exact parameters, that the call works under `CDSP RPC CONTEXT` (or the fallback context that is needed), the reply shape and field names, how cancelled and no-show appointments appear, and one anonymized sample. Verify the sample includes a cancelled appointment (cancel one created by `appts regular` if needed).

## 2. Patient appointments listing

- [x] 2.1 Add `--months` and the routing rule in `src/settings.js` and `src/cli.js`: with no scenario, `--help` and `--check` absent, a listing flag (`--dfn`, `--from`, `--to`, `--months`) or a resolved `APPT_DFN` selects the listing; otherwise bare `appts` prints help; the patient comes from `--dfn` or `APPT_DFN` and is an error if neither. Verify with unit tests for each routing case (including bare `appts` with and without `APPT_DFN`, and `--help` winning), `--months` and range validation (bad dates, `--from` after `--to`, non-positive months), all failing before any connection.
- [x] 2.2 Implement `src/queries/patientAppointments.js`: request with offset-aware `T00:00`/`T23:59` bounds, tolerant reply extraction, normalization to `{ dateTime, clinic, status, ien, scheduledBy, cancelledBy }`, newest-first sort, default today..+4 months. Verify with fake-VistA tests built from the recorded sample: all statuses listed, sort order, empty result, RPC error exits non-zero, and a DST-boundary range sends the right offsets.
- [x] 2.3 Add the table renderer and `--json` envelope for the listing (including the patient DFN, the range searched, and the empty-result message). Verify with a CLI test that human output contains each row's date, clinic, status and IEN, that `--json` prints exactly one valid JSON object, and that prod is blocked before connecting.
- [x] 2.4 Document `appts --dfn N` and bare `appts` with `APPT_DFN` set (options, defaults, example output, and that a default patient makes plain `appts` run the lookup) in `cli/README.md`. Verify the documented commands run as written against dev.

## 3. Clinic availability display

- [x] 3.1 Add the `availability` command routing and settings (`--clinic`/`APPT_CLINIC`, `--from`/`--to` or `--days`, default today..+60, `--page-size`, conflicting-option errors) in `src/settings.js` and `src/cli.js`. Verify with unit tests for the defaults, each override, and every invalid combination failing before any connection.
- [x] 3.2 Implement `src/queries/availability.js`: resolve the clinic, fetch `SDEC APPSLOTS` in chunks of at most 31 days, merge and group blocks by day. Verify with fake-VistA tests that a 90-day range makes 3 calls with no missing or duplicate day, an unknown clinic fails, and days with no pattern are omitted.
- [x] 3.3 Implement `src/render/availabilityGrid.js`: hour columns on a 12-hour clock from the earliest start to the latest end, bracketed per-increment codes per hour, blank empty hours, `WE 18`-style row labels, month headings, column widening, and the VistA legend. Verify with snapshot-style tests: a fixture built from the dev 15-minute sample renders `[jjjj]` cells and aligned columns, a range spanning two months gets two headings, and finer increments widen the columns without misalignment.
- [x] 3.4 Add paging: pages of `--page-size` day rows (default 10, `0` off), header repeated per page, month heading repeated when a page starts mid-month, `PRESS RETURN TO CONTINUE OR ^ TO QUIT` between pages, legend after the last page or on quit, and no pausing unless stdin and stdout are terminals and `--json` is off. Verify with tests that feed an injected reader and fake terminal flags: Return advances, `^` quits and still prints the legend, piped output and `--page-size 0` never read input, and end of input stops cleanly.
- [x] 3.5 Add the `--json` output for availability. Verify with a CLI test that `--json` prints one valid object with a day entry per date that has availability, and that no write RPC is ever called.
- [x] 3.6 Document `appts availability` (options, defaults, paging, a sample grid, the legend) in `cli/README.md`. Verify against dev by comparing the grid to the web tool's open-slots view for clinic 195 for the same dates, and by paging through a 60-day grid in a real terminal.

## 4. Help text and command name

- [x] 4.1 Rewrite the help text, usage lines, `Run "... --help"` hints, and unknown-scenario messages in `src/cli.js` and `src/settings.js` to say `appts`; list every scenario, `cancel-availability`, `availability`, the patient listing (`appts --dfn <dfn>`) and the new options (`--months`, `--page-size`); add one line naming `node appt-cli/bin/appt-scenario.js` as the same command when `appts` is not installed. Update the tests that assert the old text. Verify with a test that `--help` output contains no `appt-scenario <`-style usage line and does contain each command, and that the error hints point to `appts --help`.
- [x] 4.2 Replace `appt-scenario` with `appts` in the user-facing examples in `cli/README.md` and the installer messages (the `node ...appt-scenario.js` form stays where it names the script). Verify with a search that no usage example still starts with `appt-scenario`, and that the installer tests still pass.

## 5. Release

- [x] 5.1 Run the full test suite and `openspec validate add-appt-query-commands --strict`, then run both commands on dev (a patient with appointments, clinics 195 and 478). Verify results match what VistA shows for the same patient and clinic. Record the outcome in the resume notes below.
- [x] 5.2 Rebuild the release files with `cli/scripts/build-package.ps1` and confirm both commands are in the packaged `--help`. Verify `cli/dist/` contains the six expected files (uploading to downloads.example.com is done by the user).

## Results (2026-11-18)

- Tests: 133 total in `cli/` (132 pass, 1 skipped on Windows); the packaged copy runs 107 pass.
- Dev: `appts --dfn 100126` shows the cancelled appointment 65457 (status CANCELLED BY CLINIC, cancelled by TESTER,ONE); `--dfn 100791` shows 65491; an unknown DFN fails with "Invalid Patient ID."; plain `appts` with `APPT_DFN=100126` lists the same patient.
- Dev: `appts availability --clinic 195` matches the raw APPSLOTS reply, including the booked 14:15 appointment (`[j99j]` in the 2 o'clock cell); clinic 478 shows `[X]` cells for its cancelled days; paging checked in a real terminal (Return continues, `^` quits and prints the legend).
- Not exercised: appointments dated before today (the dev test patients only have appointments from today forward); the RPC takes any range.
- The release files in `cli/dist/` are rebuilt with both commands. Uploading them to downloads.example.com is the user's step (see the `add-appt-scenario-cli` resume notes).
