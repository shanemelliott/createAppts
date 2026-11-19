import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync
} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from '../src/settings.js';

const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = path.join(cliDir, 'scripts', 'build-package.ps1');
const isWin = process.platform === 'win32';
const fwd = (p) => p.replace(/\\/g, '/');

function canRun(cmd, args) {
  try {
    return spawnSync(cmd, args, { stdio: 'ignore', timeout: 20000 }).status === 0;
  } catch {
    return false;
  }
}

const PWSH = ['pwsh', 'powershell'].find((c) => canRun(c, ['-NoProfile', '-Command', 'exit 0']));
const HAS_SH = canRun('sh', ['-c', 'command -v curl && command -v tar && command -v awk && command -v mktemp']);
const WINPS = isWin && canRun('powershell', ['-NoProfile', '-Command', 'exit 0']);
const skipAll = !PWSH && 'PowerShell is needed to build the release package';
const skipSh = skipAll || (!HAS_SH && 'sh, curl, tar, awk or mktemp not available');
const skipPs = skipAll;

function run(cmd, args, { cwd, env = {}, detached = false } = {}) {
  return new Promise((resolve, reject) => {
    // Tests must never write the developer's real launcher (an existing one is refreshed on re-install), so the launcher folder defaults to scratch space.
    const childEnv = { ...process.env, APPT_CLI_NO_PROMPT: '1', APPT_CLI_BIN_DIR: scratch ? fwd(path.join(scratch, 'isolated-launcher-bin')) : '', ...env };
    // A PowerShell 7 PSModulePath breaks Windows PowerShell 5.1 (it cannot find Get-FileHash).
    if (cmd === 'powershell') delete childEnv.PSModulePath;
    const child = spawn(cmd, args, {
      cwd,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`timed out: ${cmd} ${args.join(' ')}\n${stdout}\n${stderr}`)); }, 90000);
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, out: stdout + stderr }); });
  });
}

function serve(root) {
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200).end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });
}

let scratch;
let dist;
const servers = {};
const urls = {};

