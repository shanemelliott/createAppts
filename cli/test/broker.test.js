import assert from 'node:assert/strict';
import net from 'node:net';
import { after, before, test } from 'node:test';
import { decrypt } from '../src/broker/cipher.js';
import { RpcClient, openSession } from '../src/broker/rpcClient.js';

const EOT = '\u0004';
const reply = (body) => `\u0000\u0000${body}${EOT}`;

// Minimal RPC Broker stand-in: answers sign-on RPCs and echoes other RPC names.
function startFakeBroker({ accessCode = 'GOODAC', verifyCode = 'GOODVC', context = 'CDSP RPC CONTEXT', prodFlag = '0', userInfoError = false } = {}) {
  const received = [];
  const server = net.createServer((socket) => {
    socket.setEncoding('latin1');
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk;
      let end;
      while ((end = buf.indexOf(EOT)) !== -1) {
        const msg = buf.slice(0, end);
        buf = buf.slice(end + 1);
        received.push(msg);
        socket.write(respond(msg), 'latin1');
      }
    });
  });

  function parseRpc(msg) {
    const idx = msg.indexOf('1.108') + 5;
    const nameLen = msg.charCodeAt(idx);
    const name = msg.slice(idx + 1, idx + 1 + nameLen);
    const rest = msg.slice(idx + 1 + nameLen);
    const len = Number(rest.slice(2, 5));
    return { name, firstParam: rest.startsWith('50') ? rest.slice(5, 5 + len) : '' };
  }
  const encryptedArg = (msg) => decrypt(parseRpc(msg).firstParam);

  function respond(msg) {
    if (msg.includes('TCPConnect')) return reply('accept');
    if (msg.includes('#BYE#')) return reply('#BYE#');
    if (msg.includes('XUS SIGNON SETUP')) return reply('server\r\nvolume');
    if (msg.includes('XUS AV CODE')) {
      return encryptedArg(msg) === `${accessCode};${verifyCode}`
        ? reply('520\r\n0\r\n0\r\n\r\n0\r\n0\r\n\r\nGood morning')
        : reply('0\r\n0\r\n0\r\nNot a valid ACCESS CODE/VERIFY CODE pair.\r\n0\r\n0\r\n');
    }
    if (msg.includes('XUS GET USER INFO')) return reply('520\r\nTESTER,ONE\r\nOne Tester\r\n500^CAMP MASTER^500\r\n');
    if (msg.includes('XWB CREATE CONTEXT')) return reply(encryptedArg(msg) === context ? '1' : 'Application context has not been created!');
    if (msg.includes('ORWU USERINFO')) {
      if (userInfoError) return `\u0000XRPC not in context${EOT}`;
      const pieces = Array.from({ length: 29 }, () => '0');
      pieces[0] = '520';
      pieces[1] = 'TESTER,ONE';
      pieces[25] = prodFlag;
      return reply(pieces.join('^'));
    }
    return reply(`echo:${parseRpc(msg).name}`);
  }

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received }));
  });
}

let broker;
before(async () => { broker = await startFakeBroker(); });
after(() => broker.server.close());

const base = () => ({ host: '127.0.0.1', port: broker.port, accessCode: 'GOODAC', verifyCode: 'GOODVC', context: 'CDSP RPC CONTEXT' });

test('signs on, reads user info, creates context, calls RPCs and signs off', async () => {
  const logs = [];
  const client = await openSession(base(), (m) => logs.push(m));
  assert.deepEqual(client.user, { duz: '520', name: 'TESTER,ONE', division: 'CAMP MASTER' });
  assert.equal(await client.call('SDEC RESCE', ['']), 'echo:SDEC RESCE');
  assert.equal(await client.call('SDEC APPSLOTS', ['1', '2026-11-17', '2026-11-18']), 'echo:SDEC APPSLOTS');
  await client.close();
  assert.ok(broker.received.some((m) => m.includes('#BYE#')));
  const logText = logs.join('\n');
  assert.ok(!logText.includes('GOODAC') && !logText.includes('GOODVC'), 'sign-on parameters must be masked');
});

test('bad credentials fail without echoing the codes', async () => {
  await assert.rejects(
    openSession({ ...base(), verifyCode: 'WRONG' }, () => {}),
    (err) => /Authentication failed/.test(err.message) && !err.message.includes('GOODAC') && !err.message.includes('WRONG')
  );
});

test('missing context authorization is reported', async () => {
  await assert.rejects(openSession({ ...base(), context: 'OTHER CONTEXT' }, () => {}), /Not authorized for RPC context "OTHER CONTEXT"/);
});

test('unreachable host names host and port', async () => {
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  const client = new RpcClient({ host: '127.0.0.1', port, timeoutMs: 2000 });
  await assert.rejects(client.connect(), new RegExp(`127\\.0\\.0\\.1:${port}`));
});

// ---- production guard: VistA itself must say it is not a production account ----

async function withBroker(options, fn) {
  const b = await startFakeBroker(options);
  try {
    return await fn(b);
  } finally {
    b.server.close();
  }
}

const rpcNames = (b) => b.received.map((m) => /1\.108[\s\S]([\s\S]+?)5/.exec(m)?.[1]).filter(Boolean);

test('a non-production system (flag 0) is accepted and checked once, right after sign-on', async () => {
  await withBroker({ prodFlag: '0' }, async (b) => {
    const client = await openSession({ host: '127.0.0.1', port: b.port, accessCode: 'GOODAC', verifyCode: 'GOODVC', context: 'CDSP RPC CONTEXT' }, () => {});
    assert.ok(b.received.some((m) => m.includes('ORWU USERINFO')));
    await client.close();
  });
});

test('a production system (flag 1) is refused, signed off, and no scheduling RPC is possible', async () => {
  await withBroker({ prodFlag: '1' }, async (b) => {
    await assert.rejects(
      openSession({ host: '127.0.0.1', port: b.port, accessCode: 'GOODAC', verifyCode: 'GOODVC', context: 'CDSP RPC CONTEXT' }, () => {}),
      /PRODUCTION account.*Refusing to continue/
    );
    assert.ok(b.received.some((m) => m.includes('#BYE#')), 'signed off');
    assert.ok(!rpcNames(b).some((n) => n.startsWith('SDEC') || n.startsWith('SDES')), 'no scheduling RPC was called');
  });
});

test('an unreadable or missing production flag is refused (fails closed)', async () => {
  for (const prodFlag of ['', 'Y', '2']) {
    await withBroker({ prodFlag }, async (b) => {
      await assert.rejects(
        openSession({ host: '127.0.0.1', port: b.port, accessCode: 'GOODAC', verifyCode: 'GOODVC', context: 'CDSP RPC CONTEXT' }, () => {}),
        /Could not confirm this VistA is a non-production system/,
        `flag "${prodFlag}"`
      );
    });
  }
});

test('if the production check RPC itself fails, the session is refused', async () => {
  await withBroker({ userInfoError: true }, async (b) => {
    await assert.rejects(
      openSession({ host: '127.0.0.1', port: b.port, accessCode: 'GOODAC', verifyCode: 'GOODVC', context: 'CDSP RPC CONTEXT' }, () => {}),
      /Could not confirm this VistA is a non-production system \(ORWU USERINFO failed/
    );
  });
});
