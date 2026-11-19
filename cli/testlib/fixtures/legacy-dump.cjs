// One-off: print framing outputs from the legacy library (with its npm deps shimmed) for use as test fixtures.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'bulk-appointments', 'VistaJSLibrary.js'), 'utf8');
const shims = {
  underscore: { isArray: Array.isArray, random: () => 0 },
  'underscore.string': { lpad: (s, w, c) => String(s).padStart(w, c) },
  async: {},
  bunyan: { createLogger: () => ({ debug() {}, trace() {} }) }
};
const mod = { exports: {} };
vm.runInNewContext(src, {
  require: (name) => shims[name] || require(name),
  module: mod,
  exports: mod.exports
});
const L = mod.exports;
const out = {
  literal: L.buildLiteralParamString('SDEC APPSLOTS'),
  encrypted: L.buildEncryptedParamString('ACCESS;VERIFY', 3, 7),
  context: L.buildEncryptedParamString('CDSP RPC CONTEXT', 1, 8),
  rpcNoParams: L.buildRpcString('XUS SIGNON SETUP', null),
  rpcParams: L.buildRpcString('SDEC APPSLOTS', [L.buildLiteralParamString('185'), L.buildLiteralParamString('2026-11-17'), L.buildLiteralParamString('')]),
  greeting: L.buildRpcGreetingString('10.0.0.5', 'ec2-host'),
  signOff: L.buildRpcSignOffString()
};
fs.writeFileSync(path.join(__dirname, 'legacy-framing.json'), `${JSON.stringify(out, null, 2)}\n`);