before(async () => {
  if (skipAll) return;
  scratch = mkdtempSync(path.join(os.tmpdir(), 'appt-install-'));
  dist = path.join(scratch, 'dist');
  // A throwaway config keeps the real deployment values out of the tests and out of the result.
  const releaseConfig = path.join(scratch, 'release.json');
  writeFileSync(releaseConfig, JSON.stringify({ baseUrl: 'https://downloads.example.com/appt-cli/latest', vistaHost: 'vista.example.com' }));
  const build = await run(PWSH, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', buildScript, '-OutDir', dist], { env: { APPT_CLI_RELEASE_CONFIG: releaseConfig } });
  assert.equal(build.code, 0, build.out);

  const badSha = path.join(scratch, 'dist-bad-sha');
  cpSync(dist, badSha, { recursive: true });
  for (const f of readdirSync(badSha).filter((n) => n.endsWith('.sha256'))) {
    writeFileSync(path.join(badSha, f), `${'0'.repeat(64)}  ${f.replace('.sha256', '')}\n`);
  }
  const noSha = path.join(scratch, 'dist-no-sha');
  cpSync(dist, noSha, { recursive: true });
  for (const f of readdirSync(noSha).filter((n) => n.endsWith('.sha256'))) rmSync(path.join(noSha, f));

  for (const [name, root] of Object.entries({ good: dist, badSha, noSha })) {
    servers[name] = await serve(root);
    urls[name] = servers[name].url;
  }
});

after(() => {
  for (const s of Object.values(servers)) s.close();
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

function workDir() {
  const dir = mkdtempSync(path.join(scratch, 'work-'));
  return { dir, target: path.join(dir, 'appt-cli') };
}

function stubNode(version, kind) {
  const useCmd = isWin && kind === 'cmd';
  const file = path.join(scratch, useCmd ? `node-${version}.cmd` : `node-${version}`);
  writeFileSync(file, useCmd ? `@echo off\r\necho v${version}\r\n` : `#!/bin/sh\necho v${version}\n`, { mode: 0o755 });
  return kind === 'sh' ? fwd(file) : file;
}

const SECRET_AC = 'AC-123';
const SECRET_VC = 'p@$$\\n&x#"y';

// Shared assertions, parameterized by how an installer is launched.
function suite(label, install, { skip, posixModes, windowsAcl, stubKind, launcher }) {
  describe(label, { skip }, () => {
    test('fresh install without codes copies the sample and runs', { timeout: 120000 }, async () => {
      const { dir, target } = workDir();
      const r = await install(dir, { APPT_CLI_BASE_URL: urls.good });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Checksum OK/);
      assert.match(r.out, /Created .*\.env without codes/);
      assert.match(r.out, /appt-scenario\.js --check/);
      assert.equal(readFileSync(path.join(target, '.env'), 'utf8').replace(/\r/g, ''), readFileSync(path.join(target, '.env.sample'), 'utf8').replace(/\r/g, ''));
      assert.deepEqual(readdirSync(dir).filter((n) => n.startsWith('.appt-cli-install')), [], 'temp folder removed');
      for (const gone of ['scripts', 'install', 'node_modules']) assert.ok(!existsSync(path.join(target, gone)), gone);
      const help = await run(process.execPath, [path.join(target, 'bin', 'appt-scenario.js'), '--help'], { cwd: dir });
      assert.equal(help.code, 0, help.out);
      assert.match(help.stdout, /osmancillary/);
    });

    test('credentials from the environment are written verbatim, locked down, and never echoed', { timeout: 120000 }, async () => {
      const { dir, target } = workDir();
      const r = await install(dir, { APPT_CLI_BASE_URL: urls.good, VISTA_ACCESS_CODE: SECRET_AC, VISTA_VERIFY_CODE: SECRET_VC });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Wrote .*\.env \(readable only by you\)/);
      assert.ok(!r.out.includes(SECRET_AC) && !r.out.includes(SECRET_VC), 'codes must not appear in installer output');
      const vars = parseEnvFile(readFileSync(path.join(target, '.env'), 'utf8'));
      assert.equal(vars.VISTA_ACCESS_CODE, SECRET_AC);
      assert.equal(vars.VISTA_VERIFY_CODE, SECRET_VC);
      assert.equal(vars.VISTA_HOST, 'vista.example.com');
      if (posixModes && !isWin) assert.equal(statSync(path.join(target, '.env')).mode & 0o777, 0o600);
      if (windowsAcl && isWin) {
        const acl = spawnSync('icacls', [path.join(target, '.env')], { encoding: 'utf8' }).stdout;
        assert.ok(!/Everyone|BUILTIN\\Users|Authenticated Users/i.test(acl), acl);
        assert.ok(acl.toLowerCase().includes(os.userInfo().username.toLowerCase()), acl);
      }
    });

    test('re-running upgrades the program files and keeps .env without prompting', { timeout: 120000 }, async () => {
      const { dir, target } = workDir();
      await install(dir, { APPT_CLI_BASE_URL: urls.good, VISTA_ACCESS_CODE: SECRET_AC, VISTA_VERIFY_CODE: 'vc-1' });
      const envFile = path.join(target, '.env');
      writeFileSync(envFile, `${readFileSync(envFile, 'utf8')}APPT_CLINIC=532\n`);
      const before = readFileSync(envFile, 'utf8');
      const cliJs = path.join(target, 'src', 'cli.js');
      const original = readFileSync(cliJs, 'utf8');
      writeFileSync(cliJs, `${original}\n// tampered\n`);

      const r = await install(dir, { APPT_CLI_BASE_URL: urls.good });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Updated appt-cli/);
      assert.match(r.out, /Kept your existing/);
      assert.equal(readFileSync(envFile, 'utf8'), before);
      assert.equal(readFileSync(cliJs, 'utf8'), original);
    });

    test('checksum mismatch installs nothing and leaves an existing install untouched', { timeout: 120000 }, async () => {
      const fresh = workDir();
      const r1 = await install(fresh.dir, { APPT_CLI_BASE_URL: urls.badSha });
      assert.notEqual(r1.code, 0);
      assert.match(r1.out, /Checksum mismatch/);
      assert.ok(!existsSync(fresh.target));
      assert.deepEqual(readdirSync(fresh.dir), [], 'temp folder removed');

      const { dir, target } = workDir();
      await install(dir, { APPT_CLI_BASE_URL: urls.good });
      const cliJs = path.join(target, 'src', 'cli.js');
      writeFileSync(cliJs, '// existing install marker\n');
      const r2 = await install(dir, { APPT_CLI_BASE_URL: urls.badSha });
      assert.notEqual(r2.code, 0);
      assert.equal(readFileSync(cliJs, 'utf8'), '// existing install marker\n');
    });

    test('missing checksum file refuses to install', { timeout: 120000 }, async () => {
      const { dir, target } = workDir();
      const r = await install(dir, { APPT_CLI_BASE_URL: urls.noSha });
      assert.notEqual(r.code, 0);
      assert.match(r.out, /Checksum download failed/);
      assert.ok(!existsSync(target));
    });

    test('missing and too-old Node.js stop before downloading', { timeout: 120000 }, async () => {
      const missing = workDir();
      const r1 = await install(missing.dir, { APPT_CLI_BASE_URL: urls.good, APPT_CLI_NODE: 'no-such-node-binary' });
      assert.notEqual(r1.code, 0);
      assert.match(r1.out, /Node\.js 18\.3 or later is required but 'node' was not found/);
      assert.ok(!existsSync(missing.target));

      const old = workDir();
      const r2 = await install(old.dir, { APPT_CLI_BASE_URL: urls.good, APPT_CLI_NODE: stubNode('16.20.0', stubKind) });
      assert.notEqual(r2.code, 0);
      assert.match(r2.out, /found v16\.20\.0/);
      assert.ok(!existsSync(old.target));

      const edge = workDir();
      const r3 = await install(edge.dir, { APPT_CLI_BASE_URL: urls.good, APPT_CLI_NODE: stubNode('18.2.9', stubKind) });
      assert.notEqual(r3.code, 0, '18.2.9 is below the 18.3 minimum');

      const ok = workDir();
      const r4 = await install(ok.dir, { APPT_CLI_BASE_URL: urls.good, APPT_CLI_NODE: stubNode('18.3.0', stubKind) });
      assert.equal(r4.code, 0, r4.out);
    });

    test('the appts launcher is opt-in, runs the CLI, refreshes on upgrade, and never overwrites a foreign file', { skip: !launcher && 'launcher not supported on this platform', timeout: 120000 }, async () => {
      const { dir } = workDir();
      const binDir = path.join(dir, 'launcher-bin');
      const file = path.join(binDir, launcher?.file ?? 'appts');
      const env = { APPT_CLI_BASE_URL: urls.good, APPT_CLI_BIN_DIR: launcher.envPath(binDir) };

      const none = await install(dir, env);
      assert.equal(none.code, 0, none.out);
      assert.ok(!existsSync(file), 'no launcher unless asked for');
      assert.doesNotMatch(none.out, /appts/);

      const off = await install(dir, { ...env, APPT_CLI_LAUNCHER: '0' });
      assert.ok(!existsSync(file), 'APPT_CLI_LAUNCHER=0 skips it');
      assert.equal(off.code, 0, off.out);

      const made = await install(dir, { ...env, APPT_CLI_LAUNCHER: '1' });
      assert.equal(made.code, 0, made.out);
      assert.match(made.out, /Created the 'appts' command/);
      assert.match(made.out, /is not on your PATH/);
      assert.ok(existsSync(file));
      const body = readFileSync(file, 'utf8');
      assert.match(body, /appt-scenario launcher/);
      assert.match(body, /appt-cli[\\/]bin[\\/]appt-scenario\.js/);
      const help = await launcher.run(file, ['--help'], dir);
      assert.equal(help.code, 0, help.out);
      assert.match(help.stdout, /osmancillary/);

      writeFileSync(file, body.replace(/appt-cli/g, 'moved-away'));
      const refreshed = await install(dir, env);
      assert.match(refreshed.out, /Created the 'appts' command/);
      assert.equal(readFileSync(file, 'utf8'), body, 'existing launcher is refreshed without asking');

      writeFileSync(file, 'something else\n');
      const foreign = await install(dir, { ...env, APPT_CLI_LAUNCHER: '1' });
      assert.equal(foreign.code, 0, foreign.out);
      assert.match(foreign.out, /Left the existing .* alone/);
      assert.equal(readFileSync(file, 'utf8'), 'something else\n');
    });
  });
}

