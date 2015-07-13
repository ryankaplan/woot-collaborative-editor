/// <reference path='typings/diff_match_patch/diff_match_patch.d.ts' />
/// <reference path='typings/jquery/jquery.d.ts' />
/// <reference path='typings/socketio/client.d.ts' />
/// <reference path='woottypes.ts' />
var WootDemoPage;
(function (WootDemoPage) {
    var loggingEnabled = true;
    var log = function () {
        var things = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            things[_i - 0] = arguments[_i];
        }
        if (this.console && loggingEnabled) {
            console.log.apply(console, arguments);
        }
    };
    var WCharId = WootTypes.WCharId;
    var WString = WootTypes.WString;
    var WStringOperation = WootTypes.WStringOperation;
    var WOperationType = WootTypes.WOperationType;
    /**
     * A Controller instance is tied to a textarea on the page. To make your
     * <textarea id="collab-doc" /> collaborative, just instantiate a controller
     * for it, like so:
     *
     * var controller = new Controller("#collab-doc");
     *
     * This is how it works:
     *
     * 1. First it tries to get a clientId from the server. Once it has a clientId
     *    it sets contentEditable on the div to true, so that the user can edit its
     *    text.
     * 2. Continuously watch the div for changes. When a change is detected, diff
     *    the textarea content against the last known content. With the help of
     *    WootTypes.WString, turn that diff into WStringOperations and broadcast
     *    those operations to the server.
     * 3. When we receive operations from the server, apply those operations to
     *    our WString instance and apply them to the text in #collab-doc.
     */
    var DocumentController = (function () {
        function DocumentController() {
            log("DocumentController created");
            this._socket = io();
            this._siteId = -1;
            this._operationCounter = 0;
            this._textArea = $("#woot-document");
            this._lastKnownDocumentContent = "";
            this._string = null;
            this._textArea.hide(); // Re-shown in handleReceiveSiteId
            this._socket.on('site_id', this.handleReceiveSiteId.bind(this));
            this._socket.on('text_operation', this.handleRemoteOperation.bind(this));
        }
        DocumentController.prototype.nextCharId = function () {
            this._operationCounter += 1;
            return new WCharId(this._siteId, this._operationCounter);
        };
        DocumentController.prototype.handleReceiveSiteId = function (siteId) {
            log("DocumentController received siteId: ", siteId);
            this._siteId = siteId;
            this._textArea.show();
            this._textArea.attr("contentEditable", "true");
            // TODO(ryan): This is a hack. Sometimes a textarea's val starts out as a newline. Fix this.
            this._textArea.val("");
            this._lastKnownDocumentContent = this._textArea.val();
            this._string = new WString(this.nextCharId.bind(this));
            var syncDocument = function () {
                var newText = this._textArea.val();
                if (newText == this._lastKnownDocumentContent) {
                    log("Returning early from DocumentController.syncDocument. Nothing to do.");
                    return;
                }
                this.handleTextChange(this._lastKnownDocumentContent, newText);
                this._lastKnownDocumentContent = newText;
            }.bind(this);
            // TODO(ryan) we poll the document for changes. This is silly. We should set timeouts
            // to wait for 2s of inactivity and then sync.
            window.setInterval(syncDocument, 2000);
        };
        DocumentController.prototype.handleRemoteOperation = function (jsonOperation) {
            var operation = WStringOperation.decodeJsonOperation(jsonOperation);
            log("[handleRemoteOperation] Entered with operation", operation);
            log(this._string);
            if (operation.opType == 0 /* INSERT */ && this._string.contains(operation.char.id)) {
                log("[handleRemoteOperation] returning early");
                return;
            }
            if (operation.opType == 0 /* INSERT */) {
                log("[handleRemoteOperation] integrating insert");
                this._string.integrateInsertion(operation.char);
            }
            else {
                log("[handleRemoteOperation] integrating delete");
                this._string.integrateDeletion(operation.char);
            }
            // Set this so that we don't think the user made this change and enter
            // a feedback loop
            this._lastKnownDocumentContent = this._string.stringForDisplay();
            this._textArea.val(this._string.stringForDisplay());
        };
        // Sends a message to the server. Returns false if sending failed
        // e.g. if we haven't received our siteId yet.
        DocumentController.prototype.sendMessage = function (message, data) {
            if (this._siteId !== -1) {
                this._socket.emit(message, data);
                return true;
            }
            return false;
        };
        /**
         * This should be called when we notice a change in our text view. It compares the old text
         * against the new, generates the appropriate WStringOperations, and sends them to the server
         * for broadcasting.
         */
        DocumentController.prototype.handleTextChange = function (oldText, newText) {
            var differ = new diff_match_patch();
            // Each `any` is a two-element list of text-operation-type and the text that
            // it applies to, like ["DIFF_DELETE", "monkey"] or ["DIFF_EQUAL", "ajsk"] or
            // ["DIFF_INSERT", "rabbit"]
            var results = differ.diff_main(oldText, newText);
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
        };
        return DocumentController;
    })();
    WootDemoPage.DocumentController = DocumentController;
})(WootDemoPage || (WootDemoPage = {}));
var pageController = null;
$(document).ready(function () {
    pageController = new WootDemoPage.DocumentController("#woot-document");
});
//# sourceMappingURL=client.js.map