"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Storage = void 0;
const fs = __importStar(require("fs"));
class Storage {
    constructor(path, tickInterval = 100) {
        this.path = path;
        this.tickInterval = tickInterval;
        this.state = {};
        this.hasChanged = false;
        this.exclusiveFlag = fs.constants.S_IRUSR | fs.constants.S_IWUSR | fs.constants.O_CREAT;
        this.requestPath = path + "_";
        setTimeout(() => this.tick(), tickInterval);
    }
    /**
     * Delete a key from the storage
     * @param key
     */
    Delete(key) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.requestAccess();
            delete this.state[key];
            this.hasChanged = true;
        });
    }
    /**
     * Set a value to specified key
     * @param key
     * @param value valid types: number, boolean, string, null, undefined, object
     */
    Set(key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.requestAccess();
            this.state[key] = value;
            this.hasChanged = true;
        });
    }
    /**
     * Get a value from the specified key
     * @param key
     * @returns one of the following: number, boolean, string, null, undefined, object
     */
    Get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.requestAccess();
            return this.state[key];
        });
    }
    /**
     * Locks the specified key, the end of the ttl will be written to it
     * @param key
     * @param maximumTTL the maximum time the key is locked
     * @param retryTime if the lock can not be acquired, wait for this amount of ms for a retry
     * @returns the ttl of the key, pass it to unlock to ensure correct behaviour
     */
    Lock(key, maximumTTL = 10000, retryTime = 10) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.requestAccess();
            let lock = this.state[key];
            let now = Date.now();
            if (typeof lock === 'number' && !Number.isNaN(lock) && lock > now) {
                return yield new Promise((resolve, _reject) => {
                    setTimeout(() => __awaiter(this, void 0, void 0, function* () { resolve(this.Lock(key, maximumTTL)); }), Math.min(lock - now, retryTime));
                });
            }
            let ttl = now + maximumTTL;
            this.state[key] = ttl;
            this.hasChanged = true;
            return ttl;
        });
    }
    /**
     * The same as Lock but it will fail if it can not acquire the lock
     * @param key
     * @param maximumTTL
     */
    TryLock(key, maximumTTL = 10000) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.requestAccess();
            let lock = this.state[key];
            if (lock && lock > Date.now())
                throw new Error(`Key ${key} is already locked until ${lock}`);
            this.state[key] = Date.now() + maximumTTL;
            this.hasChanged = true;
        });
    }
    /**
     * Unlocks a key if the expectedValue still matches the key's value
     * @param key
     * @param expectedValue
     */
    Unlock(key, expectedValue) {
        return __awaiter(this, void 0, void 0, function* () {
            let value = yield this.Get(key);
            if (value === expectedValue)
                yield this.Delete(key);
        });
    }
    writeState() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.hasChanged && this.file) {
                yield this.file.truncate();
                yield this.file.write(this.stateToString(), 0, 'utf-8');
                this.hasChanged = false;
            }
        });
    }
    readState() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield this.requestAccess();
            let tempHandle = yield fs.promises.open(this.path, 'r+', this.exclusiveFlag);
            (_a = this.file) === null || _a === void 0 ? void 0 : _a.close();
            this.file = tempHandle;
            let result = (yield tempHandle.read());
            let fileContents = result.buffer;
            this.updateStateFromString(fileContents.toString('utf-8', 0, result.bytesRead));
        });
    }
    requestAccess() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.file)
                return;
            return new Promise((resolve, _reject) => __awaiter(this, void 0, void 0, function* () {
                let requestFileHandle = yield fs.promises.open(this.requestPath, 'a+', this.exclusiveFlag);
                this.file = yield fs.promises.open(this.path, 'a+', this.exclusiveFlag);
                yield requestFileHandle.close();
                yield fs.promises.unlink(this.requestPath).catch((_err) => { });
                yield this.readState();
                resolve(true);
            }));
        });
    }
    yieldAccess() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            (_a = this.file) === null || _a === void 0 ? void 0 : _a.close();
            this.file = undefined;
        });
    }
    tick() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.file)
                    return;
                yield this.writeState();
                let requestFileExists = !!(yield fs.promises.stat(this.requestPath).catch(_e => false));
                if (requestFileExists)
                    yield this.yieldAccess();
            }
            finally {
                setTimeout(() => this.tick(), this.tickInterval);
            }
        });
    }
    stateToString() {
        let keys = Object.keys(this.state);
        let parts = new Array(keys.length * 2);
        let i = 0;
        for (let key of keys) {
            let value = this.state[key];
            let type = typeof value;
            switch (type) {
                case "boolean":
                    value = value ? 't' : 'f';
                    break;
                case "string":
                    value = '"' + value.replaceAll('\n', '\\\n');
                    break;
                case "object":
                    value === null ? value = 'n' : value = 'o' + JSON.stringify(value);
                    break;
                case "undefined":
                    value = 'u';
                    break;
            }
            parts[i++] = key;
            parts[++i] = value;
        }
        return parts.join('\n');
    }
    updateStateFromString(state) {
        let rows = state.split(/(?<!\\)(?:\\\\)*\n/);
        for (let i = 0; i < rows.length - 1; i += 2) {
            let value = rows[i + 1];
            switch (value[0]) {
                case 't':
                    value = true;
                    break;
                case 'f':
                    value = false;
                    break;
                case 'n':
                    value = null;
                    break;
                case 'o':
                    value = JSON.parse(value.substring(1));
                    break;
                case 'u':
                    value = undefined;
                    break;
                case '"':
                    value = value.substring(1).replaceAll('\\\n', '\n');
                    break;
                default:
                    value = +value;
                    break;
            }
            this.state[rows[i]] = value;
        }
    }
}
exports.Storage = Storage;
