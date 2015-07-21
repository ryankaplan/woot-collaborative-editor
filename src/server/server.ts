/// <reference path='typings/node/node.d.ts' />

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// Serve data out of /static
app.use(express.static(__dirname + '/../../'));

var nextSiteId = 1;

io.on('connection', function (socket) {
    // Give the client a client id
    socket.emit('site_id', nextSiteId);
    nextSiteId += 1;

    // msgData is a list of WStringOperation instances
    socket.on("text_operations", function (msgData) {
        io.emit("text_operations", msgData);
    })
});

app.get('/', function (req, res) {
    res.writeHead(302, {
        'Location': '/html/wootdocument.html'
    });
    res.end();
});


http.listen(3000, function () {
    console.log('listening on *:3000');
});
