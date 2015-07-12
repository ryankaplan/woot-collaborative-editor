/// <reference path='typings/node/node.d.ts' />

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// Serve data out of /static
app.use(express.static(__dirname + '/../../'));

var nextClientId = 1;

io.on('connection', function (socket) {
    // Give the client a client id
    console.log("Sending client id " + nextClientId);
    socket.emit('client_id', nextClientId);
    nextClientId += 1;

    socket.on('chat_message', function (msgData) {
        io.emit('chat_message', msgData);
    });

    socket.on("text_operation", function (msgData) {
        io.emit("text_operation", msgData);
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
