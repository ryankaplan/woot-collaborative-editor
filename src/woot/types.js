var WootTypes;
(function (WootTypes) {
    var loggingEnabled = false;
    var log = function () {
        var things = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            things[_i - 0] = arguments[_i];
        }
        if (this.console && loggingEnabled) {
            console.log.apply(console, arguments);
        }
    };
    var compareNumbers = function (first, second) {
        if (first < second) {
            return -1;
        }
        else if (first === second) {
            return 0;
        }
        else {
            return 1;
        }
    };
    var WCharId = (function () {
        function WCharId(_siteNumber, _opNumber) {
            this._siteNumber = _siteNumber;
            this._opNumber = _opNumber;
            this._stringVal = null;
        }
        WCharId.prototype.siteNumber = function () {
            return this._siteNumber;
        };
        WCharId.prototype.opNumber = function () {
            return this._opNumber;
        };
        WCharId.prototype.compare = function (other) {
            if (this._siteNumber === other._siteNumber) {
                return compareNumbers(this._opNumber, other._opNumber);
            }
            return compareNumbers(this._siteNumber, other._siteNumber);
        };
        WCharId.prototype.toString = function () {
            if (!this._stringVal) {
                this._stringVal = this._siteNumber + "/" + this._opNumber;
            }
            return this._stringVal;
        };
        WCharId.prototype.toJSON = function () {
            return {
                "siteNumber": this._siteNumber,
                "opNumber": this._opNumber
            };
        };
        WCharId.fromJSON = function (jsonChar) {
            return new WCharId(jsonChar.siteNumber, jsonChar.opNumber);
        };
        return WCharId;
    })();
    WootTypes.WCharId = WCharId;
    var WChar = (function () {
        function WChar(_id, _character, _previous, _next) {
            this._id = _id;
            this._character = _character;
            this._previous = _previous;
            this._next = _next;
            this._visible = true;
        }
        WChar.prototype.id = function () {
            return this._id;
        };
        WChar.prototype.character = function () {
            return this._character;
        };
        WChar.prototype.previous = function () {
            return this._previous;
        };
        WChar.prototype.next = function () {
            return this._next;
        };
        WChar.prototype.visible = function () {
            return this._visible;
        };
        WChar.prototype.setVisible = function (visible) {
            this._visible = visible;
        };
        WChar.prototype.debug = function () {
            return JSON.stringify({
                'id': this._id.toString(),
                'visible': this._visible,
                'character': this._character
            });
        };
        WChar.prototype.toJSON = function () {
            return {
                "id": this._id,
                "previous": this._previous.toJSON(),
                "next": this._next.toJSON(),
                "character": this._character,
                "visible": this._visible
            };
        };
        WChar.fromJSON = function (jsonChar) {
            var id = WCharId.fromJSON(jsonChar.id);
            var previous = WCharId.fromJSON(jsonChar.previous);
            var next = WCharId.fromJSON(jsonChar.next);
            var char = new WChar(id, jsonChar.character, previous, next);
            char._visible = jsonChar.visible;
            return char;
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
    (function (WOperationType) {
        WOperationType[WOperationType["INSERT"] = 0] = "INSERT";
        WOperationType[WOperationType["DELETE"] = 1] = "DELETE";
    })(WootTypes.WOperationType || (WootTypes.WOperationType = {}));
    var WOperationType = WootTypes.WOperationType;
    var WStringOperation = (function () {
        function WStringOperation(_opType, _char) {
            this._opType = _opType;
            this._char = _char;
        }
        WStringOperation.prototype.opType = function () {
            return this._opType;
        };
        WStringOperation.prototype.char = function () {
            return this._char;
        };
        WStringOperation.prototype.toJSON = function () {
            return {
                "opType": this._opType,
                "char": this._char.toJSON()
            };
        };
        WStringOperation.fromJSON = function (operation) {
            var opType = operation.opType;
            var char = WChar.fromJSON(operation.char);
            return new WStringOperation(opType, char);
        };
        return WStringOperation;
    })();
    WootTypes.WStringOperation = WStringOperation;
    var WString = (function () {
        function WString(_idGenerator) {
            this._idGenerator = _idGenerator;
            this._chars = [];
            this._charById = {};
            var begin = WChar.begin();
            var end = WChar.end();
            this._chars.push(begin);
            this._chars.push(end);
            this._charById[begin.id().toString()] = begin;
            this._charById[end.id().toString()] = end;
        }
        WString.prototype.generateInsertOperation = function (char, position, stats) {
            var nextId = this._idGenerator();
            var previous = this._ithVisible(position);
            var next = this._ithVisible(position + 1);
            var newChar = new WChar(nextId, char, previous.id(), next.id());
            stats.numInsertOpsGenerated += 1;
            this.integrateInsertion(newChar, stats);
            return new WStringOperation(WOperationType.INSERT, newChar);
        };
        WString.prototype.generateDeleteOperation = function (char, position) {
            var charToDelete = this._ithVisible(position + 1);
            this.integrateDeletion(charToDelete);
            return new WStringOperation(WOperationType.DELETE, charToDelete);
        };
        WString.prototype.contains = function (id) {
            return id.toString() in this._charById;
        };
        WString.prototype.isExecutable = function (op) {
            switch (op.opType()) {
                case WOperationType.INSERT:
                    return this.contains(op.char().previous()) && this.contains(op.char().next());
                    break;
                case WOperationType.DELETE:
                    return this.contains(op.char().id());
                    break;
            }
        };
        WString.prototype.integrateInsertion = function (newChar, stats) {
            log("[integrateInsertion] begin");
            this._integrateInsertionHelper(newChar, newChar.previous(), newChar.next(), stats);
        };
        WString.prototype.integrateDeletion = function (charToDelete) {
            var char = this._charById[charToDelete.id().toString()];
            char.setVisible(false);
        };
        WString.prototype.stringForDisplay = function () {
            var result = "";
            for (var i = 0; i < this._chars.length; i++) {
                var char = this._chars[i];
                if (!char.visible()) {
                    continue;
                }
                result += char.character();
            }
            return result;
        };
        WString.prototype._integrateInsertionHelper = function (newChar, previousId, nextId, stats) {
            var startMs = performance.now();
            var whileLoopIterations = 0;
            var groupLoopIterations = 0;
            var walkLoopIterations = 0;
            log("_integrateInsertionHelper] begin with chars", this._chars);
            var indexById = {};
            for (var i = 0; i < this._chars.length; i++) {
                var char = this._chars[i];
                indexById[char.id().toString()] = i;
            }
            while (true) {
                whileLoopIterations += 1;
                if (!(previousId.toString() in indexById)) {
                    throw Error("[_integrateInsertionHelper] Previous index not present in string!");
                }
                var previousIndex = indexById[previousId.toString()];
                if (!(nextId.toString() in indexById)) {
                    throw Error("[_integrateInsertionHelper] Next index not present in string!");
                }
                var nextIndex = indexById[nextId.toString()];
                if (nextIndex <= previousIndex) {
                    throw Error("[_integrateInsertionHelper] nextIndex must be greater than previousIndex");
                }
                if (nextIndex === previousIndex + 1) {
                    this._chars.splice(nextIndex, 0, newChar);
                    this._charById[newChar.id().toString()] = newChar;
                    log("[_integrateInsertionHelper] We're done. Here are the new chars:", this._chars);
                    stats.timeSpentEach.push(performance.now() - startMs);
                    stats.whileLoopIterationsEach.push(whileLoopIterations);
                    stats.totalGroupLoopIterationsEach.push(groupLoopIterations);
                    stats.totalWalkLoopIterationsEach.push(walkLoopIterations);
                    return;
                }
                loggingEnabled && log("Previous index is ", previousIndex, " which is character ", this._chars[previousIndex].debug());
                loggingEnabled && log("Next index is ", nextIndex, " which is character ", this._chars[nextIndex].debug());
                var lChars = [];
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
        };
        WString.prototype._ithVisible = function (position) {
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
        };
        return WString;
    })();
    WootTypes.WString = WString;
})(WootTypes || (WootTypes = {}));
//# sourceMappingURL=types.js.map