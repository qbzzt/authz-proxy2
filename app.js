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

// We store the session in a cookie
app.use(require("cookie-parser")());

// Need UUIDs for session identification
var uuid = require("node-uuid");


// The host for which we are a proxy
var host = "saas-accounting.mybluemix.net";

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();


// The messages to send sessions
var sessionMsg = {};



// If there is a message for the session, respond with it
app.get("/msg", function (req, res) {
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


setInterval(function() {sessionMsg[lastUuid] = {text: "M<b>ess</b>age " + new Date()};}, 10000);



// if you get getMsg.html, set a cookie
app.get('/getMsg.html', /* @callback */ function (req, res, next) {
	lastUuid = uuid.v4();
    res.cookie(SESS_COOKIE, lastUuid);
    next();
});


// serve the files out of ./public as our main files
app.use(express.static(__dirname + '/public'));


// If this is a POST or PUT request, read the body.
// bodyParser.text() normally doesn't deal with all mime types - the type parameter
// forces that behavior
app.put("*", bodyParser.text({type: "*/*"}));
app.post("*", bodyParser.text({type: "*/*"}));

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
	
	var retVal = "";
	
	var proxiedReq = http.request(proxiedReqOpts, function(proxiedRes) {
		proxiedRes.on("data", function(chunk) {retVal += chunk;});
		proxiedRes.on("end", function() {res.send(retVal);});
		proxiedRes.on("error", function(err) {res.send(JSON.stringify(err) + "<hr />" + retVal);});
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

