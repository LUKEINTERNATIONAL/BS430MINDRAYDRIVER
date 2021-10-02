/*Author: Justin Manda/Petros Kayange
 *Org: Luke International
 *
 * A microservice for intergration of BS 430 Mindray based on HL7 protocol with LIMS/IBLIS
 * 
 */

var fs = require('fs');
var path = require("path");
var settings = require(path.resolve(".", "config", "settings.json"));
var mapping = require(path.resolve(".", "config", "bs430_lims_map.json"));
var client = require('node-rest-client').Client;

var net = require('net');
// creates the server
var server = net.createServer();

server.on('close',function(){
    console.log('Server closed !');
});


var options_auth = {
	user: settings.lisUser,
	password: settings.lisPassword
};

var lisPath = settings.lisPath

function sendData(urls){
        var url = encodeURI(urls[0].replace("+", "---"));
        url = url.replace("---", "%2B");
        console.log(url);
        urls.shift();
        (new client(options_auth)).get(url, function (data) {
           if(urls.length > 0){
                sendData(urls);
            }
        });
}



function processData(machineData){
    var data = machineData.toString("ascii").replace("\u000b","").replace("\r\u001c\r","").split("\r"); //a method to convert the data stream
    console.log(data);
    var urls = [];
    var specimenID;
    var measure;
    var measureID;
    var result;
    var results = [];
   

    for (i in data){
        line = data[i];
        if (line.startsWith("OBR"))  {
            specimenID = line.split("|")[2];
            //console.log
        }
        if(line.startsWith("OBX")){
        results.push(line);
        }
   
    }
    console.log("Here are the results");
    console.log(results); 
    console.log(specimenID.replace('$','')); 

    for (i=0;i<results.length;i++){
        measure = mapping[(results[i].split("|")[4])];
        result =  parseFloat(results[i].split("|")[5]).toFixed(2);
        var url = lisPath.replace("#{SPECIMEN_ID}",specimenID.replace('$','')).replace("#{MEASURE_ID}",measure).replace("#{RESULT}",result);
        urls.push(url);
    }
    console.log("Here are the urls");
    console.log(urls);
    //Push results to LIMS
    sendData(urls);
}


server.on('connection', function(socket){

    var address = server.address();
    var port = address.port;
    console.log('Server is listening on address ' + address + ":"+ + port);
    
    socket.on('data',function(data){
        console.log(data.toString("ascii"));
        processData(data);

    });

    socket.on('error',function(error){
        console.log('Error : ' + error);
    });
});

server.on('error',function(error){
    console.log('Error: ' + error);
});

//emits when server is bound with server.listen
server.on('listening',function(){
    console.log('Server is listening!');
});

server.maxConnections = 10;
server.listen(3031);
