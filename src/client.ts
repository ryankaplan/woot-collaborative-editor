/// <reference path='typings/jquery/jquery.d.ts' />
/// <reference path='typings/socketio/client.d.ts' />

$(document).ready(function () {
    var socket = io();
    var clientId = 0;

    var sendMessage = function (message, data): boolean {
        if (clientId === 0) {
            // Wait until we have a client id
            return false;
        }

        socket.emit(message, data);
        return true;
    }

    $('.woot-document').css({
        'background-color': 'red'
    });

    socket.on('chat_message', function (msg) {
        console.log('got a chat message');
    });

    socket.on('client_id', function (myClientId) {
        // got my client id
        clientId = myClientId;
    });
});