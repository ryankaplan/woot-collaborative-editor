/// <reference path='typings/diff_match_patch/diff_match_patch.d.ts' />
/// <reference path='typings/jquery/jquery.d.ts' />
/// <reference path='typings/socketio/client.d.ts' />
/// <reference path='woottypes.ts' />

/*
 This is how it works. We have a div with id #woot-document.
 It has contentEditable set to true. So we listen for change
 events on this div. Every time we get a change event we...

 1. Diff its content against its last known content
 2. From that diff, generate add and delete ops
 3. Put those add and delete ops into our Model
 4. Verify that the new output of the model is what's in the page
 */

module WootDemoPage {
    var loggingEnabled = false;
    var log = function (...things: Array<any>) {
        if (this.console && loggingEnabled) {
            console.log.apply(console, arguments);
        }
    };

    import WCharId = WootTypes.WCharId;
    import WString = WootTypes.WString;
    import WStringOperation = WootTypes.WStringOperation;
    import WOperationType = WootTypes.WOperationType;

    export class Controller {
        _socket: io;
        _clientId: number;
        _counter: number;
        _lastKnownDocumentContent = "";
        _string: WString;
        _textDiv: any;

        constructor() {
            this._socket = io();
            this._clientId = -1;
            this._counter = 0;
            this._socket.on('client_id', function (myClientId) {
                this._clientId = myClientId;
                this.startSyncing();
            }.bind(this));

            this._socket.on('text_operation', function (operation) {
                this.handleRemoteOperation(operation);
            }.bind(this));

            this._textDiv = $("#woot-document");
        }

        handleRemoteOperation(jsonOperation) {
            var operation = WStringOperation.decodeJsonOperation(jsonOperation);

            log("[handleRemoteOperation] Entered with operation", operation);
            log(this._string);
            if (operation.opType == WOperationType.INSERT && this._string.contains(operation.char.id)) {
                log("[handleRemoteOperation] returning early");
                return;
            }

            if (operation.opType == WOperationType.INSERT) {
                log("[handleRemoteOperation] integrating insert");
                this._string.integrateInsertion(operation.char);
            } else {
                log("[handleRemoteOperation] integrating delete");
                this._string.integrateDeletion(operation.char);
            }

            // Set this so that we don't think the user made this change and enter
            // a feedback loop
            this._lastKnownDocumentContent = this._string.stringForDisplay();
            this._textDiv.val(this._string.stringForDisplay());
        }

        startSyncing() {
            log("[client id = " + this._clientId + ", counter = ", this._counter + "]");

            this._string = new WString(function () {
                this._counter += 1;
                return new WCharId(this._clientId, this._counter);
            }.bind(this));

            // Sometimes it starts with a return? Why is that?
            this._textDiv.val("");

            this._lastKnownDocumentContent = this._textDiv.val();
            var syncDocument = function() {
                log("About to sync...");
                var newText = this._textDiv.val();
                if (newText == this._lastKnownDocumentContent) {
                    log("Nothing to do!");
                    return;
                }
                log("NEW TEXT", newText);
                log("NEW TEXT LENGTH, ", newText.length);
                this.handleTextChange(this._lastKnownDocumentContent, newText);
                this._lastKnownDocumentContent = newText;
            }.bind(this);

            // TODO(ryan) we poll the document for changes. This is silly. We should set timeouts
            // to wait for 2s of inactivity and then sync.
            window.setInterval(syncDocument, 2000);
            this._textDiv.attr("contentEditable", "true");
        }

        // Sends a message to the server. Returns false if sending failed
        // e.g. if we haven't received our clientId yet.
        sendMessage(message: string, data: any): boolean {
            if (this._clientId !== -1) {
                this._socket.emit(message, data);
                return true;
            }
            return false;
        }

        /**
         * This should be called when we notice a change in our text view. It compares the old text
         * against the new, generates the appropriate WStringOperations, and sends them to the server
         * for broadcasting.
         */
        handleTextChange(oldText: string, newText: string) {
            var differ = new diff_match_patch();

            // Each `any` is a two-element list of text-operation-type and the text that
            // it applies to, like ["DIFF_DELETE", "monkey"] or ["DIFF_EQUAL", "ajsk"] or
            // ["DIFF_INSERT", "rabbit"]
            var results: Array<Array<any>> = differ.diff_main(oldText, newText);

            // Turn the results into a set of operations that our woot algorithm understands
            var cursorLocation = 0;
            for (var i = 0; i < results.length; i++) {
                var op = results[i][0];
                var text = results[i][1];

                if (op == DIFF_DELETE) {
                    for (var j = 0; j < text.length; j++) {
                        log("Delete char " + text[j] + " at index " + cursorLocation);
                        var operation = this._string.generateDeleteOperation(text[j], cursorLocation);
                        this.sendMessage("text_operation", operation);
                        // cursorLocation doesn't change. We moved forward one character in the string
                        // but deleted that character, so our 'index' into the string hasn't changed.
                    }
                }

                else if (op == DIFF_INSERT) {
                    for (var j = 0; j < text.length; j++) {
                        log("Insert char " + text[j] + " after char at index " + cursorLocation);
                        var operation = this._string.generateInsertOperation(text[j], cursorLocation);
                        this.sendMessage("text_operation", operation);
                        cursorLocation += 1;
                    }
                }

                else if (op == DIFF_EQUAL) {
                    cursorLocation += text.length;
                }
            }
        }
    }
}

var pageController = null;
$(document).ready(function () {
    pageController = new WootDemoPage.Controller();
});
