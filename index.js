const got = require('got');
const config = require('./env.js');
var stdin = process.openStdin();
//skip cert validation because VA does ssl packet inspection. 
//Not sure why here as all internal but skipping for now, research later.
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
//Functions...
function upload(objt){
 return new Promise(function(resolve,reject){
  console.log('base',objt)
  got.post(config.url+'/api/auth/token',
          {json:{
            "key":config.key,
            "stationNo": config.stationNo,
            "duz": config.duz
          }
          }).then(function(data){
              got.post(config.url+'/api/v1/xrpc/xcte',
              {headers:{'authorization':'Bearer '+JSON.parse(data.body).payload.token},
              json:{
                "context" : "SDESRPC",
                "rpc" : "SDES CREATE CLINIC",
                "jsonResult" : "FALSE",
                "parameters" : objt
              }}).then(function(data){
                var jsonData = JSON.parse(data.body);
                console.log(jsonData)
             resolve(jsonData)
              }).catch(function (error) {
                console.log(error);
            });
            });
          }) 
}
function getClinics(){

  return new Promise(function(resolve,reject){
 
  got.post(config.url+'/api/auth/token',
          {json:{
            "key":config.key,
            "stationNo": config.stationNo,
            "duz": config.duz
          }
          }).then(function(data){
              got.post(config.url+'/api/v1/xrpc/xcte',
              {headers:{'authorization':'Bearer '+JSON.parse(data.body).payload.token},
              json:{
                "context" : "SDECRPC",
                "rpc" : "SDEC RESCE",
                "jsonResult" : "FALSE",
                "parameters" : [""]
              }}).then(function(data){
                var jsonData = JSON.parse(data.body);
               var resp = jsonData.payload
               if (resp){
               var respArr = resp.split(String.fromCharCode(30));
               var header = respArr[0].split("^");
               header = header.map(element=>element.substr(6))
               respArr.shift()
               var dataArr =[]
               respArr.forEach(function(e){
                   var rec = e.split("^")
                   dataArr.push(rec)
               })
               var list = []
               dataArr.forEach(function(e,i){
                   var rec ={}
                   e.forEach(function(c,f){
                     rec[header[f]]=c
                   })
                   list.push(rec)
               })
                 resolve(list)
               }
             })
            })



          }) 
}
function getRandName(letter,number){

  return new Promise(function(resolve,reject){
 
  got.post(config.url+'/api/auth/token',
          {json:{
            "key":config.key,
            "stationNo": config.stationNo,
            "duz": config.duz
          }
          }).then(function(data){
              got.post(config.url+'/api/v1/xrpc/xcte',
              {headers:{'authorization':'Bearer '+JSON.parse(data.body).payload.token},
              json:{
                "context" : "SDECRPC",
                "rpc" : "SDEC GET PATIENT DEMOG",
                "jsonResult" : "false",
                "parameters" : [ letter,
                "200",
                ""]
               
              }}).then(function(data){
                var jsonData = JSON.parse(data.body);
               var resp = jsonData.payload
               if (resp){
               var respArr = resp.split(String.fromCharCode(30));
               var header = respArr[0].split("^");
               header = header.map(element=>element.substr(6))
               respArr.shift()
               var dataArr =[]
               respArr.forEach(function(e){
                   var rec = e.split("^")
                   dataArr.push(rec)
               })
               var list = []
               dataArr.forEach(function(e,i){
                   var rec ={}
                   e.forEach(function(c,f){
                     rec[header[f]]=c
                   })
                   list.push(rec)
               })
                console.log('length',list.length)
                if(list.length > number){
                  resolve(list[number])
                }else{
                  //sometimes I get a bad record on my parse above, need to revisit. shortcut for now.
                  if(list.length>2){
                    resolve(list[1]);
                  }else{
                    resolve(null)
                  }
                 
                }
                
               }
             })
            })



          }) 
}
function uploadGrid(ien,day){

  return new Promise(function(resolve,reject){
  console.log('processing',ien)
  got.post(config.url+'/api/auth/token',
          {json:{
            "key":config.key,
            "stationNo": config.stationNo,
            "duz": config.duz
          }
          }).then(function(data){
              got.post(config.url+'/api/v1/xrpc/xcte',
              {headers:{'authorization':'Bearer '+JSON.parse(data.body).payload.token},
              json:{
                "context" : "SDESRPC",
                "rpc" : "SDES CREATE CLIN AVAILABILITY",
                "jsonResult" : "TRUE",
                "parameters" : [ ien,
                              "2022-04-"+day+";9999999",
                              "0800-1600",
                              "10",
                              "SSS"
                          ]
               
              }}).then(function(data){
                var jsonData = JSON.parse(data.body);
                console.log(jsonData)
             resolve(jsonData)
              }).catch(function (error) {
                console.log(error);
            });
            });
          }) 
}
function makeAppt(ien,clinicIen,resourceIen,date,start,end){

  return new Promise(function(resolve,reject){
  console.log('processing',ien,clinicIen,resourceIen,date,start,end)
  got.post(config.url+'/api/auth/token',
          {json:{
            "key":config.key,
            "stationNo": config.stationNo,
            "duz": config.duz
          }
          }).then(function(data){
              got.post(config.url+'/api/v1/xrpc/xcte',
              {headers:{'authorization':'Bearer '+JSON.parse(data.body).payload.token},
              json:{
                "context" : "SDECRPC",
                "rpc" : "SDEC APPADD",
                "jsonResult" : "false",
                "parameters" : [date+"@"+start,
                date+"@"+end,
                  ien,
                  resourceIen,
              "30",
              "auto-created",
              "",
              "false",
              "08/18/2022@09:00",
              "PROVIDER",
              "",
              "",
              "991",
              "A",
              "No",
              "0",
              "",
              clinicIen,
              "",
              "",
              "",
              "",
              "",
              "",
              "Yes"
              ]
               
              }}).then(function(data){
                var jsonData = JSON.parse(data.body);
               // console.log(jsonData)
                  resolve(jsonData)
              }).catch(function (error) {
                console.log(error);
            });
            });
          }) 
}
function checklAvail(ien){

  return new Promise(function(resolve,reject){
  console.log('processing',ien)
  got.post(config.url+'/api/auth/token',
          {json:{
            "key":config.key,
            "stationNo": config.stationNo,
            "duz": config.duz
          }
          }).then(function(data){
              got.post(config.url+'/api/v1/xrpc/xcte',
              {headers:{'authorization':'Bearer '+JSON.parse(data.body).payload.token},
              json:{
                "context" : "SDESRPC",
                "rpc" : "SDES GET CLIN AVAILABILITY",
                "jsonResult" : "TRUE",
                "parameters" : [ ien,
                "08/15/2022@0:00",
                "08/19/2023@0:00"
                              
                          ]
               
              }}).then(function(data){
                var jsonData = JSON.parse(data.body);
                console.log('FM Date^start time^end time^availability')
                console.log(jsonData.payload)
             resolve(jsonData)
              }).catch(function (error) {
                console.log(error);
            });
            });
          }) 
}
function listClinics(){
    got.post(config.url+'/api/auth/token',
     {json:{
      "key":config.key,
      "stationNo": config.stationNo,
      "duz": config.duz
     }
     }).then(function(data){
         got.post(config.url+'/api/v1/xrpc/xcte',
         {headers:{'authorization':'Bearer '+JSON.parse(data.body).payload.token},
         json:{
           "context" : "SDECRPC",
           "rpc" : "SDEC RESCE",
           "jsonResult" : "FALSE",
           "parameters" : [""]
         }}).then(function(data){
            var jsonData = JSON.parse(data.body);
           var resp = jsonData.payload
           if (resp){
           var respArr = resp.split(String.fromCharCode(30));
           var header = respArr[0].split("^");
           header = header.map(element=>element.substr(6))
           respArr.shift()
           var dataArr =[]
           respArr.forEach(function(e){
               var rec = e.split("^")
               dataArr.push(rec)
           })
           var list = []
           dataArr.forEach(function(e,i){
               var rec ={}
               e.forEach(function(c,f){
                 rec[header[f]]=c
               })
               list.push(rec)
           })
           list.forEach(element => {
             console.log(element)
           });
            
           }
         }).catch(function(err){
           console.log(err)})
     }).catch(function (error) {
      console.log('error') 
      console.log(error);
   });
 
  }


