import net from 'node:net';
import os from 'node:os';
import {
  BrokerError, EOT, buildGreeting, buildRpcString, buildSignOff, encryptedParam, literalParam, parseReply
} from './protocol.js';

const SIGNON_RPCS = new Set(['XUS AV CODE', 'XWB CREATE CONTEXT']);
// ORWU USERINFO piece 26 (zero-based 25): 1 = production account, 0 = not.
const PROD_ACCOUNT_PIECE = 25;

export class RpcClient {
  constructor({ host, port, timeoutMs = 30000, log = () => {} }) {
    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.socket = null;
    this.buffer = '';
    this.pending = null;
    this.user = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      socket.setEncoding('latin1');
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new BrokerError(`Could not connect to ${this.host}:${this.port} within ${this.timeoutMs / 1000}s`));
      }, this.timeoutMs);

      socket.once('connect', () => {
        clearTimeout(timer);
        this.socket = socket;
        socket.on('data', (chunk) => this.onData(chunk));
        socket.on('error', (err) => this.fail(new BrokerError(`Connection error with ${this.host}:${this.port}: ${err.message}`)));
        socket.on('close', () => this.fail(new BrokerError(`Connection to ${this.host}:${this.port} closed`)));
        resolve();
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(new BrokerError(`Could not connect to ${this.host}:${this.port}: ${err.message}`));
      });
    });
  }

  onData(chunk) {
    this.buffer += chunk;
    const end = this.buffer.indexOf(EOT);
    if (end === -1 || !this.pending) return;
    const raw = this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end + 1);
    const { resolve, reject, timer } = this.pending;
    this.pending = null;
    clearTimeout(timer);
    try {
      resolve(parseReply(raw));
    } catch (err) {
      reject(err);
    }
  }

  fail(err) {
    if (!this.pending) return;
    const { reject, timer } = this.pending;
    this.pending = null;
    clearTimeout(timer);
    reject(err);
  }

  send(message, label) {
    if (!this.socket) return Promise.reject(new BrokerError('Not connected'));
    if (this.pending) return Promise.reject(new BrokerError('Concurrent RPC calls are not supported'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new BrokerError(`Timed out after ${this.timeoutMs / 1000}s waiting for ${label}`));
      }, this.timeoutMs);
      this.pending = { resolve, reject, timer };
      this.socket.write(message, 'latin1');
    });
  }

  async call(rpcName, params = []) {
    this.log(`RPC ${rpcName} ${SIGNON_RPCS.has(rpcName) ? '[****]' : JSON.stringify(params)}`);
    return this.send(buildRpcString(rpcName, params.map((p) => literalParam(p))), rpcName);
  }

  async signOn({ accessCode, verifyCode, context }) {
    const greeting = await this.send(buildGreeting(this.socket.localAddress || '127.0.0.1', os.hostname()), 'greeting');
    if (greeting !== 'accept') throw new BrokerError(`Broker handshake rejected: ${greeting}`);

    this.log('RPC XUS SIGNON SETUP');
    await this.send(buildRpcString('XUS SIGNON SETUP'), 'XUS SIGNON SETUP');

    this.log('RPC XUS AV CODE [****]');
    const av = await this.send(buildRpcString('XUS AV CODE', [encryptedParam(`${accessCode};${verifyCode}`)]), 'XUS AV CODE');
    const lines = av.split('\r\n');
    if (!lines[0] || lines[0] === '0') {
      throw new BrokerError(`Authentication failed: ${lines[3] || 'invalid access/verify code'}`);
    }
    if (lines[2] === '1') {
      throw new BrokerError('Authentication failed: verify code must be changed (sign on interactively to change it)');
    }
    this.user = { duz: lines[0], name: '', division: '' };

    try {
      this.log('RPC XUS GET USER INFO');
      const info = (await this.send(buildRpcString('XUS GET USER INFO'), 'XUS GET USER INFO')).split('\r\n');
      this.user.name = info[1] || '';
      this.user.division = (info[3] || '').split('^')[1] || '';
    } catch (err) {
      this.log(`XUS GET USER INFO unavailable: ${err.message}`);
    }

    this.log(`RPC XWB CREATE CONTEXT ${context}`);
    const ctx = await this.send(buildRpcString('XWB CREATE CONTEXT', [encryptedParam(context)]), 'XWB CREATE CONTEXT');
    if (ctx !== '1') throw new BrokerError(`Not authorized for RPC context "${context}": ${ctx}`);
    return this.user;
  }

  // Fail closed: VistA itself must say it is not a production account before any scheduling RPC runs.
  async assertNotProduction() {
    let reply;
    try {
      reply = await this.call('ORWU USERINFO', []);
    } catch (err) {
      throw new BrokerError(`Could not confirm this VistA is a non-production system (ORWU USERINFO failed: ${err.message}). Refusing to continue.`);
    }
    const flag = String(reply).split('^')[PROD_ACCOUNT_PIECE]?.trim();
    if (flag === '1') {
      throw new BrokerError('This VistA reports that it is a PRODUCTION account. This tool only works against dev and sqa systems. Refusing to continue.');
    }
    if (flag !== '0') {
      throw new BrokerError(`Could not confirm this VistA is a non-production system (production flag was "${flag ?? ''}"). Refusing to continue.`);
    }
  }

  async close() {
    if (!this.socket) return;
    try {
      await this.send(buildSignOff(), '#BYE#');
    } catch {
      // Sign-off failures are irrelevant once work is done.
    }
    this.socket.removeAllListeners();
    this.socket.destroy();
    this.socket = null;
  }
}

export async function openSession(settings, log) {
  const client = new RpcClient({ host: settings.host, port: settings.port, log });
  await client.connect();
  try {
    await client.signOn(settings);
    await client.assertNotProduction();
  } catch (err) {
    await client.close();
    throw err;
  }
  return client;
}
