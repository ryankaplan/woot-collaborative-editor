/// <reference path='typings/diff_match_patch/diff_match_patch.d.ts' />
/// <reference path='typings/jquery/jquery.d.ts' />
/// <reference path='typings/socketio/client.d.ts' />

/*
 This is how it works. We have a div with id #woot-document.
 It has contentEditable set to true. So we listen for change
 events on this div. Every time we get a change event we...

 1. Diff its content against its last known content
 2. From that diff, generate add and delete ops
 3. Put those add and delete ops into our Model
 4. Verify that the new output of the model is what's in the page
 */

class DocumentPageController {
    _socket: io;
    _clientId: number;

    constructor() {
        this._socket = io();
        this._clientId = 0;
        this._socket.on('client_id', function (myClientId) {
            this._clientId = myClientId;
        });
    }

    // Returns whether the send was successful
    sendMessage(message: string, data: any): boolean {
        if (this._clientId === 0) {
            // Wait until we have a client id
            return false;
        }

        this._socket.emit(message, data);
        return true;
    }

    // Called when text in input changes
    handleTextChange(oldText: string, newText: string) {
        var differ = new diff_match_patch();

        // Each `any` is a two-element list of text-operation-type and the text that
        // it applies to, like ["DIFF_DELETE", "monkey"] or ["DIFF_EQUAL", "ajsk"] or
        // ["DIFF_INSERT", "rabbit"]
        var results: Array<Array<any>> = differ.diff_main("hello", "hel monkey oh");

        // Turn the results into a set of operations that our woot algorithm understands
        var cursorLocation = 0;
        for (var i = 0; i < results.length; i++) {
            var op = results[i][0];
            var text = results[i][1];

            if (op == DIFF_DELETE) {
                for (var j = 0; j < text.length; j++) {
                    console.log("Delete char " + text[j] + " at index " + cursorLocation);
                    cursorLocation -= 1;
                }
            }

            else if (op == DIFF_INSERT) {
                for (var j = 0; j < text.length; j++) {
                    console.log("Insert char " + text[j] + " after char at index " + cursorLocation);
                    cursorLocation += 1;
                }
            }

            else if (op == DIFF_EQUAL) {
                cursorLocation += text.length;
            }
        }
    }
}

var pageController = null;
$(document).ready(function () {
    pageController = new DocumentPageController();
});