//main
console.log('c-create clinics;l-list clinics,a-check avialability,m-make appts.,g-makegrid')
stdin.addListener("data", function (d) {
    if (d.toString().trim() === 'c') {
      const doConfig = async () => {
        var obj=config.config.default
        ///todo:-no looping of clinic #. 
        var clinics=config.config.clinics
        console.log(clinics.length)
        for (var i=0;i<clinics.length;i++){
          obj[0]=config.config.base+clinics[i][0]+'/'+config.config.each
          obj[1]=clinics[i][1]+"/"+config.config.each
          obj[2]=clinics[i][2]+" "+config.config.each
          obj[9]=clinics[i][3]
          await upload(obj)
         }
       }
      doConfig()
    }
    if (d.toString().trim() === 'g') {
      const doGrid = async () => {
      //todo: Get the clinics and loop through.  
      // var iens=config.config.clinicien
      var iens=config.config.deviens
      console.log(iens.length)
    
      for (var i=0;i<iens.length;i++){
        console.log(iens[i])
        for (var e=18;e<26;e++){
        await uploadGrid(iens[i],e)
        }
      }
    }
    doGrid()
    }
    if (d.toString().trim() === 'a') {
    
    const doAvail = async () => {
      var iens=config.config.clinicien
      console.log(iens.length)
      for (var i=0;i<iens.length;i++){
       await checklAvail(iens[i])
      }
    }
    doAvail()
    }
    if (d.toString().trim() === 'm') {
    let apptDays=31
    const doAppts = async () => {
      //get clinics
      var clinics =  await getClinics()
      console.log(clinics.length)
      //ToDo: Get Clinics from VistA
      //var iens=config.config.clinicien
      var iens=config.config.deviens
      for (var i=0;i<iens.length;i++){
        //get resource id
        var result  = clinics.filter(function(o){return o.HOSPITAL_LOCATION_ID == iens[i];} );
        //get random letter
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        let letter = characters.charAt(Math.floor(Math.random() * characters.length))
        //get random number between 1 and 200
        let number = Math.floor(Math.random() * 20) + 1
        console.log(letter,number)
        //get random name of patient based on random letter and number
        let name = await getRandName(letter,number)
        if(name){
          console.log(name)
          if(name.IEN){
            //get date/time
            //Todo: Random Date Time so not sequential
            for (var e=0;e<apptDays;e++){
            var date = new Date();
            // add 1 day
            if(e>0){
              date.setDate(date.getDate() + e);
            }
            //for now, date/time fixed.
            //To do: Loop through slots and fill them.  I have been just manually changing it 
            const start="14:30"
            const end="15:00"
            var apptResult =  await makeAppt(name.IEN,result[0].HOSPITAL_LOCATION_ID,result[0].RESOURCEID,date.toLocaleDateString("en-US"),start,end)
            //If already booked a this time exit.
            //Todo: Pick a new patient. 
            if(apptResult.payload.indexOf("already scheduled")!==-1){
              console.log("duplicate appt aborting")
              break
              }
            console.log(apptResult.payload)
            }
          }
        }
      }
    }
    doAppts()
    }
    if (d.toString().trim() === 'l') {
      listClinics()
    }
  })



