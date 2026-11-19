# Design

## Context

`regular` and `osm` share `src/scenarios/singleClinic.js`. It resolves the clinic and its length (`resolveClinic`, `slotDuration`), reads `SDEC APPSLOTS` for a window (`getSlotBlocks`), builds candidate starts (`candidateSlots`, which merges contiguous open rows and steps by the smaller of length and row size), and `bookAppointment` tries candidates in order. `SDEC APPADD` already receives start, end, and length (`buildAppaddParams`).

## Goals / Non-Goals

**Goals:**
- Pick the start and the length for `regular`, with checks before any write.

**Non-Goals:**
- No overbooking, no past times, no changes to `osm`, `osmxgroup`, or `osmancillary` (their date rules are what define them).
- No changing the clinic's configured length in VistA.

## Decisions

### D1. One combined option for start
`--at "<date>@<time>"` in site time. A single value avoids half-specified date/time pairs. A date alone is not accepted; use `--length` or no options to search for the next slot.

### D1a. VistA-style parsing
Add `parseVistaDateTime(text, { today, tz })` to `src/dates.js`, returning `{ day, hhmm }` or a descriptive error. Date forms: `M/D/YYYY`, `M/D/YY`, `T`, `T+N`, `T-N`, plus ISO `YYYY-MM-DD`. Time forms: `H:MM`/`HH:MM` (24-hour) and 12-hour with `AM`/`PM`. Split on the first `@`. Whitespace is trimmed and case is ignored. Calendar validity is checked with a round trip through the existing date helpers, so `2/30/2027` fails. `today` is computed in `APPT_TZ` by the existing `today(ctx)` logic, so an EC2 host in UTC resolves `T` to the site's date. FileMan input such as `NOW`, `T@NOON`, `3D`, or `JAN 1 2027` is not supported; the error message lists the supported forms instead.

The parser is shared code. `--from` and `--to` on the patient-appointments, availability, and cancel-availability commands use its date-only form (`parseVistaDate`) so the same `T`, `T+N`, and slash dates work there. A time part on those options is rejected. Existing ISO values keep working, and `--days`/`--months` are unchanged.

### D2. Reuse candidate generation
With a custom length, call `candidateSlots(blocks, length, ...)` as today; the merged runs already guarantee the whole span is open. With `--at`, fetch blocks for that day only and keep the candidate whose start equals the requested time. No candidate means "not bookable". This avoids a second availability code path.

### D3. Failure output
When no candidate matches, run the normal search from the requested day forward and print up to five nearest starts for the same length, then exit 1 without creating anything.

### D4. Booking
The chosen candidate goes through the existing `bookAppointment` with a candidate list of one (for `--at`) or the full list (length only), so roll-back and error handling stay as they are.

### D5. Scope of options
The options are accepted by `regular` only. Using them with another scenario is a usage error (exit 2). The `appt-datetime-options` spec does not change the other scenarios.

## Risks / Trade-offs

- [The clinic may enforce its own length or slot-boundary rules in `SDEC APPADD`] → a spike books custom lengths (shorter, longer, not a multiple of the increment) on dev and records which VistA accepts; unsupported lengths are rejected up front with VistA's reason.
- [Time zone mistakes] → input is always site time; the output prints the start with its zone, and tests cover a UTC host.

## Open Questions

- Whether `--at` should also work for `osm` (it would then need to respect the 60-day rules).
- Whether lengths that do not match the clinic increment should be rejected by the tool or left to VistA.
