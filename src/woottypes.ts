
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
     * keeps forever. The id has two parts: the clientId of the siteNumber where it
     * was generated, and a 'opNumber' that increments every time a client generates
     * a new character.
     */
    export class WCharId {
        private _stringVal: string = null;

        constructor(
            private _siteNumber: number,
            private _opNumber: number
        ) {
        }

        siteNumber(): number {
            return this._siteNumber;
        }

        opNumber(): number {
            return this._opNumber
        }

        // Returns -1 for less than, 0 for equal, 1 for greater than
        compare(other: WCharId): number {
            if (this._siteNumber === other._siteNumber) {
                // Sites are the same, compare by opNumber
                return compareNumbers(this._opNumber, other._opNumber);
            }
            return compareNumbers(this._siteNumber, other._siteNumber);
        }

        toString(): string {
            if (!this._stringVal) {
                this._stringVal = this._siteNumber + "/" + this._opNumber;
            }
            // Cached because this gets called a lot and it was showing up
            // in the Chrome profiler.
            return this._stringVal;
        }

        toJSON(): any {
            return {
                "siteNumber": this._siteNumber,
                "opNumber": this._opNumber
            };
        }

        static fromJSON(jsonChar: any): WCharId {
            return new WCharId(jsonChar.siteNumber, jsonChar.opNumber);
        }
    }

    /**
     * This represents a character in our WString class.
     */
    class WChar {
        // false if this character has been 'deleted' from the document
        private _visible: boolean = true;

        constructor(
            // The id assigned at creation-time that this character keeps forever
            private _id: WCharId,

            // The user-visible character that this WChar represents
            private _character: string,

            // As per the algorithm outlines in the document, each character specifies
            // which two characters it belongs between. These are the ids of the chars
            // that must go somewhere before and somewhere after this character respectively.
            private _previous: WCharId,
            private _next: WCharId
        ) {
        }

        id(): WCharId {
            return this._id;
        }

        character(): string {
            return this._character;
        }

        previous(): WCharId {
            return this._previous;
        }

        next(): WCharId {
            return this._next;
        }

        visible(): boolean {
            return this._visible;
        }

        setVisible(visible: boolean): void {
            this._visible = visible;
        }

        debug(): string {
            return JSON.stringify({
                'id': this._id.toString(),
                'visible': this._visible,
                'character': this._character
            });
        }

        toJSON(): any {
            return {
                "id": this._id,
                "previous": this._previous.toJSON(),
                "next": this._next.toJSON(),
                "character": this._character,
                "visible": this._visible
            }
        }

        static fromJSON(jsonChar: any): WChar {
            var id = WCharId.fromJSON(jsonChar.id);
            var previous = WCharId.fromJSON(jsonChar.previous);
            var next = WCharId.fromJSON(jsonChar.next);
            var char = new WChar(id, jsonChar.character, previous, next);
            char._visible = jsonChar.visible;
            return char;
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
        constructor(
            private _opType: WOperationType,
            private _char: WChar
        ) {
        }

        opType(): WOperationType {
            return this._opType;
        }

        char(): WChar {
            return this._char;
        }

        toJSON(): any {
            return {
                "opType": this._opType,
                "char": this._char.toJSON()
            };
        }

        static fromJSON(operation: any): WStringOperation {
            var opType = operation.opType;
            var char = WChar.fromJSON(operation.char);
            return new WStringOperation(opType, char);
        }
    }

    export interface InsertTimingStats {
        numInsertOpsGenerated: number;
        timeSpentEach: Array<number>;
        whileLoopIterationsEach: Array<number>;
        totalGroupLoopIterationsEach: Array<number>;
        totalWalkLoopIterationsEach: Array<number>;
    }

    /**
     * This is where most of the collaboration logic lives.
     */
    export class WString {
        // List of all WChars that comprise our string
        _chars: Array<WChar> = [];
        _charById: { [charId: string]: WChar } = {};

        constructor(
            // Function that generates WCharIds for a particular siteNumber
            private _idGenerator: (() => WCharId)
        ) {
            var begin = WChar.begin();
            var end = WChar.end();
            this._chars.push(begin);
            this._chars.push(end);
            this._charById[begin.id().toString()] = begin;
            this._charById[end.id().toString()] = end;
        }

        /**
         * generateInsertOperation and generateDeleteOperation create and integrate an
         * operation for a text change in this WString. For example, if you string is
         * WString("abc") and you call .generateInsertOperation("x", 0) the string will
         * become WString("axbc").
         *
         * Returns the operation that made the modification.
         */
        generateInsertOperation(char: string, position: number, stats: InsertTimingStats): WStringOperation {
            var nextId = this._idGenerator();
            var previous = this._ithVisible(position);
            var next = this._ithVisible(position + 1);
            var newChar = new WChar(nextId, char, previous.id(), next.id());
            stats.numInsertOpsGenerated += 1;
            this.integrateInsertion(newChar, stats);
            return new WStringOperation(WOperationType.INSERT, newChar);
        }

        generateDeleteOperation(char: string, position: number): WStringOperation {
            var charToDelete = this._ithVisible(position + 1);
            this.integrateDeletion(charToDelete);
            return new WStringOperation(WOperationType.DELETE, charToDelete);
        }

        // Returns `true` if a character with the passed in id is in this string
        // (visible or not)
        contains(id: WCharId): boolean {
            return id.toString() in this._charById;
        }

        isExecutable(op: WStringOperation) {
            switch (op.opType()) {
                case WOperationType.INSERT:
                    return this.contains(op.char().previous()) && this.contains(op.char().next());
                    break;

                case WOperationType.DELETE:
                    return this.contains(op.char().id());
                    break;
            }
        }

        integrateInsertion(newChar: WChar, stats: InsertTimingStats) {
            log("[integrateInsertion] begin");
            this._integrateInsertionHelper(newChar, newChar.previous(), newChar.next(), stats);
        }

        integrateDeletion(charToDelete: WChar) {
            var char = this._charById[charToDelete.id().toString()];
            char.setVisible(false);
        }

        // Call this to get a string to show to the user
        stringForDisplay() {
            var result = "";
            for (var i = 0; i < this._chars.length; i++) {
                var char: WChar = this._chars[i];
                if (!char.visible()) {
                    continue;
                }

                result += char.character();
            }
            return result;
        }

        /*

         numInsertOpsGenerated: 1
         timeSpentEach:  974.4269999937387
         totalGroupLoopIterationsEach: 1969132
         totalWalkLoopIterationsEach: 1985
         whileLoopIterationsEach: Array[1]0: 1985

          add 01234567890 * 10 * 5 * 3, delete,

         */

        // This function is an iterative version of the logic in the code block at the top
        // of page 11 in the paper. We were hitting maximum call stack issues with the recursive
        // version.
        private _integrateInsertionHelper(newChar: WChar, previousId: WCharId, nextId: WCharId, stats: InsertTimingStats) {
            var startMs = performance.now();
            var whileLoopIterations = 0;
            var groupLoopIterations = 0;
            var walkLoopIterations = 0;

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
            var indexById: { [id: string]: number } = {};
            for (var i = 0; i < this._chars.length; i++) {
                var char: WChar = this._chars[i];
                indexById[char.id().toString()] = i;
            }

            while (true) {
                whileLoopIterations += 1;
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
                    this._charById[newChar.id().toString()] = newChar;
                    log("[_integrateInsertionHelper] We're done. Here are the new chars:", this._chars);
                    stats.timeSpentEach.push(performance.now() - startMs);
                    stats.whileLoopIterationsEach.push(whileLoopIterations);
                    stats.totalGroupLoopIterationsEach.push(groupLoopIterations);
                    stats.totalWalkLoopIterationsEach.push(walkLoopIterations);
                    return;
                }

                // these logs are expensive, shortcut early if logging is disabled
                loggingEnabled && log("Previous index is ", previousIndex, " which is character ", this._chars[previousIndex].debug());
                loggingEnabled && log("Next index is ", nextIndex, " which is character ", this._chars[nextIndex].debug());

                // lChars is 'L' from page 11 of the paper and dChar is d_0, d_1, ... from
                // the same page
                var lChars: Array<WChar> = [];
                lChars.push(this._chars[previousIndex]);
                for (var i = previousIndex + 1; i < nextIndex; i++) {
                    var dChar = this._chars[i];
                    if (!(dChar.previous().toString() in indexById)) {
                        throw Error("dChar.previous missing from indexById");
                    }
                    var dCharIndexOfPrevious = indexById[dChar.previous().toString()];

                    if (!(dChar.next().toString() in indexById)) {
                        throw Error("dChar.next missing from indexById");
                    }
                    var dCharIndexOfNext = indexById[dChar.next().toString()];

                    if (dCharIndexOfPrevious <= previousIndex && dCharIndexOfNext >= nextIndex) {
                        lChars.push(dChar);
                    }
                    groupLoopIterations += 1;
                }
                lChars.push(this._chars[nextIndex]);

                // newChar belongs somewhere between previousIndex and nextIndex, but we don't
                // know where. See page 11 of the paper for more info on what we're about to do.

                log("Walking along the chars list!");
                var i = 1;
                while (i < lChars.length - 1 && lChars[i].id().compare(newChar.id()) < 0) {
                    i += 1;
                    walkLoopIterations += 1;
                }

                log("We're done and we decided to insert at index ", i);
                log("This is lChars", lChars);
                loggingEnabled && log("This is between ", lChars[i - 1].debug(), " and ", lChars[i].debug());
                previousId = lChars[i - 1].id();
                nextId = lChars[i].id();
            }

            throw Error("We never get here");
        }

        /**
         * Returns the ith visible character in this string. WChar.begin and WChar.end
         * are both visible. TODO(ryan): this could be more efficient if we keep an
         * additional list of only-visible chars.
         */
        private _ithVisible(position: number): WChar {
            log("[ithVisible] position ", position);
            var foundSoFar = -1;
            for (var i = 0; i < this._chars.length; i++) {
                var char = this._chars[i];
                if (char.visible()) {
                    foundSoFar += 1;
                    if (foundSoFar === position) {
                        return this._chars[i];
                    }
                }
            }
            throw Error("There is no " + position + "th visible char!");
        }
    }
}