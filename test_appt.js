const VistaJS = require('./VistaJS');
const config = require('./config.js');

// Setup logger for VistaJS
const bunyan = require('bunyan');
const logger = bunyan.createLogger({
    name: 'test-appt',
    level: 'info'
});

// VistaJS configuration
const vistaConfig = {
    host: config.host,
    port: config.port,
    accessCode: config.accessCode,
    verifyCode: config.verifyCode,
    context: 'SDESRPC', // Default context, will be changed per RPC
    localIP: config.localIP,
    localAddress: config.localAddress
};

function testMakeAppt() {
    const rpcConfig = { ...vistaConfig, context: 'SDECRPC' };
    
    // Test parameters similar to successful call
   
    
    const parameters = [
      "OCT 03, 2025@12:30",   // #1: SEP 26, 2025@08:00
      "OCT 03, 2025@13:00",     // #2: SEP 26, 2025@08:30  
      "100718",                // #3: patient IEN
      "94",                // #4: resource IEN
      "30",                 // #5: 30
      "",                   // #6: (empty)
      "0",                  // #7: 0
      "0",                  // #8: 0
      "FALSE",              // #9: FALSE
      "10/2/2025",          // #10: desired date
      "PATIENT",         // #11: OUTPATIENT (instead of PATIENT)
      "",                   // #12: (empty)
      "",                   // #13: (empty)
      "",                   // #14: (empty)
      "A|14755",                  // #15: appointment request ref
      "YES",                // #16: YES
      "",                   // #17: (empty)
      "467",                // #18: clinic IEN
      "",                   // #19: (empty)
      "",                   // #20: (empty)
      "9",                 // #21: 30 (appointment length)
      "ESTABLISHED",                   // #22: (empty - let system determine)
      "1",                  // #23: 0
      "",                   // #24: (empty)
      "15"                    // #25: (empty instead of 16)
    ];
    
    console.log('=== Testing SDEC APPADD with parameters ===');
    parameters.forEach((param, index) => {
      console.log(`Parameter ${index + 1}: "${param}"`);
    });
    console.log('=====================================');
    
    VistaJS.callRpc(logger, rpcConfig, 'SDEC APPADD', parameters, function(error, result) {
      if (error) {
        console.log('Error creating appointment:', error);
        process.exit(1);
      } else {
        console.log('Success! Appointment result:', result);
        process.exit(0);
      }
    });
}

// Test the appointment creation
testMakeAppt();
