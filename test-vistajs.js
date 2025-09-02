const VistaJS = require('./VistaJS');
const config = require('./config.js');
const bunyan = require('bunyan');

// Setup logger
const logger = bunyan.createLogger({
    name: 'vistajs-test',
    level: 'info'
});

// VistaJS configuration
const vistaConfig = {
    host: config.vistaHost || 'localhost',
    port: config.vistaPort || 9430,
    accessCode: config.accessCode,
    verifyCode: config.verifyCode,
    context: 'SDECRPC',
    localIP: config.localIP || '127.0.0.1',
    localAddress: config.localAddress || 'localhost'
};

console.log('Testing VistaJS authentication...');
console.log('Configuration:', {
    host: vistaConfig.host,
    port: vistaConfig.port,
    context: vistaConfig.context,
    localIP: vistaConfig.localIP,
    localAddress: vistaConfig.localAddress
});

// Test authentication
VistaJS.authenticate(logger, vistaConfig, function(error, result) {
    if (error) {
        console.error('Authentication failed:', error.message);
        process.exit(1);
    }
    
    console.log('Authentication successful!');
    console.log('User info:', result);
    
    // Test a simple RPC call
    console.log('\nTesting RPC call...');
    VistaJS.callRpc(logger, vistaConfig, 'SDEC RESCE', [""], function(error, result) {
        if (error) {
            console.error('RPC call failed:', error.message);
        } else {
            console.log('RPC call successful!');
            console.log('First 200 characters of result:', result.substring(0, 200) + '...');
        }
        process.exit(0);
    });
});
