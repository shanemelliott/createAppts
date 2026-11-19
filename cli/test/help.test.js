import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP, main } from '../src/cli.js';

function sink() {
  let text = '';
  return { write: (s) => { text += s; return true; }, get text() { return text; } };
}

test('help names the command appts and lists every command and the new options', () => {
  for (const usage of ['appts <scenario>', 'appts --dfn <dfn>', 'appts availability', 'appts cancel-availability', 'appts --check', 'appts --help']) {
    assert.ok(HELP.includes(usage), usage);
  }
  for (const word of ['regular', 'osm', 'osmxgroup', 'osmancillary', '--months', '--page-size', '--from', '--to', 'APPT_DFN']) {
    assert.ok(HELP.includes(word), word);
  }
  assert.ok(!HELP.split('\n').some((line) => /^\s*appt-scenario\b/.test(line)), 'no usage line starts with appt-scenario');
  assert.ok(!/appt-scenario\s+[<-]/.test(HELP), 'no appt-scenario <...> usage');
  assert.equal(HELP.match(/appt-scenario/g).length, 1, 'the node form is named exactly once');
  assert.match(HELP, /node appt-cli\/bin\/appt-scenario\.js <same arguments>/);
});

test('--help prints it without contacting VistA, even with a default patient', async () => {
  const stdout = sink();
  const code = await main({ argv: ['--help'], env: { APPT_DFN: '1' }, stdout, stderr: sink(), connect: async () => { throw new Error('must not connect'); } });
  assert.equal(code, 0);
  assert.equal(stdout.text, HELP);
});

test('error hints point to appts --help', async () => {
  const badOption = sink();
  assert.equal(await main({ argv: ['--bogus'], env: {}, stdout: sink(), stderr: badOption }), 2);
  assert.match(badOption.text, /Run "appts --help" for usage\./);

  const badScenario = sink();
  assert.equal(await main({ argv: ['nope'], env: {}, stdout: sink(), stderr: badScenario }), 2);
  assert.match(badScenario.text, /Unknown scenario "nope"/);
  assert.match(badScenario.text, /availability/);
  assert.match(badScenario.text, /Run "appts --help" for usage\./);
  assert.doesNotMatch(badScenario.text, /appt-scenario/);
});