const sh = (dir, env, opts = {}) => run('sh', [fwd(path.join(dist, 'install.sh'))], { cwd: dir, env, ...opts });
const ps = (exe) => (dir, env) => run(exe, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dist, 'install.ps1')], { cwd: dir, env });

const launcherSh = { file: 'appts', envPath: fwd, run: (file, args, cwd) => run('sh', [fwd(file), ...args], { cwd }) };
const launcherCmd = isWin
  ? { file: 'appts.cmd', envPath: (p) => p, run: (file, args, cwd) => run('cmd.exe', ['/c', file, ...args], { cwd }) }
  : null;

suite('install.sh', sh, { skip: skipSh, posixModes: true, windowsAcl: false, stubKind: 'sh', launcher: launcherSh });
suite('install.ps1 (PowerShell 7 / current)', (dir, env) => ps(PWSH)(dir, env), { skip: skipPs, posixModes: true, windowsAcl: true, stubKind: 'cmd', launcher: launcherCmd });
suite('install.ps1 (Windows PowerShell 5.1)', (dir, env) => ps('powershell')(dir, env), { skip: skipPs || (!WINPS && 'Windows PowerShell not available'), posixModes: false, windowsAcl: true, stubKind: 'cmd', launcher: launcherCmd });

describe('installer extras', () => {
  test('the repository installers have no download URL; the build stamps one in', { skip: skipAll }, async () => {
    for (const name of ['install.sh', 'install.ps1']) {
      const source = readFileSync(path.join(cliDir, 'install', name), 'utf8');
      assert.doesNotMatch(source, /\.va\.gov|downloads\.example\.com/, `${name} must not carry a real URL`);
      const built = readFileSync(path.join(dist, name), 'utf8');
      assert.ok(built.includes('https://downloads.example.com/appt-cli/latest'), `${name} gets the configured URL`);
    }
    const sample = spawnSync('tar', ['-xzOf', path.join(dist, 'appt-cli.tar.gz'), './.env.sample'], { encoding: 'utf8' }).stdout;
    assert.match(sample, /^VISTA_HOST=vista\.example\.com$/m);
    assert.match(readFileSync(path.join(cliDir, '.env.sample'), 'utf8'), /^VISTA_HOST=$/m, 'the committed sample has no host');
  });

  test('without a download location the installers stop and say whom to ask', { skip: skipSh, timeout: 120000 }, async () => {
    const { dir } = workDir();
    const sh = await run('sh', [fwd(path.join(cliDir, 'install', 'install.sh'))], { cwd: dir, env: { APPT_CLI_BASE_URL: '' } });
    assert.notEqual(sh.code, 0);
    assert.match(sh.out, /No download location.*APPT_CLI_BASE_URL.*shane\.elliott@va\.gov/);
    assert.deepEqual(readdirSync(dir), []);
    if (PWSH) {
      const ps = await run(PWSH, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(cliDir, 'install', 'install.ps1')], { cwd: dir, env: { APPT_CLI_BASE_URL: '' } });
      assert.notEqual(ps.code, 0);
      assert.match(ps.out, /No download location/);
    }
  });

  test('install.sh has valid sh syntax', { skip: skipSh }, async () => {
    const r = await run('sh', ['-n', fwd(path.join(cliDir, 'install', 'install.sh'))]);
    assert.equal(r.code, 0, r.out);
  });

  test('install.sh with no controlling terminal falls back to the sample .env instead of prompting', { skip: skipSh || (isWin && 'needs a POSIX session without /dev/tty'), timeout: 120000 }, async () => {
    const { dir, target } = workDir();
    const r = await run('sh', [path.join(dist, 'install.sh')], { cwd: dir, env: { APPT_CLI_NO_PROMPT: '', APPT_CLI_BASE_URL: urls.good }, detached: true });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Created .*\.env without codes/);
    assert.ok(existsSync(path.join(target, '.env')));
  });

  test('install.ps1 picks ~\\.local\\bin when it is on PATH and explains how to add it when nothing suitable is', { skip: skipPs || (!isWin && 'Windows only'), timeout: 120000 }, async () => {
    const script = path.join(dist, 'install.ps1');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script];
    // Point the profile folders at scratch space so the real WindowsApps / .local\bin are never touched.
    const base = { APPT_CLI_BASE_URL: urls.good, APPT_CLI_LAUNCHER: '1', APPT_CLI_BIN_DIR: '', LOCALAPPDATA: path.join(scratch, 'localappdata') };

    const homeA = path.join(scratch, 'homeA');
    const binA = path.join(homeA, '.local', 'bin');
    mkdirSync(binA, { recursive: true });
    const a = workDir();
    const onPath = await run(PWSH, args, { cwd: a.dir, env: { ...base, USERPROFILE: homeA, PATH: `${binA};${process.env.PATH}` } });
    assert.equal(onPath.code, 0, onPath.out);
    assert.ok(existsSync(path.join(binA, 'appts.cmd')), onPath.out);
    assert.doesNotMatch(onPath.out, /not on your PATH/);
    assert.match(onPath.out, /appts --check/);

    const homeB = path.join(scratch, 'homeB');
    const b = workDir();
    const offPath = await run(PWSH, args, { cwd: b.dir, env: { ...base, USERPROFILE: homeB } });
    assert.equal(offPath.code, 0, offPath.out);
    assert.ok(existsSync(path.join(homeB, '.local', 'bin', 'appts.cmd')), offPath.out);
    assert.match(offPath.out, /is not on your PATH yet/);
    assert.match(offPath.out, /SetEnvironmentVariable\('Path'/);
  });

  test('install.sh falls back to $HOME when the current folder is not writable', { skip: skipSh || (isWin && 'needs POSIX permissions') || (process.getuid?.() === 0 && 'root can write anywhere'), timeout: 120000 }, async () => {
    const locked = mkdtempSync(path.join(scratch, 'locked-'));
    const home = path.join(scratch, 'fallback-home-sh');
    mkdirSync(home);
    chmodSync(locked, 0o555);
    try {
      const r = await run('sh', [path.join(dist, 'install.sh')], { cwd: locked, env: { APPT_CLI_BASE_URL: urls.good, HOME: home } });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Cannot write to .*; installing into .* instead\./);
      assert.ok(existsSync(path.join(home, 'appt-cli', 'bin', 'appt-scenario.js')));
      assert.ok(!existsSync(path.join(locked, 'appt-cli')));
      assert.ok(r.out.includes(`node ${path.join(home, 'appt-cli')}/bin/appt-scenario.js --check`), 'next-step command uses the real location');

      chmodSync(home, 0o555);
      const none = await run('sh', [path.join(dist, 'install.sh')], { cwd: locked, env: { APPT_CLI_BASE_URL: urls.good, HOME: home } });
      assert.notEqual(none.code, 0);
      assert.match(none.out, /no writable home folder/);
    } finally {
      chmodSync(home, 0o755);
      chmodSync(locked, 0o755);
    }
  });

  test('install.ps1 falls back to the user profile folder when the current folder is not writable', { skip: skipPs || (!isWin && 'uses Windows ACLs'), timeout: 120000 }, async () => {
    const user = os.userInfo().username;
    const lock = (dirPath) => spawnSync('icacls', [dirPath, '/deny', `${user}:(OI)(CI)(W)`]);
    const unlock = (dirPath) => spawnSync('icacls', [dirPath, '/remove:d', user]);
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dist, 'install.ps1')];

    const locked = mkdtempSync(path.join(scratch, 'locked-'));
    const home = path.join(scratch, 'fallback-home-ps');
    mkdirSync(home);
    lock(locked);
    try {
      const r = await run(PWSH, args, { cwd: locked, env: { APPT_CLI_BASE_URL: urls.good, USERPROFILE: home } });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /Cannot write to .*; installing into .* instead\./);
      assert.ok(existsSync(path.join(home, 'appt-cli', 'bin', 'appt-scenario.js')), r.out);
      assert.ok(!existsSync(path.join(locked, 'appt-cli')));
      assert.ok(r.out.includes(`node ${path.join(home, 'appt-cli', 'bin', 'appt-scenario.js')} --check`), 'next-step command uses the real location');

      lock(home);
      const none = await run(PWSH, args, { cwd: locked, env: { APPT_CLI_BASE_URL: urls.good, USERPROFILE: home } });
      assert.notEqual(none.code, 0);
      assert.match(none.out, /no writable user folder/);
    } finally {
      unlock(home);
      unlock(locked);
    }
  });

  test('install.ps1 run through iex reports failure without closing the session', { skip: skipPs, timeout: 120000 }, async () => {
    const { dir, target } = workDir();
    const script = path.join(dist, 'install.ps1').replace(/'/g, "''");
    const command = `Get-Content -Raw '${script}' | Invoke-Expression; Write-Output "AFTER-IEX last=$LASTEXITCODE"`;
    const failed = await run(PWSH, ['-NoProfile', '-Command', command], { cwd: dir, env: { APPT_CLI_BASE_URL: urls.good, APPT_CLI_NODE: 'no-such-node-binary' } });
    assert.match(failed.stdout, /AFTER-IEX last=1/, failed.out);
    assert.ok(!existsSync(target));

    const installed = await run(PWSH, ['-NoProfile', '-Command', command], { cwd: dir, env: { APPT_CLI_BASE_URL: urls.good } });
    assert.match(installed.stdout, /AFTER-IEX last=0/, installed.out);
    assert.ok(existsSync(path.join(target, 'bin', 'appt-scenario.js')));
  });

  test('release files, checksums, and exclusions', { skip: skipAll }, async () => {
    assert.deepEqual(readdirSync(dist).sort(), ['appt-cli.tar.gz', 'appt-cli.tar.gz.sha256', 'appt-cli.zip', 'appt-cli.zip.sha256', 'install.ps1', 'install.sh']);
    const { createHash } = await import('node:crypto');
    for (const f of ['appt-cli.zip', 'appt-cli.tar.gz']) {
      const digest = createHash('sha256').update(readFileSync(path.join(dist, f))).digest('hex');
      assert.equal(readFileSync(path.join(dist, `${f}.sha256`), 'utf8'), `${digest}  ${f}\n`);
    }
    assert.ok(!readFileSync(path.join(dist, 'install.sh'), 'utf8').includes('\r'), 'install.sh must use LF endings');
    const listing = spawnSync('tar', ['-tzf', path.join(dist, 'appt-cli.tar.gz')], { encoding: 'utf8' }).stdout;
    assert.ok(listing.includes('.env.sample'));
    assert.ok(!/(^|\/)\.env$/m.test(listing), 'no .env in package');
    assert.ok(!/node_modules|(^|\/)scripts\/|(^|\/)install\//.test(listing));
  });
});
