/*Author: Gift Malolo
 *Org: Elizabeth Glazer Pediatric Foundation
 *
 *Driver for Genexpert Machine, a machine that analyzes Viral load, TB, HPV, Covid
 *This driver is built around ASTM protocol, therefore relays on acknwoledgment upon every data byte being transfered.
 *Take note, the bytes being transfered has start point, the message body and finally the end point, therefore this driver checks for this to determine the actual message
 *
 */

var fs = require('fs');
var path = require("path");
var settings = require(path.resolve(".", "config", "settings.json"));
var mapping = require(path.resolve(".", "config", "mapping.json"));
var client = require('node-rest-client').Client;

var net = require('net');
const ACK_BUFFER = new Buffer([6]);
const ENQ = 5;
const STX = 2;
const LF = 10;
const CR = 13;
const EOT = 4;

// creates the server
var server = net.createServer();

server.on('close',function(){
    console.log('Server closed !');
});


var options_auth = {
	user: settings.lisUser,
	password: settings.lisPassword
};

var urls = [];


// emitted when new client connects
var transmission = [];

function processResults(arr) {
        
    if (arr.length == 0) return;
    var assays = ["MTB","Rif Resistance","COV-2","EID","Viral Load"];
	
    var data = arr.join("")
    data = data.replace(/\x02/g, "<STX>")
    data = data.replace(/\x03/g, "<ETX>")
    data = data.replace(/\x04/g, "<EOT>")
    data = data.replace(/\x17/g, "<ETB>")

    data = data.replace(/\n/g, "<LF>");
    data = data.replace(/\r/g, "<CR>");

    //Handle Text Transmission Blocks
    data = data.replace(/<ETB>\w{2}<CR><LF>/g, "").replace(/<STX>/g, "");

    //Split to get ASTM lines
    data = data.split(/<CR>/);
    //console.log(data);
    var sampleId = "";
    var results = {};
    for (var i = 0; i < data.length; i++) {
        var line = data[i];
		console.log(line);
		console.log("---------");
        if (line.startsWith("O") && sampleId == "") {
            var segments = line.split("|");
            sampleId = segments[2];
	    results[sampleId] = {}
        }

        if (line.match(/^\d*R/)) {

            var segments = line.split("|");
            for (var a = 0; a < assays.length; a++) {
				var assy = segments[2].split("^")[3];
  				if (assays[a] == "EID"){
				  assy = segments[2].split("^")[1];
				}
				if(assy == "Rif Resistance" || assy == "MTB"){
						if (segments[2] && segments[8] == "F" && (segments[1] == "1" || segments[1] == "20")) {		
							var rst = segments[3].split("^")[0].replace(/\d+/g, "");		
							    
							var link = settings.lisPath;
							link = link.replace(/\#\{SPECIMEN_ID\}/, sampleId);
							var uri = link.replace(/\#\{MEASURE_ID\}/, mapping[assy]);
							uri = uri.replace(/\#\{RESULT\}/, rst);
							urls.push(uri);
							
						}
				}else if(assy == "SARS CO2V 19" || assy == "SARS COV 19" || assy == "SARS C2OV 19" || assy == "SARS COV 219" || assy == "SA2RS COV 19" || assy == "SARS 2COV 19")
				{
					if (segments[2] && segments[8] == "F" && (segments[1] == "1")) {		
						var rst = segments[3].split("^")[0].replace(/\d+/g, "");		
						   
						var link = settings.lisPath;
						link = link.replace(/\#\{SPECIMEN_ID\}/, sampleId);
						var uri = link.replace(/\#\{MEASURE_ID\}/, mapping["COV-2"]);
						uri = uri.replace(/\#\{RESULT\}/, rst);
						urls.push(uri);
						
					}
				}else if (assy == "Viral L2oad" || assy == "Viral2 Load" || assy == "Viral Load" || assy == "V2iral Load" || assy =="Viral Load2"){

					if (segments[2] && segments[8] == "F" && (segments[1] == "1") || segments[1] == "21") {
                                                var rst = segments[3].split("^")[0].replace(/\d+/g, "");
						console.log(rst.length);
						
						if(rst.length == 0){
						  rst = segments[3].split("^")[1];
						  rst = rst +" "+ segments[4];
						}else
						{
						  var units = segments[6] +" "+ segments[5].split("to")[0] +" "+ segments[4]; 
						  rst = rst +" "+ units;
                                                }
						var link = settings.lisPath;
						link = link.replace(/\#\{SPECIMEN_ID\}/, sampleId);
                                                var uri = link.replace(/\#\{MEASURE_ID\}/, mapping["COV-2"]);
                                                uri = uri.replace(/\#\{RESULT\}/, rst);
                                                urls.push(uri);

                                        }

				}else if (assy == "EID" || assy == "EID-Test"){

					  if (segments[2] && segments[8] == "F" && (segments[1] == "1")) {
                                                var rst = segments[3].split("^")[0].replace(/\d+/g, "");

                                                var link = settings.lisPath;
                                                link = link.replace(/\#\{SPECIMEN_ID\}/, sampleId);
                                                var uri = link.replace(/\#\{MEASURE_ID\}/, mapping["EID"]);
                                                uri = uri.replace(/\#\{RESULT\}/, rst);
                                                urls.push(uri);

                                        }

				}
			}
			
        }
    }

	//send results to server
    return urls;
}

function sendData(urls){
	var url = encodeURI(urls[0].replace("+", "---"));
	url = url.replace("---", "%2B");
	urls.shift();
	console.log(url);
	(new client(options_auth)).get(url, function (data) {
		if(urls.length > 0){
			sendData(urls);
		}
});
}

function handleData(data, socket) {

    var received = data.toString("ascii");
    var code = received.charCodeAt(0);
    transmission.push(received);
    if (code == ENQ) {
        //console.log("ENQ");
        transmission = []
        socket.write(ACK_BUFFER);
    } else if (code == EOT) {
        //console.log("EOT");
        results = processResults(transmission);
		if(results.length > 0){
			sendData(results);
		}
		console.log("-------------------");
		console.log(results);
		urls = [];
	//Write results to database

        socket.write(ACK_BUFFER);
        transmission = [];
	
    } else if (code == STX) {

        socket.write(ACK_BUFFER);
    }
}

server.on('connection', function(socket){

    var address = server.address();
    var port = address.port;
    console.log('Server is listening on address ' + address + ":"+ + port);

    socket.on('data',function(data){

        handleData(data, socket);

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
