// RPC Broker message framing, ported from bulk-appointments/VistaJSLibrary.js.
import { encrypt } from './cipher.js';

export const NUL = '\u0000';
export const EOT = '\u0004';
const ENQ = '\u0005';
const PREFIX = '[XWB]';
const RPC_VERSION = '1.108';
const COUNT_WIDTH = 3;

export function strPack(value, width = COUNT_WIDTH) {
  return String(value.length).padStart(width, '0') + value;
}

function prependCount(value) {
  return String.fromCharCode(value.length) + value;
}

export function literalParam(value) {
  return `0${strPack(String(value))}f`;
}

export function encryptedParam(value, assocIndex, idIndex) {
  return literalParam(encrypt(value, assocIndex, idIndex));
}

export function buildRpcString(rpcName, paramStrings = []) {
  const params = paramStrings.length ? `5${paramStrings.join('')}` : '54f';
  return `${PREFIX}11302${prependCount(RPC_VERSION)}${prependCount(rpcName)}${params}${EOT}`;
}

export function buildGreeting(ipAddress, hostname) {
  return `[XWB]10304\nTCPConnect50${strPack(literalParam(ipAddress))}f0${strPack('0')}f0${strPack(literalParam(hostname))}f${EOT}`;
}

export function buildSignOff() {
  return `[XWB]10304${ENQ}#BYE#${EOT}`;
}

export class BrokerError extends Error {}

// Raw reply (without trailing EOT): byte 0 = security segment, byte 1 = application error segment.
export function parseReply(raw) {
  if (raw[0] !== NUL) {
    const parts = raw.split(NUL);
    throw new BrokerError(`VistA security error: ${parts[parts.length - 1]}`);
  }
  if (raw[1] !== NUL) {
    throw new BrokerError(`VistA application error: ${raw.replace(/[\x00-\x1f]/g, ' ').trim()}`);
  }
  const body = raw.slice(2);
  if (body.includes('M  ERROR')) throw new BrokerError(body);
  return body;
}
