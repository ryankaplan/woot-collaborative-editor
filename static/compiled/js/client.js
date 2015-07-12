/// <reference path='typings/diff_match_patch/diff_match_patch.d.ts' />
/// <reference path='typings/jquery/jquery.d.ts' />
/// <reference path='typings/socketio/client.d.ts' />
var WCharId = (function () {
    function WCharId(site, clock) {
        this.site = site;
        this.clock = clock;
    }
    WCharId.prototype.toString = function () {
        return this.site + "/" + this.clock;
    };
    WCharId.decodeJsonCharId = function (jsonChar) {
        return new WCharId(jsonChar.site, jsonChar.clock);
    };
    return WCharId;
})();
var WChar = (function () {
    function WChar(id, character, previous, next) {
        this.id = id;
        this.visible = true;
        this.character = character;
        this.previous = previous;
        this.next = next;
    }
    WChar.decodeJsonChar = function (jsonChar) {
        var id = WCharId.decodeJsonCharId(jsonChar.id);
        var previous = WCharId.decodeJsonCharId(jsonChar.previous);
        var next = WCharId.decodeJsonCharId(jsonChar.next);
        var char = new WChar(id, jsonChar.character, previous, next);
        char.visible = jsonChar.visible;
        return char;
    };
    WChar.prototype.isBegin = function () {
        return this.id.site == -1 && this.id.clock == 0;
    };
    WChar.prototype.isEnd = function () {
        return this.id.site == -1 && this.id.clock == 1;
    };
    WChar.begin = function () {
        var id = new WCharId(-1, 0);
        return new WChar(id, "", id, id);
    };
    WChar.end = function () {
        var id = new WCharId(-1, 1);
        return new WChar(id, "", id, id);
    };
    return WChar;
})();
var WOperationType;
(function (WOperationType) {
    WOperationType[WOperationType["INSERT"] = 0] = "INSERT";
    WOperationType[WOperationType["DELETE"] = 1] = "DELETE";
})(WOperationType || (WOperationType = {}));
var WStringOperation = (function () {
    function WStringOperation(type, char) {
        this.type = type;
        this.char = char;
    }
    WStringOperation.decodeJsonOperation = function (operation) {
        var type = operation.type;
        var char = WChar.decodeJsonChar(operation.char);
        return new WStringOperation(type, char);
    };
    return WStringOperation;
})();
var WString = (function () {
    function WString(idGenerator) {
        this._idGenerator = idGenerator;
        this._chars = [];
        this._seenIds = {};
        var begin = WChar.begin();
        var end = WChar.end();
        this._chars.push(begin);
        this._chars.push(end);
        this._seenIds[begin.toString()] = true;
        this._seenIds[end.toString()] = true;
    }
    WString.prototype.generateInsertOperation = function (char, position) {
        console.log("[generateInsertOperation] Entered with char ", char, "and position ", position);
        var nextId = this._idGenerator();
        var previous = this.ithVisible(position);
        console.log("[generateInsertOperation] Previous", previous);
        var next = this.ithVisible(position + 1);
        console.log("[generateInsertOperation] Next", next);
        var newChar = new WChar(nextId, char, previous.id, next.id);
        console.log("[generateInsertOperation] newChar", newChar);
        this.integrateInsertion(newChar);
        return new WStringOperation(0 /* INSERT */, newChar);
    };
    WString.prototype.generateDeleteOperation = function (char, position) {
        var charToDelete = this.ithVisible(position + 1);
        this.integrateDeletion(charToDelete);
        return new WStringOperation(1 /* DELETE */, charToDelete);
    };
    WString.prototype.ithVisible = function (position) {
        console.log("[ithVisible] position ", position);
        var foundSoFar = -1;
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            if (char.visible) {
                foundSoFar += 1;
                console.log("foundSoFar ", foundSoFar, " char ", char);
                if (foundSoFar == position) {
                    return this._chars[i];
                }
            }
        }
        throw Error("There is no " + position + "th visible char!");
    };
    WString.prototype.contains = function (id) {
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            console.log("Comparing ", char.id.toString(), id.toString());
            if (char.id.toString() == id.toString()) {
                return true;
            }
        }
        return false;
    };
    WString.prototype.isExecutable = function (op) {
        if (op.type == 0 /* INSERT */) {
            return this.contains(op.char.previous) && this.contains(op.char.next);
        }
        else if (op.type == 1 /* DELETE */) {
            return this.contains(op.char.id);
        }
        else {
            throw Error("Unrecognized operation type " + op.type);
        }
    };
    // TODO(ryan): This is not at all to the paper specification and will do the wrong thing in many cases
    WString.prototype.integrateInsertion = function (newChar) {
        console.log("[integrateInsertion] begin");
        this._seenIds[newChar.id.toString()] = true;
        console.log("[integrateInsertion] chars", this._chars);
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            if (char.id.toString() == newChar.previous.toString()) {
                // splice replaces the element at its first index. We want to insert
                // at the location one after, i.e. i + 1.
                this._chars.splice(i + 1, 0, newChar);
                console.log("[integrateInsertion] chars", this._chars);
                return;
            }
        }
        throw Error("Didn't find previous in integrateInsertion!");
    };
    WString.prototype.integrateDeletion = function (charToDelete) {
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            if (char.id.toString() == charToDelete.id.toString()) {
                char.visible = false;
            }
        }
    };
    WString.prototype.stringForDisplay = function () {
        var result = "";
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            if (!char.visible) {
                continue;
            }
            result += char.character;
        }
        return result;
    };
    return WString;
})();
/*
 This is how it works. We have a div with id #woot-document.
 It has contentEditable set to true. So we listen for change
 events on this div. Every time we get a change event we...

 1. Diff its content against its last known content
 2. From that diff, generate add and delete ops
 3. Put those add and delete ops into our Model
 4. Verify that the new output of the model is what's in the page
 */
