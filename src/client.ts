/// <reference path='typings/diff_match_patch/diff_match_patch.d.ts' />
/// <reference path='typings/jquery/jquery.d.ts' />
/// <reference path='typings/socketio/client.d.ts' />

var loggingEnabled = false;
var log = function (...things: Array<any>) {
    if (this.console && loggingEnabled) {
        console.log.apply(console, arguments);
    }
};

// Returns -1 if less than, 0 if equal, 1 if greater than
var compareNumbers = function (first: number, second: number): number {
    if (first < second) {
        return -1;
    } else if (first == second) {
        return 0;
    } else {
        return 1;
    }
}

class WCharId {
    site: number;
    clock: number;

    constructor(site: number, clock: number) {
        this.site = site;
        this.clock = clock;
    }

    compare(other: WCharId): number {
        if (this.site == other.site) {
            // Sites are the same, compare by clock
            return compareNumbers(this.clock, other.clock);
        }
        return compareNumbers(this.site, other.site);
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

    debugString(): string {
        return JSON.stringify({
            'id': this.id.toString(),
            'visible': this.visible,
            'character': this.character
        });
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

    constructor(idGenerator: (() => WCharId)) {
        this._idGenerator = idGenerator;
        this._chars = [];

        var begin = WChar.begin();
        var end = WChar.end();
        this._chars.push(begin);
        this._chars.push(end);
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

    // Returns -1 if not present
    indexOfCharWithId(charId: WCharId): number {
        for (var i = 0; i < this._chars.length; i++) {
            var char = this._chars[i];
            if (char.id.toString() == charId.toString()) {
                return i;
            }
        }
        return -1;
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

    integrateInsertion(newChar: WChar) {
        log("[integrateInsertion] begin");
        this._integrateInsertionHelper(newChar, newChar.previous, newChar.next);
    }

    _integrateInsertionHelper(newChar: WChar, previousId: WCharId, nextId: WCharId) {
        log("_integrateInsertionHelper] begin with chars", this._chars);

        var previousIndex = this.indexOfCharWithId(previousId);
        if (previousIndex == -1) {
            throw Error("[_integrateInsertionHelper] Previous index not present in string!");
        }
        var nextIndex = this.indexOfCharWithId(nextId);
        if (nextIndex == -1) {
            throw Error("[_integrateInsertionHelper] Next index not present in string!");
        }
        if (nextIndex <= previousIndex) {
            throw Error("[_integrateInsertionHelper] nextIndex must be greater than previousIndex");
        }

        if (nextIndex == previousIndex + 1) {
            // We only have one place for newChar to go. This is easy.
            // splice pushes the element at nextIndex to the right.
            this._chars.splice(nextIndex, 0, newChar);
            log("[_integrateInsertionHelper] We're done. Here are the new chars:", this._chars);
            return;
        }

        log("Previous index is ", previousIndex, " which is character ", this._chars[previousIndex].debugString());
        log("Next index is ", nextIndex, " which is character ", this._chars[nextIndex].debugString());

        // lChars is 'L' from page 11 of the paper and dChar is d_0, d_1, ... from
        // the same page
        var lChars = [];
        lChars.push(this._chars[previousIndex]);
        for (var i = previousIndex + 1; i < nextIndex; i++) {
            var dChar = this._chars[i];
            var dCharIndexOfPrevious = this.indexOfCharWithId(dChar.previous);
            var dCharIndexOfNext = this.indexOfCharWithId(dChar.next);

            if (dCharIndexOfPrevious <= previousIndex && dCharIndexOfNext >= nextIndex) {
                lChars.push(dChar);
            }
        }
        lChars.push(this._chars[nextIndex]);

        // newChar belongs somewhere between previousIndex and nextIndex, but we don't
        // know where. See page 11 of the paper for more info on what we're about to do.

        log("Walking along the chars list!");
        var i = 1;
        while (i < lChars.length - 1 && lChars[i].id.compare(newChar.id) < 0) {
            i += 1;
            console.log("Just got to index ", i, " about to compare characters ",
                lChars[i].debugString(), " and " , newChar.debugString());
        }
        log("Nope, were done now");

        log("We decided to insert at index ", i);
        log("This is lChars", lChars);
        log("This is between ", lChars[i - 1].debugString(), " and ", lChars[i].debugString());
        this._integrateInsertionHelper(newChar, lChars[i - 1].id, lChars[i].id);
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

var pageController = null;
$(document).ready(function () {
    pageController = new DocumentPageController();
});
