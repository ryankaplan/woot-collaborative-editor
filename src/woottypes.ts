
module WootTypes {
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
        } else if (first === second) {
            return 0;
        } else {
            return 1;
        }
    }

    /**
     * In our algorithm, every character in a document gets a unique id that it
     * keeps forever. The id has two parts: the clientId of the site where it
     * was generated, and a 'clock' that increments every time a client generates
     * a new character.
     */
    export class WCharId {
        site: number;
        clock: number;
        _stringVal: string;

        constructor(site: number, clock: number) {
            this.site = site;
            this.clock = clock;
            this._stringVal = this.site + "/" + this.clock;
        }

        // Returns -1 for less than, 0 for equal, 1 for greater than
        compare(other: WCharId): number {
            if (this.site === other.site) {
                // Sites are the same, compare by clock
                return compareNumbers(this.clock, other.clock);
            }
            return compareNumbers(this.site, other.site);
        }

        toString(): string {
            // Cached because this gets called a lot and it was showing up
            // in the Chrome profiler. This obviously breaks if site and clock
            // are changed. This should never happend, but maybe there's access
            // control with typescript. Look into it -- TODO:(ryan).
            return this._stringVal;
        }

        static decodeJsonCharId(jsonChar: any): WCharId {
            return new WCharId(jsonChar.site, jsonChar.clock);
        }
    }

    /**
     * This represents a character in our WString class.
     */
    class WChar {
        // The id assigned at creation-time that this character keeps forever
        id: WCharId;
        // false if this character has been 'deleted' from the document
        visible: boolean;
        // The user-visible character that this WChar represents
        character: string;

        // As per the algorithm outlines in the document, each character specifies
        // which two characters it belongs between. These are the ids of the chars
        // that must go somewhere before and somewhere after this character respectively.
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
            return this.id.site === -1 && this.id.clock === 0;
        }

        isEnd() {
            return this.id.site === -1 && this.id.clock === 1;
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

    /**
     * WStringOperations are generated when a user modifies their copy of a document
     * and received from other clients to be applied to our WString.
     */
    export enum WOperationType {
        INSERT,
        DELETE
    }

    export class WStringOperation {
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

    /**
     * This is where most of the collaboration logic lives.
     */
    export class WString {
        // Function that generates WCharIds for a particular site
        _idGenerator: (() => WCharId);
        // List of all WChars that comprise our string
        _chars: Array<WChar>;
        _charById: { [charId: string]: WChar };

        constructor(idGenerator: (() => WCharId)) {
            this._idGenerator = idGenerator;
            this._chars = [];
            this._charById = {};

            var begin = WChar.begin();
            var end = WChar.end();
            this._chars.push(begin);
            this._chars.push(end);
            this._charById[begin.id.toString()] = begin;
            this._charById[end.id.toString()] = end;
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
         * are both visible. TODO(ryan): this could be more efficient if we keep an
         * additional list of only-visible chars.
         */
        ithVisible(position: number): WChar {
            log("[ithVisible] position ", position);
            var foundSoFar = -1;
            for (var i = 0; i < this._chars.length; i++) {
                var char = this._chars[i];
                if (char.visible) {
                    foundSoFar += 1;
                    if (foundSoFar === position) {
                        return this._chars[i];
                    }
                }
            }
            throw Error("There is no " + position + "th visible char!");
        }

        // Returns -1 if not present.
        indexOfCharWithId(charId: WCharId): number {
            var char = this._charById[charId.toString()];
            return this._chars.indexOf(char);
        }

        // Returns `true` if a character with the passed in id is in this string
        // (visible or not) TODO(ryan): this could be O(1)
        contains(id: WCharId): boolean {
            return id.toString() in this._charById;
        }

        // TODO(ryan): implement pooling. Right now we just assume that all ops are executable
        // immediately. This is bad D:
        isExecutable(op: WStringOperation) {
            if (op.opType === WOperationType.INSERT) {
                return this.contains(op.char.previous) && this.contains(op.char.next);
            }

            else if (op.opType === WOperationType.DELETE) {
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

        // This function is an iterative version of the logic in the code block at the top
        // of page 11 in the paper. We were hitting maximum call stack issues with the recursive
        // version.
        _integrateInsertionHelper(newChar: WChar, previousId: WCharId, nextId: WCharId) {
            log("_integrateInsertionHelper] begin with chars", this._chars);
            /**
             * Consider the following scenario:
             *
             * 1. Type 2000 chars
             * 2. Delete the chars
             * 3. Paste them back in
             *
             * This operation hangs the UI for 4/5 seconds. When profiled, most of the work
             * is done in this method calling into indexOfCharWithId which is O(n) for n
             * the number of chars in the string. So we optimize these calls by iterating
             * once over the string at the beginning of the method and building up a map
             * of WCharId -> location in _chars.
             */
            var indexById = {};
            for (var i = 0; i < this._chars.length; i++) {
                indexById[this._chars[i].id.toString()] = i;
            }

            while (true) {
                if (!(previousId.toString() in indexById)) {
                    throw Error("[_integrateInsertionHelper] Previous index not present in string!");
                }
                var previousIndex: number = indexById[previousId.toString()];

                if (!(nextId.toString() in indexById)) {
                    throw Error("[_integrateInsertionHelper] Next index not present in string!");
                }
                var nextIndex: number = indexById[nextId.toString()];

                if (nextIndex <= previousIndex) {
                    throw Error("[_integrateInsertionHelper] nextIndex must be greater than previousIndex");
                }

                if (nextIndex === previousIndex + 1) {
                    // We only have one place for newChar to go. This is easy.
                    // splice pushes the element at nextIndex to the right.
                    this._chars.splice(nextIndex, 0, newChar);
                    this._charById[newChar.id.toString()] = newChar;
                    log("[_integrateInsertionHelper] We're done. Here are the new chars:", this._chars);
                    return;
                }

                // these logs are expensive, shortcut early if logging is disabled
                loggingEnabled && log("Previous index is ", previousIndex, " which is character ", this._chars[previousIndex].debugString());
                loggingEnabled && log("Next index is ", nextIndex, " which is character ", this._chars[nextIndex].debugString());

                // lChars is 'L' from page 11 of the paper and dChar is d_0, d_1, ... from
                // the same page
                var lChars = [];
                lChars.push(this._chars[previousIndex]);
                for (var i = previousIndex + 1; i < nextIndex; i++) {
                    var dChar = this._chars[i];
                    if (!(dChar.previous.toString() in indexById)) {
                        throw Error("dChar.previous missing from indexById");
                    }
                    var dCharIndexOfPrevious = indexById[dChar.previous.toString()];

                    if (!(dChar.next.toString() in indexById)) {
                        throw Error("dChar.next missing from indexById");
                    }
                    var dCharIndexOfNext = indexById[dChar.next.toString()];

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
                    log("Just got to index ", i, " about to compare characters ",
                        lChars[i].debugString(), " and " , newChar.debugString());
                }
                log("Nope, were done now");

                log("We decided to insert at index ", i);
                log("This is lChars", lChars);
                log("This is between ", lChars[i - 1].debugString(), " and ", lChars[i].debugString());
                previousId = lChars[i - 1].id;
                nextId = lChars[i].id;
            }
        }

        integrateDeletion(charToDelete: WChar) {
            var char = this._charById[charToDelete.id.toString()];
            char.visible = false;
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
}