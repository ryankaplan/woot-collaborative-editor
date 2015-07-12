/// <reference path='typings/diff_match_patch/diff_match_patch.d.ts' />
/// <reference path='typings/jquery/jquery.d.ts' />
/// <reference path='typings/socketio/client.d.ts' />


var loggingEnabled = false;
var log = function () {
    if (this.console && loggingEnabled) {
        console.log.apply(console, arguments);
    }
};

class WCharId {
    site: number;
    clock: number;

    constructor(site: number, clock: number) {
        this.site = site;
        this.clock = clock;
    }

    toString(): string {
        return this.site + "/" + this.clock;
    }

    static decodeJsonCharId(jsonChar: any): WCharId {
        return new WCharId(jsonChar.site, jsonChar.clock);
    }
}

class WChar {
    id: WCharId;
    visible: boolean;
    character: string;
    previous: WCharId;
    next: WCharId;

    constructor(id: WCharId, character: string, previous: WCharId, next: WCharId) {
        this.id = id;
        this.visible = true;
        this.character = character;
        this.previous = previous;
        this.next = next;
    }

    static decodeJsonChar(jsonChar: any): WChar {
        var id = WCharId.decodeJsonCharId(jsonChar.id);
        var previous = WCharId.decodeJsonCharId(jsonChar.previous);
        var next = WCharId.decodeJsonCharId(jsonChar.next);
        var char = new WChar(id, jsonChar.character, previous, next);
        char.visible = jsonChar.visible;
        return char;
    }

    isBegin() {
        return this.id.site == -1 && this.id.clock == 0;
    }

    isEnd() {
        return this.id.site == -1 && this.id.clock == 1;
    }

    static begin(): WChar {
        var id = new WCharId(-1, 0);
        return new WChar(id, "", id, id);
    }

    static end(): WChar {
        var id = new WCharId(-1, 1);
        return new WChar(id, "", id, id);
    }
}

enum WOperationType {
    INSERT,
    DELETE
}

class WStringOperation {
    opType: WOperationType;
    char: WChar;

    constructor(opType: WOperationType, char: WChar) {
        this.opType = opType;
        this.char = char;
    }

    static decodeJsonOperation(operation: any): WStringOperation {
        var opType = operation.opType;
        var char = WChar.decodeJsonChar(operation.char);
        return new WStringOperation(opType, char);
    }
}

class WString {
    _idGenerator: (() => WCharId);

    // These two data structures are insert only
    _chars: Array<WChar>;
    _seenIds: { [charIdString: string]: boolean; }

    constructor(idGenerator: (() => WCharId)) {
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

    /**
     * generateInsertOperation and generateDeleteOperation create and integrate an
     * operation for a text change in this WString. For example, if you string is
     * WString("abc") and you call .generateInsertOperation("x", 0) the string will
     * become WString("axbc").
     *
     * Returns the operation that made the modification.
     */
    generateInsertOperation(char: string, position: number): WStringOperation {
        log("[generateInsertOperation] Entered with char ", char, "and position ", position);
        var nextId = this._idGenerator();
        var previous = this.ithVisible(position);
        log("[generateInsertOperation] Previous", previous);
        var next = this.ithVisible(position + 1);
        log("[generateInsertOperation] Next", next);
        var newChar = new WChar(nextId, char, previous.id, next.id);
        log("[generateInsertOperation] newChar", newChar);
        this.integrateInsertion(newChar);
        return new WStringOperation(WOperationType.INSERT, newChar);
    }

    generateDeleteOperation(char: string, position: number): WStringOperation {
        var charToDelete = this.ithVisible(position + 1);
        this.integrateDeletion(charToDelete);
        return new WStringOperation(WOperationType.DELETE, charToDelete);
    }

    /**
     * Returns the ith visible character in this string. WChar.begin and WChar.end
     * are both visible.
     */
    ithVisible(position: number): WChar {
        log("[ithVisible] position ", position);

        var foundSoFar = -1;
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            if (char.visible) {
                foundSoFar += 1;

                log("foundSoFar ", foundSoFar, " char ", char);
                if (foundSoFar == position) {
                    return this._chars[i];
                }
            }
        }
        throw Error("There is no " + position + "th visible char!");
    }

    // Returns `true` if a character with the passed in id is in this string
    // (visible or not)
    contains(id: WCharId): boolean {
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];

            log("Comparing ", char.id.toString(), id.toString());
            if (char.id.toString() == id.toString()) {
                return true;
            }
        }

        return false;
    }

    isExecutable(op: WStringOperation) {
        if (op.opType == WOperationType.INSERT) {
            return this.contains(op.char.previous) && this.contains(op.char.next);
        }

        else if (op.opType == WOperationType.DELETE) {
            return this.contains(op.char.id);
        }

        else {
            throw Error("Unrecognized operation type " + op.opType);
        }
    }

    // TODO(ryan): This is not at all to the paper specification and will do the wrong thing in many cases
    integrateInsertion(newChar: WChar) {
        log("[integrateInsertion] begin");
        this._seenIds[newChar.id.toString()] = true;

        log("[integrateInsertion] chars", this._chars);
        // Insert right after previous
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            if (char.id.toString() == newChar.previous.toString()) {
                // splice replaces the element at its first index. We want to insert
                // at the location one after, i.e. i + 1.
                this._chars.splice(i + 1, 0, newChar);
                log("[integrateInsertion] chars", this._chars);
                return;
            }
        }

        throw Error("Didn't find previous in integrateInsertion!");
    }

    integrateDeletion(charToDelete: WChar) {
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            if (char.id.toString() == charToDelete.id.toString()) {
                char.visible = false;
            }
        }
    }

    // Call this to get a string to show to the user
    stringForDisplay() {
        var result = "";
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            if (!char.visible) {
                continue;
            }

            result += char.character;
        }
        return result;
    }
}

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
    _counter: number;
    _lastKnownDocumentContent = "";
    _string: WString;
    _textDiv: any;

    constructor() {
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

        window.setInterval(syncDocument, 2000);

        this._textDiv.attr("contentEditable", "true");
    }

    // Returns whether the send was successful
    sendMessage(message: string, data: any): boolean {
        if (this._clientId === 0) {
            // Wait until we have a client id
            return false;
        }

        log("Sending socket message!!!!!");
        this._socket.emit(message, data);
        return true;
    }

    // Called when text in input changes
    handleTextChange(oldText: string, newText: string) {
        var differ = new diff_match_patch();

        // Each `any` is a two-element list of text-operation-type and the text that
        // it applies to, like ["DIFF_DELETE", "monkey"] or ["DIFF_EQUAL", "ajsk"] or
        // ["DIFF_INSERT", "rabbit"]
        var results: Array<Array<any>> = differ.diff_main(oldText, newText);

        log("About to integrate text change!");
        log("Results was... ");
        log(results);
        log("Current value is: ", this._string.stringForDisplay());

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

                    // TODO(ryan): broadcast operation
                    log("New value is: ", this._string.stringForDisplay());

                    // do not change cursorLocation
                    //cursorLocation -= 1;
                }
            }

            else if (op == DIFF_INSERT) {
                for (var j = 0; j < text.length; j++) {
                    log("Insert char " + text[j] + " after char at index " + cursorLocation);

                    var operation = this._string.generateInsertOperation(text[j], cursorLocation);
                    this.sendMessage("text_operation", operation);
                    // TODO(ryan): broadcast operation
                    log("New value is: ", this._string.stringForDisplay());

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
