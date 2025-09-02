const VistaJS = require('./VistaJS');
const config = require('./config.js');

const ObjectsToCsv = require('objects-to-csv')
var stdin = process.openStdin();

// Setup logger for VistaJS
const bunyan = require('bunyan');
const logger = bunyan.createLogger({
    name: 'createAppts',
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

// Store authenticated user info
let authenticatedUser = null;

// Function to get authenticated user DUZ
function getAuthenticatedDUZ() {
    return authenticatedUser ? authenticatedUser.duz : (config.duz || '1');
}

// Utility function to check if string is valid JSON
function isJsonString(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}
function getClinics() {
  return new Promise(function (resolve, reject) {
    // Create config with SDECRPC context
    const rpcConfig = { ...vistaConfig, context: 'SDECRPC' };
    
    VistaJS.callRpc(logger, rpcConfig, 'SDEC RESCE', [""], function(error, result) {
      if (error) {
        console.log('Error:', error);
        reject(error);
        return;
      }
      
      if (result) {
        var respArr = result.split(String.fromCharCode(30));
        var header = respArr[0].split("^");
        header = header.map(element => element.substr(6))
        respArr.shift()
        var dataArr = []
        respArr.forEach(function (e) {
          var rec = e.split("^")
          dataArr.push(rec)
        })
        var list = []
        dataArr.forEach(function (e, i) {
          var rec = {}
          e.forEach(function (c, f) {
            rec[header[f]] = c
          })
          list.push(rec)
        })
        
        // Filter to only return clinics that start with "DEV/"
        var filteredList = list.filter(function(clinic) {
          // Check if clinic name field starts with "DEV/"
          var clinicName = clinic.CLINNAME || clinic.RESOURCE_NAME || '';
          return clinicName.startsWith('DEV/');
        });
        
        resolve(filteredList)
      } else {
        reject(new Error('No response received'));
      }
    });
  });
}
function getRandName(letter, number) {
  return new Promise(function (resolve, reject) {
    const rpcConfig = { ...vistaConfig, context: 'SDECRPC' };
    
    VistaJS.callRpc(logger, rpcConfig, 'SDEC GET PATIENT DEMOG', [letter, "200", ""], function(error, result) {
      if (error) {
        reject(error);
        return;
      }
      
      if (result) {
        var respArr = result.split(String.fromCharCode(30));
        var header = respArr[0].split("^");
        header = header.map(element => element.substr(6))
        respArr.shift()
        var dataArr = []
        respArr.forEach(function (e) {
          var rec = e.split("^")
          dataArr.push(rec)
        })
        var list = []
        dataArr.forEach(function (e, i) {
          var rec = {}
          e.forEach(function (c, f) {
            rec[header[f]] = c
          })
          list.push(rec)
        })
        
        if (list.length > number) {
          resolve(list[number])
        } else {
          if (list.length > 2) {
            resolve(list[1]);
          } else {
            resolve(null)
          }
        }
      } else {
        resolve(null);
      }
    });
  });
}

function getRandNames(letter, number) {
  return new Promise(function (resolve, reject) {
    const rpcConfig = { ...vistaConfig, context: 'SDECRPC' };
    
    VistaJS.callRpc(logger, rpcConfig, 'SDEC GET PATIENT DEMOG', [letter, number, ""], function(error, result) {
      if (error) {
        reject(error);
        return;
      }
      
      if (result) {
        var respArr = result.split(String.fromCharCode(30));
        var header = respArr[0].split("^");
        header = header.map(element => element.substr(6))
        respArr.shift()
        var dataArr = []
        respArr.forEach(function (e) {
          var rec = e.split("^")
          dataArr.push(rec)
        })
        var list = []
        dataArr.forEach(function (e, i) {
          var rec = {}
          e.forEach(function (c, f) {
            rec[header[f]] = c
          })
          list.push(rec)
        })
        resolve(list)
      } else {
        resolve([]);
      }
    });
  });
}



function checkAppt(ien, date, start, end) {
  return new Promise(function (resolve, reject) {
    date = date.split("T")[0]
    const rpcConfig = { ...vistaConfig, context: 'SDECRPC' };
    
    const parameters = [
      ien,
      date + "T" + start + "-04:00",
      date + "T" + end + "-04:00"
    ];
    
    VistaJS.callRpc(logger, rpcConfig, 'SDES GET APPTS BY PATIENT DFN3', parameters, function(error, result) {
      if (error) {
        reject(error);
        return;
      }
      
      try {
        var appData = JSON.parse(result);
        if (appData.Appointment[0] == '') {
          resolve(0)
        } else {
          if (appData.Appointment[0].AppointmentCancelled == 'CANCELLED') {
            resolve(0)
          } else {
            resolve(1)
          }
        }
      } catch (parseError) {
        resolve(0); // Default to available if parsing fails
      }
    });
  });
}
function makeAppt(ien, clinicIen, resourceIen, date, start, end, apptRequestData = null) {
  return new Promise(function (resolve, reject) {
    const rpcConfig = { ...vistaConfig, context: 'SDECRPC' };
    
    // Use appointment request data if provided
    const desiredDate = apptRequestData ? apptRequestData.futureDateStr : "9/28/2025";
    const apptRequestRef = apptRequestData ? `A|${apptRequestData.requestId}` : "A";
    
    // Format date for SDEC APPADD (needs to be in "MMM DD, YYYY@HH:MM" format)
    const appointmentDate = new Date(date);
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", 
                   "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    
    // Clean and normalize the time strings to remove any hidden characters
    const cleanStart = start.toString().replace(/[^\d:]/g, '');
    const cleanEnd = end.toString().replace(/[^\d:]/g, '');
    
    const formattedStartDate = `${months[appointmentDate.getMonth()]} ${appointmentDate.getDate()}, ${appointmentDate.getFullYear()}@${cleanStart}`;
    const formattedEndDate = `${months[appointmentDate.getMonth()]} ${appointmentDate.getDate()}, ${appointmentDate.getFullYear()}@${cleanEnd}`;
    
    const parameters = [
      formattedStartDate, formattedEndDate, ien, resourceIen, "30", "", "0", "0", "FALSE",
      desiredDate, "PATIENT", "", "", "", apptRequestRef, "YES", "", clinicIen, "", "",
      "11", "ESTABLISHED", "1", "", "16"
    ];

    VistaJS.callRpc(logger, rpcConfig, 'SDEC APPADD', parameters, function(error, result) {
      if (error) {
        console.log('Error creating appointment:', error);
        reject(error);
        return;
      }
      
      // Parse the response to check for success or errors
      if (result && result.includes('ERRORID')) {
        // Check for specific error conditions first
        if (result.includes('already scheduled at the same time')) {
          reject(new Error('Patient already has an appointment scheduled at the same time'));
          return;
        }
        
        if (result.includes('NO OPEN SLOTS')) {
          // Log SDEC APPADD payload when no slots available
          // console.log('=== NO SLOTS AVAILABLE - SDEC APPADD PAYLOAD ===');
          // const payloadFormatted = parameters.map(param => ({ "string": param.toString() }));
          // console.log(JSON.stringify(payloadFormatted, null, 4));
          // console.log('===============================================');
          console.log(result)
          reject(new Error('No open appointment slots available'));
          return;
        }
        
        // Extract the ERRORID number (handle control characters between ERRORID and number)
        const errorIdMatch = result.match(/ERRORID[^\d]*(\d+)/);
        
        if (errorIdMatch) {
          const errorId = errorIdMatch[1];
          
          // If ERRORID is 0, it's an error
          if (errorId === '0') {
            reject(new Error('Appointment creation failed: ' + result));
            return;
          }
          
          // If ERRORID has a number > 0, it's success - the number is the appointment ID
          if (parseInt(errorId) > 0) {
            resolve({ 
              success: true,
              appointmentId: errorId,
              payload: result 
            });
            return;
          }
        }
      }
      
      // Fallback for unexpected response format
      resolve({ success: false, payload: result });
    });
  });
}

function createApptRequest(patientIen, clinicIen) {
  return new Promise(async function (resolve, reject) {
    const rpcConfig = { ...vistaConfig, context: 'SDECRPC' };
    
    // Get current date/time and future date
    const now = new Date();
    const currentDateTime = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}@${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const futureDateStr = `${futureDate.getMonth() + 1}/${futureDate.getDate()}/${futureDate.getFullYear()}`;
    
    // Get user name from getUserInfo
    let userName = 'SYSTEM USER';
    try {
      if (authenticatedUser?.name) {
        userName = authenticatedUser.name;
      } else {
        const userInfo = await getUserInfo();
        userName = userInfo.name || 'SYSTEM USER';
      }
    } catch (error) {
      userName = 'SYSTEM USER';
    }
    
    const parameters = [
      '', patientIen, currentDateTime, 'CAMP MASTER', 'APPT', clinicIen, userName, 'ASAP',
      'PATIENT', '', futureDateStr, '', 'GROUP 1', 'NO', '0', '0', '', 'YES', '75',
      futureDateStr, '', '11', 'ESTABLISHED', '', '', '', '', '', ''
    ];
    
    VistaJS.callRpc(logger, rpcConfig, 'SDEC ARSET', parameters, function(error, result) {
      if (error) {
        console.log('Error creating appointment request:', error);
        reject(error);
        return;
      }
      
      // Parse the response to extract the request ID
      let requestId = '';
      if (result && result.includes('TEXT')) {
        const textIndex = result.indexOf('TEXT');
        if (textIndex !== -1) {
          const afterText = result.substring(textIndex + 4);
          const caretIndex = afterText.indexOf('^');
          if (caretIndex !== -1) {
            requestId = afterText.substring(0, caretIndex);
          } else {
            requestId = afterText;
          }
        }
      }
      
      // Remove control characters (ASCII 0-31) from the request ID
      requestId = requestId.replace(/[\x00-\x1F]/g, '');
      
      resolve({
        result: result,
        requestId: requestId,
        futureDateStr: futureDateStr
      });
    });
  });
}

function getUserInfo() {
  return new Promise(function (resolve, reject) {
    const rpcConfig = { ...vistaConfig, context: 'OR CPRS GUI CHART' };
    
    VistaJS.callRpc(logger, rpcConfig, 'ORWU USERINFO', [], function(error, result) {
      if (error) {
        reject(error);
        return;
      }
      
      if (result) {
        const parts = result.split('^');
        
        const userInfo = {
          duz: parts[0] || '',
          name: parts[1] || '',
          userClass: parts[2] || '',
          canSign: parts[3] === '1',
          isProvider: parts[4] === '1',
          orderRole: parts[5] || '',
          noOrder: parts[6] === '1',
          dtime: parts[7] || '',
          countdown: parts[8] || '',
          enableVerify: parts[9] === '1',
          notifyApps: parts[10] || '',
          msgHang: parts[11] || '',
          domain: parts[12] || '',
          service: parts[13] || '',
          autoSave: parts[14] === '1',
          initTab: parts[15] || '',
          lastTab: parts[16] || '',
          webAccess: parts[17] === '1',
          allowHold: parts[18] === '1',
          isRpl: parts[19] === '1',
          rplList: parts[20] || '',
          corTabs: parts[21] || '',
          rptTab: parts[22] || '',
          staNum: parts[23] || '',
          gecStatus: parts[24] || '',
          prodAcct: parts[25] || '',
          jobNumber: parts[27] || '',
          evalRemonDialog: parts[28] || ''
        };
        
        resolve(userInfo);
      } else {
        reject(new Error('No user info received'));
      }
    });
  });
}


//main
console.log('Commands: l-list DEV clinics, m-make bulk appointments, r-create appointment request & appointment, u-authenticate user')
stdin.addListener("data", function (d) {
  if (d.toString().trim() === 'l') {
    getClinics().then(clinics => {
      console.log("DEV Clinics:", clinics.length);
      clinics.forEach(clinic => console.log(`${clinic.CLINNAME} (${clinic.HOSPITAL_LOCATION_ID})`));
    }).catch(error => {
      console.log("Error getting clinics:", error.message);
    });    
  }
  
  if (d.toString().trim() === 'm') {
    var appointmentiens = []
    let apptDays = 1
    
    // Progress tracking
    let totalAttempts = 0;
    let successfulAppts = 0;
    let errorCount = 0;
    
    // Progress bar function
    function updateProgress() {
      if (config.clinicDebug === 0) {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(`Progress: ${totalAttempts} attempts | ✓ ${successfulAppts} created | ✗ ${errorCount} errors`);
      }
    }
    
    const doAppts = async () => {
      //get clinics
      var apptsLength = 100 //number of appointments to attempt
      for (var e = 0; e < apptsLength; e++) {
        var clinics = await getClinics()
     
        for (var i = 0; i < clinics.length; i++) {
          var slots = config.slots

          var result = [clinics[i]]; // Use the current clinic directly
          
          //get random letter
          const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
          let letter = characters.charAt(Math.floor(Math.random() * characters.length))
          //get random number between 1 and 200
          let number = Math.floor(Math.random() * 20) + 1
          //get random name of patient based on random letter and number
          let name = await getRandName(letter, number)
          if (name) {
            if (name.IEN) {
              //get date/time
              for (var e = 0; e < apptDays; e++) {
                // Get current date/time in EST timezone (where VistA server is located)
                var date = new Date();
                date = new Date(date.toLocaleString("en-US", {timeZone: "America/New_York"}));
                
                // Randomly pick a date between today and today +30 days
                var randomDaysToAdd = Math.floor(Math.random() * 31); // 0 to 30 days
                date.setDate(date.getDate() + randomDaysToAdd);

                var s = Math.floor(Math.random() * 12 - 1) + 1
                
                // Create appointment request once per patient/clinic combination
                var requestResult = null;
                
                try {
                  // First create appointment request
                  if (config.clinicDebug === 1) {
                    console.log('Creating appointment request for patient:', name.IEN, 'clinic:', result[0].HOSPITAL_LOCATION_ID, 'resourceid:', result[0].RESOURCEID);
                  }
                  requestResult = await createApptRequest(name.IEN, result[0].HOSPITAL_LOCATION_ID);
                  if (config.clinicDebug === 1) {
                    console.log('Request ID:', requestResult.requestId);
                  }
                  
                } catch (error) {
                  if (config.clinicDebug === 1) {
                    console.log('Error creating appointment request:', error.message);
                  }
                  
                  // Handle connection reset errors
                  if (error.code === 'ECONNRESET' || error.message.includes('ECONNRESET')) {
                    if (config.clinicDebug === 1) {
                      console.log('Connection reset detected. Waiting 5 seconds before continuing...');
                    }
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                  }
                  continue; // Skip to next patient if request creation fails
                }
                
                // Create single appointment attempt (no retries)
                try {
                  totalAttempts++;
                  
                  // Create the appointment using the request data
                  var apptResult = await makeAppt(
                    name.IEN, 
                    result[0].HOSPITAL_LOCATION_ID, 
                    result[0].RESOURCEID, 
                    date.toLocaleDateString("en-US"), 
                    slots[s][0], 
                    slots[s][1],
                    requestResult // Use the appointment request data
                  );
                  
                  if (apptResult.success) {
                    successfulAppts++;
                    if (config.clinicDebug === 1) {
                      console.log('Appointment created successfully! ID:', apptResult.appointmentId);
                    }
                    appointmentiens.push(apptResult.appointmentId);
                  } else {
                    errorCount++;
                    if (config.clinicDebug === 1) {
                      console.log('Appointment creation failed:', apptResult.payload);
                    }
                  }
                  
                  updateProgress();
                  
                } catch (error) {
                  totalAttempts++;
                  errorCount++;
                  updateProgress();
                  
                  if (config.clinicDebug === 1) {
                    console.log('Error creating appointment:', error.message);
                  }
                  
                  // Handle connection reset errors
                  if (error.code === 'ECONNRESET' || error.message.includes('ECONNRESET')) {
                    if (config.clinicDebug === 1) {
                      console.log('Connection reset detected. Waiting 5 seconds before continuing...');
                    }
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                  }
                  
                  // If already scheduled, stop trying
                  if (error.message.includes('already scheduled')) {
                    if (config.clinicDebug === 1) {
                      console.log("Patient already has appointment, stopping");
                    }
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
    
    doAppts().then(() => {
      if (config.clinicDebug === 0) {
        console.log(''); // New line after progress bar
      }
      console.log(`\n=== APPOINTMENT CREATION COMPLETE ===`);
      console.log(`Total Attempts: ${totalAttempts}`);
      console.log(`Successful Appointments: ${successfulAppts}`);
      console.log(`Errors: ${errorCount}`);
      console.log(`Success Rate: ${totalAttempts > 0 ? ((successfulAppts / totalAttempts) * 100).toFixed(1) : 0}%`);
      console.log(`=====================================`);
    });
  }
  
  if (d.toString().trim() === 'r') {
    const testApptRequestAndCreate = async () => {
      let patientIen = "100942";
      let clinicIen = "466";
      
      try {
        console.log('Creating appointment request...');
        var requestResult = await createApptRequest(patientIen, clinicIen);
        console.log('Request ID:', requestResult.requestId);
        
        console.log('Creating appointment...');
        // Get current date/time in EST timezone (where VistA server is located)
        const appointmentDate = new Date();
        const estDate = new Date(appointmentDate.toLocaleString("en-US", {timeZone: "America/New_York"}));
        estDate.setDate(estDate.getDate() + 8); // 1 week from now
        
        const apptResult = await makeAppt(
          patientIen, 
          clinicIen, 
          "123",
          estDate.toLocaleDateString("en-US"), 
          "08:00", 
          "08:30",
          requestResult
        );
        
        if (apptResult.success) {
          console.log('Appointment created successfully!');
          console.log('Appointment ID:', apptResult.appointmentId);
        } else {
          console.log('Appointment creation returned unexpected result:', apptResult.payload);
        }
        
      } catch (error) {
        console.log('Error:', error.message);
      }
    }
    testApptRequestAndCreate();
  }
  
  if (d.toString().trim() === 'u') {
    console.log('Authenticating user...');
    VistaJS.authenticate(logger, vistaConfig, function(error, authResult) {
      if (error) {
        console.log('Authentication failed:', error.message);
      } else {
        console.log('Authentication successful! Getting detailed user info...');
        
        // Now get detailed user information
        getUserInfo().then(userInfo => {
          // Store the complete user info with authentication data
          authenticatedUser = {
            ...authResult,
            ...userInfo
          };
          
          console.log('=== User Information ===');
          console.log('DUZ:', userInfo.duz);
          console.log('Name:', userInfo.name);
          console.log('User Class:', userInfo.userClass);
          console.log('Can Sign Orders:', userInfo.canSign ? 'Yes' : 'No');
          console.log('Is Provider:', userInfo.isProvider ? 'Yes' : 'No');
          console.log('Order Role:', userInfo.orderRole);
          console.log('Service:', userInfo.service);
          console.log('Domain:', userInfo.domain);
          console.log('Station Number:', userInfo.staNum);
          console.log('DTIME:', userInfo.dtime);
          console.log('Web Access:', userInfo.webAccess ? 'Yes' : 'No');
          console.log('Auto Save:', userInfo.autoSave ? 'Enabled' : 'Disabled');
          console.log('Enable Verify:', userInfo.enableVerify ? 'Yes' : 'No');
          console.log('Allow Hold:', userInfo.allowHold ? 'Yes' : 'No');
          console.log('Is RPL:', userInfo.isRpl ? 'Yes' : 'No');
          
          if (userInfo.jobNumber) {
            console.log('Job Number:', userInfo.jobNumber);
          }
          
          console.log('========================');
          
        }).catch(userInfoError => {
          console.log('Failed to get user info:', userInfoError.message);
          // Still store basic auth info even if user info fails
          authenticatedUser = authResult;
        });
      }
    });
  }

})



