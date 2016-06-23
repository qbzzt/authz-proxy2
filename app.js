/*eslint-env node, querystring, express*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------


// The name of the cookie to use for sessions
var SESS_COOKIE = "authproxy_session_cookie";

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

// create a new express server
var app = express();


// We need to send HTTP requests
var http = require("http");

// Express parses the query string for us automatically. Unfortunately, we don't need it
// parsed. If it exists, we need to relay it to the final destination.
var qs = require("querystring");

// If the back end application uses POST, we need to read the data.
// Note that body-parser does not handle multi-part bodies, so if the
// proxied application uses them, you need a different solution
var bodyParser = require("body-parser");


// Need UUIDs for session identification
var uuid = require("node-uuid");


// The host for which we are a proxy
var host = "saas-accounting.mybluemix.net";

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();


// The messages to send sessions
var sessionMsg = {};


var sendSessionMsg = function(id, html) {
	sessionMsg[id] = {text: html};
};


// If there is a message for the session, respond with it
app.get("/msg", require("cookie-parser")(), function (req, res) {
	var id = req.cookies[SESS_COOKIE];
	var msg = sessionMsg[id];
	if (typeof msg === "undefined") {
		res.send(""); // No message
	} else {
		sessionMsg[id] = undefined;
		res.send(msg.text);
	}
});


var lastUuid = "0";


setInterval(function() {sendSessionMsg(lastUuid, "M<b>ess</b>age " + new Date());}, 10000);



// If you get getMsg.html, set a cookie and set lastUuid to send it messages
app.get('/getMsg.html', /* @callback */ function (req, res, next) {
	lastUuid = uuid.v4();
    res.cookie(SESS_COOKIE, lastUuid);
    next();
});


// If you get proxyMsg.html, also set the cookie - but don't use lastUuid because
// the messages proxyMsg.html gets are relevant to the connection
app.get('/proxyMsg.html', /* @callback */ function (req, res, next) {
    res.cookie(SESS_COOKIE, uuid.v4());
    next();
});


app.get('/proxyMsg2.html', /* @callback */ function (req, res, next) {
    res.cookie(SESS_COOKIE, "aaa:" + uuid.v4());
    next();
});



// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));


// If this is a POST or PUT request, read the body.
// bodyParser.text() normally doesn't deal with all mime types - the type parameter
// forces that behavior
app.put("*", bodyParser.text({type: "*/*"}));
app.post("*", bodyParser.text({type: "*/*"}));


// Authorize some requests, reject others
app.get("/transaction/:amt/:debit/:credit", require("cookie-parser")(), function(req, res, next) {
    var amt = parseInt(req.params.amt, 10);
     
    if (amt >= 10000) {
    	// Send the user a message that this is unauthorized
    	sendSessionMsg(req.cookies[SESS_COOKIE], "Over the authorized limit");
    	
    	if (req.cookies[SESS_COOKIE].length === 36)
    		// res.send closes the connection
        	res.send("");
        else
	        res.redirect("/transaction/0/a/a");
    } else
        next();
});

// Proxy everything
app.all("*", function(req, res) {
	var headers = req.headers;
	headers["host"] = host;
	
	// Deal with the query is there is one. Don't add any
	// characters if there isn't.
	var query = "";
	if (req.query) 
		query = "?" + qs.stringify(req.query);
	
	// The options that go in the HTTP header
	var proxiedReqOpts = {
	      host: host,
	      path: req.path + query,
	      method: req.method,
	      headers: headers
	};
			
	var proxiedReq = http.request(proxiedReqOpts, function(proxiedRes) {
		var retVal = "";
		
		proxiedRes.on("data", function(chunk) {
			console.log("Got a chunk of " + req.path + " with:" + chunk);
			retVal += chunk;
		});
		proxiedRes.on("end", function() {
			
			// Sometimes we receive an end event before the actual data, I don't know
			// why - but the easiest solution is to redirect to the same place.
			if (retVal === "") {
				console.log("End called with an empty retVal :-(");
				res.redirect(req.path + query);
			} else {
				console.log("Responding to " + req.path + " with:" + retVal);
				res.send(retVal);
			}

		});
		proxiedRes.on("error", function(err) {
			console.log("ERROR: " + req.path + " failed with:" + JSON.stringify(err));			
			res.send(JSON.stringify(err) + "<hr />" + retVal);
		});
	});
	
	

	// POST requests have a body
	if (req.method === "POST" || req.method === "PUT")
		proxiedReq.write(req.body);
			
	proxiedReq.end();
});



// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function() {

	// print a message when the server starts listening
   console.log("server starting on " + appEnv.url);
});

