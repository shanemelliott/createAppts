import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decrypt, encrypt } from '../src/broker/cipher.js';
import {
  BrokerError, buildGreeting, buildRpcString, buildSignOff, encryptedParam, literalParam, parseReply
} from '../src/broker/protocol.js';

const legacy = JSON.parse(readFileSync(new URL('../testlib/fixtures/legacy-framing.json', import.meta.url), 'utf8'));

test('literal parameter matches legacy library', () => {
  assert.equal(literalParam('SDEC APPSLOTS'), legacy.literal);
});

test('encrypted parameters match legacy library for fixed cipher indexes', () => {
  assert.equal(encryptedParam('ACCESS;VERIFY', 3, 7), legacy.encrypted);
  assert.equal(encryptedParam('CDSP RPC CONTEXT', 1, 8), legacy.context);
});

test('rpc strings match legacy library', () => {
  assert.equal(buildRpcString('XUS SIGNON SETUP'), legacy.rpcNoParams);
  assert.equal(buildRpcString('SDEC APPSLOTS', ['185', '2026-11-17', ''].map(literalParam)), legacy.rpcParams);
});

test('greeting and sign-off match legacy library', () => {
  assert.equal(buildGreeting('10.0.0.5', 'ec2-host'), legacy.greeting);
  assert.equal(buildSignOff(), legacy.signOff);
});

test('random cipher indexes round-trip and never repeat', () => {
  for (let i = 0; i < 50; i += 1) {
    const enc = encrypt('PU1234;PU1234!!');
    assert.notEqual(enc.charCodeAt(0), enc.charCodeAt(enc.length - 1));
    assert.equal(decrypt(enc), 'PU1234;PU1234!!');
  }
});

test('parseReply strips the two status bytes and surfaces errors', () => {
  assert.equal(parseReply('\u0000\u0000accept'), 'accept');
  assert.throws(() => parseReply('\u0005abc\u0000Not allowed'), BrokerError);
  assert.throws(() => parseReply('\u0000Xboom'), /application error/);
  assert.throws(() => parseReply('\u0000\u0000M  ERROR=foo'), BrokerError);
});
