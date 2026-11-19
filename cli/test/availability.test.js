import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { main } from '../src/cli.js';
import { fromIso, toIso } from '../src/dates.js';
import { CHUNK_DAYS, chunkRange, groupDays } from '../src/queries/availability.js';
import { LEGEND, buildGrid, printAvailabilityGrid } from '../src/render/availabilityGrid.js';
import { parseAppSlots } from '../src/vista/scheduling.js';
import { NOW, fakeVista, isoPlus } from '../testlib/fakeVista.js';

const dir = mkdtempSync(path.join(os.tmpdir(), 'appt-avail-'));
const emptyEnv = path.join(dir, 'empty.env');
writeFileSync(emptyEnv, '');
const creds = { VISTA_HOST: 'vista.example.com', VISTA_ACCESS_CODE: 'ac', VISTA_VERIFY_CODE: 'vc' };

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`;

// Same shape as the dev CARDIOLOGY reply: 15-minute rows 07:00-15:00 with 10 open each ("j"), then a blank-code remainder row.
function devDay(iso, code = 'j') {
  const rows = [];
  for (let t = 7 * 60; t < 15 * 60; t += 15) rows.push({ iso, start: hhmm(t), end: hhmm(t + 15), code });
  rows.push({ iso, start: '1500', end: '1800', code: '' });
  return rows;
}

const devDays = (from, count) => Array.from({ length: count }, (_, i) => devDay(isoPlus(from + i))).flat();

function sink(isTTY) {
  let text = '';
  return { isTTY, write: (s) => { text += s; return true; }, get text() { return text; } };
}

async function run(argv, { env = creds, rpc = fakeVista(), ...opts } = {}) {
  const stdout = sink(opts.interactive);
  const stderr = sink();
  let connected = 0;
  const connect = async () => {
    connected += 1;
    return Object.assign(rpc, { user: { duz: '520', name: 'TESTER,ONE', division: 'CAMP MASTER' }, close: async () => {} });
  };
  const code = await main({ argv: [...argv, '--env-file', emptyEnv], env, cwd: dir, stdout, stderr, stdin: { isTTY: opts.interactive }, connect, now: NOW, ...opts });
  return { code, stdout: stdout.text, stderr: stderr.text, connected, rpc };
}

const daysFromRaw = (raw) => groupDays(parseAppSlots(raw));
// A typed Return moves a terminal to a new line; the test sink does not, so count headers by content.
const headers = (text) => (text.match(/TIME {3}\|/g) || []).length;

describe('availability: chunking and grouping', () => {
  test('long ranges are split into consecutive windows with no gap or overlap', () => {
    const chunks = chunkRange(fromIso('2026-11-17'), fromIso('2027-02-14')); // 90 days
    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks.map((c) => [toIso(c.from), toIso(c.to)]), [
      ['2026-11-17', '2026-12-17'],
      ['2026-12-18', '2027-01-17'],
      ['2027-01-18', '2027-02-14']
    ]);
    assert.equal(chunkRange(fromIso('2026-11-17'), fromIso('2026-11-17')).length, 1);
    assert.equal(chunkRange(fromIso('2026-11-17'), fromIso('2026-12-17')).length, 1); // exactly CHUNK_DAYS days
    assert.equal(chunkRange(fromIso('2026-11-17'), fromIso('2026-12-18')).length, 2);
    assert.equal(CHUNK_DAYS, 31);
  });

  test('days with only blank rows (no pattern) are dropped; open slots are summed', () => {
    const blocks = parseAppSlots(
      'T00030DATE^T00030START_TIME^T00030END_TIME^I00010AVAILABILITY\u001e3261118^0700^0715^j\u001e3261118^0715^0730^3\u001e3261118^1500^1800^\u001e'
      + '3261119^0700^1800^\u001e'
    );
    const days = groupDays(blocks);
    assert.deepEqual(days.map((d) => d.date), ['2026-11-18']);
    assert.equal(days[0].openSlots, 13);
    assert.equal(days[0].blocks.length, 3);
  });
});

describe('availability: grid', () => {
  const sample = groupDays(parseAppSlots(
    `T00030DATE^T00030START_TIME^T00030END_TIME^I00010AVAILABILITY${devDay(isoPlus(1)).map((r) => `\u001e3261118^${r.start}^${r.end}^${r.code}`).join('')}\u001e`
  ));

  test('VistA-style hour columns, bracketed per-increment codes, blank remainder row ignored', () => {
    const { pages } = buildGrid(sample);
    assert.equal(pages.length, 1);
    const [timeLine, dateLine, month, row] = pages[0];
    assert.equal(timeLine, `TIME   ${['7', '8', '9', '10', '11', '12', '1', '2'].map((h) => `|${h.padEnd(7)}`).join('')}`);
    assert.equal(dateLine, `DATE   ${'|       '.repeat(8)}`);
    assert.equal(month, '-- NOV 2026 --');
    assert.equal(row, `WE 18  ${'|[jjjj] '.repeat(8)}`.trimEnd());
  });

  test('blank hours stay blank and mixed codes keep time order', () => {
    const days = groupDays(parseAppSlots(
      'T00030DATE^T00030START_TIME^T00030END_TIME^I00010AVAILABILITY\u001e3261118^0800^0900^1\u001e3261118^1100^1200^A\u001e3261118^1130^1200^*\u001e'
    ));
    const row = buildGrid(days).pages[0][3];
    assert.equal(row, 'WE 18  |[1]    |       |       |[A*]');
    assert.equal(buildGrid(days).pages[0][0], 'TIME   |8      |9      |10     |11     ');
  });

  test('a range spanning two months gets a heading for each month', () => {
    const days = daysFromRaw(
      `T00030DATE^T00030START_TIME^T00030END_TIME^I00010AVAILABILITY\u001e3261130^0800^0900^2\u001e3261201^0800^0900^2\u001e3261202^0800^0900^2\u001e`
    );
    const lines = buildGrid(days).pages[0];
    assert.deepEqual(lines.filter((l) => l.startsWith('--')), ['-- NOV 2026 --', '-- DEC 2026 --']);
    assert.ok(lines.some((l) => l.startsWith('MO 30')));
    assert.ok(lines.some((l) => l.startsWith('TU  1')));
  });

  test('finer slot increments widen every column without losing alignment', () => {
    const rows = Array.from({ length: 12 }, (_, i) => `\u001e3261118^09${String(i * 5).padStart(2, '0')}^09${String(i * 5 + 5).padStart(2, '0')}^j`.replace('0960', '1000')).join('');
    const days = daysFromRaw(`T00030DATE^T00030START_TIME^T00030END_TIME^I00010AVAILABILITY${rows}\u001e3261118^1000^1100^2\u001e`);
    const [timeLine, dateLine, , row] = buildGrid(days).pages[0];
    const bars = (line) => [...line].flatMap((c, i) => (c === '|' ? [i] : []));
    assert.match(row, /\[jjjjjjjjjjjj\]/);
    assert.deepEqual(bars(row), bars(timeLine));
    assert.deepEqual(bars(dateLine), bars(timeLine));
  });

  test('pages repeat the header and the month heading when a page starts mid-month', () => {
    const raw = `T00030DATE^T00030START_TIME^T00030END_TIME^I00010AVAILABILITY${[28, 29, 30].map((d) => `\u001e32611${d}^0800^0900^2`).join('')}\u001e3261201^0800^0900^2\u001e3261202^0800^0900^2\u001e`;
    const { pages, rowCount } = buildGrid(daysFromRaw(raw), { pageSize: 2 });
    assert.equal(rowCount, 5);
    assert.equal(pages.length, 3);
    for (const page of pages) assert.ok(page[0].startsWith('TIME'));
    assert.equal(pages[1][2], '-- NOV 2026 --');
    assert.equal(pages[1].filter((l) => l.startsWith('--')).length, 2);
    assert.equal(pages[2][2], '-- DEC 2026 --');
    assert.equal(pages[2].filter((l) => l.startsWith('--')).length, 1);
  });
});

describe('availability: paging', () => {
  const dayList = Array.from({ length: 25 }, (_, i) => ({
    date: isoPlus(i),
    openSlots: 1,
    blocks: [{ start: '0800', end: '0900', code: '1', open: 1 }]
  }));

  test('Return advances through the pages, then the legend is printed once', async () => {
    let out = '';
    const answers = ['', ''];
    await printAvailabilityGrid({ write: (t) => { out += t; }, days: dayList, pageSize: 10, interactive: true, readLine: async () => answers.shift() ?? null });
    assert.equal(out.split('PRESS RETURN TO CONTINUE OR ^ TO QUIT').length - 1, 2);
    assert.equal(headers(out), 3);
    assert.equal(out.split('FOR CLINIC AVAILABILITY PATTERNS:').length - 1, 1);
    assert.ok(out.trimEnd().endsWith(LEGEND.at(-1)));
  });

  test('^ quits at once and still prints the legend', async () => {
    let out = '';
    await printAvailabilityGrid({ write: (t) => { out += t; }, days: dayList, pageSize: 10, interactive: true, readLine: async () => '^' });
    assert.equal(headers(out), 1);
    assert.match(out, /FOR CLINIC AVAILABILITY PATTERNS/);
  });

  test('end of input stops cleanly', async () => {
    let out = '';
    await printAvailabilityGrid({ write: (t) => { out += t; }, days: dayList, pageSize: 10, interactive: true, readLine: async () => null });
    assert.equal(headers(out), 1);
    assert.match(out, /FOR CLINIC AVAILABILITY PATTERNS/);
  });

  test('not interactive: one header, no prompt, readLine never used', async () => {
    let out = '';
    await printAvailabilityGrid({ write: (t) => { out += t; }, days: dayList, pageSize: 10, interactive: false, readLine: async () => { throw new Error('must not read'); } });
    assert.equal(headers(out), 1);
    assert.doesNotMatch(out, /PRESS RETURN/);
  });
});

describe('availability: command line', () => {
  const slots = (resource, from, count) => ({ [resource]: devDays(from, count) });

  test('default: clinic 195, today through 60 days, read-only RPCs, one header, legend', async () => {
    const rpc = fakeVista({ slots: slots('1195', 0, 3) });
    const r = await run(['availability'], { rpc });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /\[SQA\] availability: clinic 195 CARDIOLOGY, 2026-11-17 \.\. 2027-01-16 @ vista\.example\.com:9094 as TESTER,ONE \(520\)/);
    assert.equal(r.stdout.split('\n').filter((l) => l.startsWith('TIME')).length, 1);
    assert.match(r.stdout, /TU 17 /);
    assert.match(r.stdout, /FOR CLINIC AVAILABILITY PATTERNS:/);
    assert.doesNotMatch(r.stdout, /PRESS RETURN/);
    assert.match(r.stdout, /960 open slot\(s\) on 3 day\(s\)/);
    const names = new Set(rpc.calls.map((c) => c.name));
    for (const n of names) assert.ok(['SDEC RESCE', 'SDES GET CLINIC INFO2', 'SDEC APPSLOTS'].includes(n), `unexpected RPC ${n}`);
    const appslots = rpc.named('SDEC APPSLOTS');
    assert.deepEqual(appslots.map((c) => c.params), [['1195', '2026-11-17', '2026-12-17'], ['1195', '2026-12-18', '2027-01-16']]);
  });

  test('a 90-day range is fetched in 3 calls and every day appears exactly once, in order', async () => {
    const rpc = fakeVista({ slots: slots('1195', 0, 90) });
    const r = await run(['availability', '--from', '2026-11-17', '--to', '2027-02-14', '--json'], { rpc });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(rpc.named('SDEC APPSLOTS').length, 3);
    const out = JSON.parse(r.stdout);
    assert.equal(out.days.length, 90);
    assert.equal(new Set(out.days.map((d) => d.date)).size, 90);
    assert.deepEqual(out.days.map((d) => d.date), [...out.days.map((d) => d.date)].sort());
    assert.equal(out.days[0].date, '2026-11-17');
    assert.equal(out.days.at(-1).date, '2027-02-14');
    assert.equal(out.totalOpenSlots, 90 * 320);
  });

  test('--json: one object, clinic, range, and day entries with blocks; no write RPC', async () => {
    const rpc = fakeVista({ slots: slots('1478', 1, 2) });
    const r = await run(['availability', '--clinic', '478', '--days', '10', '--json'], { rpc });
    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, true);
    assert.equal(out.clinicIen, '478');
    assert.equal(out.clinicName, 'DEV/ENDOCRINE/5');
    assert.deepEqual([out.from, out.to], ['2026-11-17', '2026-11-27']);
    assert.deepEqual(out.days.map((d) => d.date), [isoPlus(1), isoPlus(2)]);
    assert.deepEqual(Object.keys(out.days[0]).sort(), ['blocks', 'date', 'openSlots']);
    assert.deepEqual(out.days[0].blocks[0], { start: '0700', end: '0715', code: 'j', open: 10 });
    for (const call of rpc.calls) assert.doesNotMatch(call.name, /ARSET|APPADD|APPDEL|ARCLOSE|CANCEL/);
  });

  test('no availability: says so, exits 0, prints no grid or legend', async () => {
    const r = await run(['availability', '--days', '5']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /No availability found for clinic 195 between 2026-11-17 and 2026-11-22/);
    assert.doesNotMatch(r.stdout, /TIME|FOR CLINIC AVAILABILITY/);
  });

  test('an unknown clinic fails', async () => {
    const r = await run(['availability', '--clinic', '999']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Clinic 999 has no scheduling resource/);
  });

  test('conflicting or incomplete range options fail before connecting', async () => {
    for (const args of [['--days', '5', '--from', '2026-11-20', '--to', '2026-11-25'], ['--from', '2026-11-20'], ['--to', '2026-11-20'], ['--from', '2026-11-25', '--to', '2026-11-20'], ['--days', 'x'], ['--page-size', '-1']]) {
      const r = await run(['availability', ...args]);
      assert.equal(r.code, 2, args.join(' '));
      assert.equal(r.connected, 0, args.join(' '));
    }
  });

  test('production is blocked before connecting', async () => {
    const r = await run(['availability', '--env', 'prod']);
    assert.equal(r.code, 2);
    assert.equal(r.connected, 0);
  });

  test('in a terminal the grid pauses every 10 rows; Return continues and ^ quits', async () => {
    const rpc = fakeVista({ slots: slots('1195', 0, 25) });
    const answers = ['', ''];
    const full = await run(['availability', '--days', '30'], { rpc, interactive: true, readLine: async () => answers.shift() ?? null });
    assert.equal(full.stdout.split('PRESS RETURN TO CONTINUE OR ^ TO QUIT').length - 1, 2);
    assert.equal(headers(full.stdout), 3);
    assert.match(full.stdout, /25 day\(s\)/);

    let reads = 0;
    const quit = await run(['availability', '--days', '30'], { rpc: fakeVista({ slots: slots('1195', 0, 25) }), interactive: true, readLine: async () => { reads += 1; return '^'; } });
    assert.equal(reads, 1);
    assert.equal(headers(quit.stdout), 1);
    assert.match(quit.stdout, /FOR CLINIC AVAILABILITY PATTERNS/);
    assert.equal(quit.code, 0);
  });

  test('--page-size changes the page length; 0 and --json never pause', async () => {
    const small = await run(['availability', '--days', '30', '--page-size', '5'], { rpc: fakeVista({ slots: slots('1195', 0, 12) }), interactive: true, readLine: async () => '' });
    assert.equal(headers(small.stdout), 3);

    const never = async () => { throw new Error('must not read'); };
    const off = await run(['availability', '--days', '30', '--page-size', '0'], { rpc: fakeVista({ slots: slots('1195', 0, 25) }), interactive: true, readLine: never });
    assert.equal(off.code, 0, off.stderr);
    assert.doesNotMatch(off.stdout, /PRESS RETURN/);
    assert.equal(headers(off.stdout), 1);

    const json = await run(['availability', '--days', '30', '--json'], { rpc: fakeVista({ slots: slots('1195', 0, 25) }), interactive: true, readLine: never });
    assert.equal(json.code, 0, json.stderr);
    assert.doesNotThrow(() => JSON.parse(json.stdout));
  });

  test('piped output never pauses even with many rows', async () => {
    const r = await run(['availability', '--days', '30'], { rpc: fakeVista({ slots: slots('1195', 0, 25) }), readLine: async () => { throw new Error('must not read'); } });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(headers(r.stdout), 1);
  });
});


test('availability --from T --to T+30 queries the expected days', async () => {
  const rpc = fakeVista({ slots: { 1195: devDays(0, 3) } });
  const r = await run(['availability', '--from', 'T', '--to', 'T+30', '--json'], { rpc });
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.from, '2026-11-17');
  assert.equal(out.to, '2026-12-17');
  assert.deepEqual(rpc.named('SDEC APPSLOTS').map((c) => c.params), [['1195', '2026-11-17', '2026-12-17']]);
});

test('a time part in --from fails before connecting', async () => {
  const r = await run(['availability', '--from', 'T@9:30', '--to', 'T+1']);
  assert.equal(r.code, 2);
  assert.equal(r.connected, 0);
  assert.match(r.stderr, /--from takes a date only/);
});