var DocumentPageController = (function () {
    function DocumentPageController() {
        this._lastKnownDocumentContent = "";
        this._socket = io();
        this._clientId = 0;
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
    DocumentPageController.prototype.handleRemoteOperation = function (jsonOperation) {
        var operation = WStringOperation.decodeJsonOperation(jsonOperation);
        console.log("[handleRemoteOperation] Entered with operation", operation);
        console.log(this._string);
        if (operation.type == 0 /* INSERT */ && this._string.contains(operation.char.id)) {
            console.log("[handleRemoteOperation] returning early");
            return;
        }
        if (operation.type == 0 /* INSERT */) {
            console.log("[handleRemoteOperation] integrating insert");
            this._string.integrateInsertion(operation.char);
        }
        else {
            console.log("[handleRemoteOperation] integrating delete");
            this._string.integrateDeletion(operation.char);
        }
        // Set this so that we don't think the user made this change and enter
        // a feedback loop
        this._lastKnownDocumentContent = this._string.stringForDisplay();
        this._textDiv.text(this._string.stringForDisplay());
    };
    DocumentPageController.prototype.startSyncing = function () {
        console.log("[client id = " + this._clientId + ", counter = ", this._counter + "]");
        this._string = new WString(function () {
            this._counter += 1;
            return new WCharId(this._clientId, this._counter);
        }.bind(this));
        // Sometimes it starts with a return? Why is that?
        this._textDiv.text("");
        this._lastKnownDocumentContent = this._textDiv.text();
        var syncDocument = function () {
            console.log("About to sync...");
            var newText = $("#woot-document").text();
            if (newText == this._lastKnownDocumentContent) {
                console.log("Nothing to do!");
                return;
            }
            this.handleTextChange(this._lastKnownDocumentContent, newText);
            this._lastKnownDocumentContent = newText;
        }.bind(this);
        window.setInterval(syncDocument, 2000);
        this._textDiv.attr("contentEditable", "true");
    };
    // Returns whether the send was successful
    DocumentPageController.prototype.sendMessage = function (message, data) {
        if (this._clientId === 0) {
            // Wait until we have a client id
            return false;
        }
        console.log("Sending socket message!!!!!");
        this._socket.emit(message, data);
        return true;
    };
    // Called when text in input changes
    DocumentPageController.prototype.handleTextChange = function (oldText, newText) {
        var differ = new diff_match_patch();
        // Each `any` is a two-element list of text-operation-type and the text that
        // it applies to, like ["DIFF_DELETE", "monkey"] or ["DIFF_EQUAL", "ajsk"] or
        // ["DIFF_INSERT", "rabbit"]
        var results = differ.diff_main(oldText, newText);
        console.log("About to integrate text change!");
        console.log("Results was... ");
        console.log(results);
        console.log("Current value is: ", this._string.stringForDisplay());
        // Turn the results into a set of operations that our woot algorithm understands
        var cursorLocation = 0;
        for (var i = 0; i < results.length; i++) {
            var op = results[i][0];
            var text = results[i][1];
            if (op == DIFF_DELETE) {
                for (var j = 0; j < text.length; j++) {
                    console.log("Delete char " + text[j] + " at index " + cursorLocation);
                    var operation = this._string.generateDeleteOperation(text[j], cursorLocation);
                    this.sendMessage("text_operation", operation);
                    // TODO(ryan): broadcast operation
                    console.log("New value is: ", this._string.stringForDisplay());
                }
            }
            else if (op == DIFF_INSERT) {
                for (var j = 0; j < text.length; j++) {
                    console.log("Insert char " + text[j] + " after char at index " + cursorLocation);
                    var operation = this._string.generateInsertOperation(text[j], cursorLocation);
                    this.sendMessage("text_operation", operation);
                    // TODO(ryan): broadcast operation
                    console.log("New value is: ", this._string.stringForDisplay());
                    cursorLocation += 1;
                }
            }
            else if (op == DIFF_EQUAL) {
                cursorLocation += text.length;
            }
        }
    };
    return DocumentPageController;
})();
var pageController = null;
$(document).ready(function () {
    pageController = new DocumentPageController();
});
//# sourceMappingURL=client.js.map