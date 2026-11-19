# Tasks

## 1. Spike: SDEC APPDEL options on dev

- [ ] 1.1 Create throwaway appointments with `appts regular --dfn <dfn>` and call `SDEC APPDEL` directly (a small probe script like `testlib/probe-cleanup.js`) with: default (`C`, SDF `1`, no reason), `PC`, `SDF=2`, a note, and a cancellation-reason IEN. Record in `cli/docs/rpc-notes.md` each reply, the resulting status in `appts --dfn <dfn>`, and the replies for an unknown appointment IEN and an already-cancelled appointment. Verify the notes state which combinations succeed and whether `PC` works without NEWPID.

## 2. Command, settings, and validation

- [ ] 2.1 Add the `cancel` command and options (`--appt`, `--by`, `--no-reopen`, `--reason-ien`, `--note`) to `src/settings.js` and `src/cli.js`, with validation before any connection (numeric IEN required, `--by` values, numeric reason, single-line note, `--appt` required even when `--dfn`/`--from`/`--to`/`--months` are given). Verify with unit tests for every valid and invalid combination, all failing before connecting.
- [ ] 2.2 Extend `buildAppdelParams` with optional type, reason IEN, note, and SDF while keeping the clean-up defaults. Verify with tests that the existing clean-up parameters are unchanged and that each option lands in the right position.

## 3. Handler and output

- [ ] 3.1 Implement the cancel handler in `src/scenarios` (default reopen = SDF `1`, `--no-reopen` = `2`, `C`/`PC`, optional reason and note) returning `{ appointmentIen, cancelType, reopened, reasonIen, note }`, surfacing VistA's error text as a failure. Verify with fake-VistA tests: default sends `[ien,'C','', 'appts cancel','',duz,'','1']`, `--no-reopen` sends SDF `2`, `--by patient` sends `PC`, reason and note are passed, and a VistA error exits 1 without reporting success.
- [ ] 3.2 Implement `--dry-run` (no connection, no credentials, prints what would be sent) and the human and `--json` output. Verify with CLI tests that dry run makes no RPC calls, that `--json` prints one valid object with the five fields, and that prod and a production server (broker test) block the command.

## 4. Docs, dev check, and release

- [ ] 4.1 Add `appts cancel` to the help text (usage line and options) and to `cli/README.md` with examples, the reopen default, and the one-IEN-per-run rule. Verify with the help test and a search that the README example commands match `--help`.
- [ ] 4.2 Run it on dev: create an appointment, find its IEN with `appts --dfn`, `appts cancel --appt <ien> --dry-run`, then cancel it and confirm the status in `appts --dfn`; try an unknown IEN. Verify the results match the spike notes. Record them below.
- [ ] 4.3 Run the full test suite and `openspec validate add-appt-cancel-command --strict`, then rebuild with `cli/scripts/build-package.ps1`. Verify `cli/dist/` has the six expected files and the packaged `--help` lists `cancel` (uploading is the user's step).
