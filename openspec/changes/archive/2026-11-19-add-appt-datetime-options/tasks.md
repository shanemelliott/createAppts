# Tasks

## 1. Spike: length and time rules in VistA

- [x] 1.1 On dev, book `SDEC APPADD` directly for a test patient with a shorter, longer, and non-increment length and with a start inside an open run. Record in `cli/docs/rpc-notes.md` which are accepted and VistA's replies for the rest. Verify with `appts --dfn <dfn>` that each accepted booking shows the expected start, and cancel or clean up the test appointments.

## 2. Options and validation

- [x] 2.1 Add `parseVistaDateTime` to `src/dates.js` (slash dates with 2- and 4-digit years, `T`, `T+N`, `T-N`, ISO, 24-hour and AM/PM times, `@` separator, calendar validation, `T` in `APPT_TZ`). Verify with unit tests for every accepted form, including `1/1/2027@9:30`, `T@9:30`, `T+1@14:00`, `1/4/2027@2:30 PM`, impossible dates and times, a missing date or time, and a UTC host where site and host dates differ.
- [x] 2.2 Add `--at` and `--length` to `src/settings.js` and `src/cli.js`, validated before connecting (parsed value, future time, positive integer, `regular` only), with error text listing the accepted formats. Verify with unit tests for each valid and invalid case.

- [x] 2.3 Add a date-only `parseVistaDate` and use it for `--from`/`--to` in the patient-appointments, `availability`, and `cancel-availability` commands (`src/settings.js`), rejecting a time part and keeping ISO values, `--days` and `--months` working. Verify with unit tests for `T`, `T+30`, slash dates, ISO, a rejected `T@9:30`, and `--to` before `--from` after resolving, plus a CLI test that `availability --from T --to T+30` queries the expected days.

## 3. Slot selection and booking

- [x] 3.1 In `singleClinic.js` and `scheduling.js`, use the custom length for candidates and, for `--at`, narrow to the matching candidate. Verify with fake-VistA tests: exact time booked, length-only books the earliest fit, and no options behaves as before.
- [x] 3.2 Report a non-bookable time by listing up to five nearest starts and exiting 1 without writes. Verify with fake-VistA tests that no `ARSET`/`APPADD` calls are made.
- [x] 3.3 Add `--dry-run` output for these options and show start, end, and length in the normal and `--json` output. Verify with CLI tests that dry run makes no connection and that `--json` includes the new fields.

## 4. Docs and release

- [x] 4.1 Update help text and `cli/README.md` (regular section, examples). Verify the README examples match `--help`.
- [x] 4.2 Run on dev: book at a chosen time and length, try a closed time, and confirm with `appts --dfn`. Record the results.
- [x] 4.3 Run the full test suite, `openspec validate add-appt-datetime-options --strict`, and rebuild `cli/dist/`. Verify the six release files exist and the packaged `--help` lists the options.
