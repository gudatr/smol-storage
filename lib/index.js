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
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
class Storage {
    constructor(path, tickIntervalOwnership = 50, tickIntervalPersistence = 500) {
        this.path = path;
        this.tickIntervalOwnership = tickIntervalOwnership;
        this.tickIntervalPersistence = tickIntervalPersistence;
        this.requested = false;
        this.owned = false;
        this.state = {};
        this.hasChanged = false;
        this.active = true;
        this.requestPath = path + "_request";
        this.lockPath = path + "_lock";
        setTimeout(() => this.tickOwnership(), tickIntervalOwnership);
        setTimeout(() => this.tickPersistence(), tickIntervalPersistence);
        process.on('exit', async (_code) => {
            if (this.requested)
                fs.rmdir(this.requestPath, (err) => console.log(err));
            if (this.owned) {
                await this.writeState();
                fs.rmdir(this.lockPath, (err) => console.log(err));
            }
        });
    }
    /**
     * Shut the storage down, storage file will be released and writes or reads will no longer be performed
     * @param key
     */
    async shutdown() {
        this.active = false;
        await this.yieldOwnership();
    }
    /**
     * Delete a key from the storage
     * @param key
     */
    async delete(key) {
        await this.requestAccess();
        delete this.state[key];
        this.hasChanged = true;
    }
    /**
     * Set a value to specified key
     * @param key
     * @param value valid types: number, boolean, string, null, undefined, object
     */
    async set(key, value) {
        await this.requestAccess();
        this.state[key] = value;
        this.hasChanged = true;
    }
    /**
     * Get a value from the specified key
     * @param key
     * @returns one of the following: number, boolean, string, null, undefined, object
     */
    async get(key) {
        await this.requestAccess();
        return this.state[key];
    }
    /**
     * Locks the specified key, the end of the ttl will be written to it
     * @param key
     * @param maximumTTL the maximum time the key is locked
     * @param retryTime if the lock can not be acquired, wait for this amount of ms for a retry
     * @returns the ttl of the key, pass it to unlock to ensure correct behaviour
     */
    async lock(key, maximumTTL = 10000, retryTime = 10) {
        await this.requestAccess();
        let lock = this.state[key];
        let now = Date.now();
        if (typeof lock === 'number' && !Number.isNaN(lock) && lock > now) {
            return await new Promise((resolve, _reject) => {
                setTimeout(async () => { resolve(this.lock(key, maximumTTL)); }, Math.min(lock - now, retryTime));
            });
        }
        let ttl = now + maximumTTL;
        this.state[key] = ttl;
        this.hasChanged = true;
        return ttl;
    }
    /**
     * The same as lock but it will fail if it can not acquire the lock
     * @param key
     * @param maximumTTL
     */
    async tryLock(key, maximumTTL = 10000) {
        await this.requestAccess();
        let lock = this.state[key];
        if (lock && lock > Date.now())
            throw new Error(`Key ${key} is already locked until ${lock}`);
        this.state[key] = Date.now() + maximumTTL;
        this.hasChanged = true;
    }
    /**
     * Unlocks a key if the expectedValue still matches the key's value
     * @param key
     * @param expectedValue
     */
    async unlock(key, expectedValue) {
        let value = await this.get(key);
        if (value === expectedValue)
            await this.delete(key);
    }
    async writeState() {
        if (this.hasChanged && this.file) {
            await this.file.truncate();
            await this.file.write(this.stateToString(), 0, 'utf-8');
            this.hasChanged = false;
        }
    }
    async readState() {
        this.file = await fs.promises.open(this.path, 'a+');
        let result = await this.file.read({ position: 0 });
        let fileContents = result.buffer;
        this.updateStateFromString(fileContents.toString('utf-8', 0, result.bytesRead));
    }
    async requestAccess() {
        if (this.active && this.file)
            return;
        return new Promise(async (resolve, _reject) => {
            await this.acquireOwnership(this.requestPath, this.tickIntervalOwnership / 3);
            this.requested = true;
            await this.acquireOwnership(this.lockPath, this.tickIntervalOwnership / 3);
            this.owned = true;
            await fs.promises.rmdir(this.requestPath);
            this.requested = false;
            await this.readState();
            resolve(true);
        });
    }
    async acquireOwnership(path, wait) {
        return new Promise((resolve, reject) => {
            fs.mkdir(path, (err) => {
                if (err && err.code === 'EEXIST') {
                    setTimeout(async () => {
                        await this.acquireOwnership(path, wait);
                        resolve(true);
                    }, wait);
                }
                else if (err) {
                    reject(err);
                }
                else {
                    resolve(true);
                }
            });
        });
    }
    async yieldOwnership() {
        var _a;
        await this.writeState();
        await ((_a = this.file) === null || _a === void 0 ? void 0 : _a.close());
        await fs.promises.rmdir(this.lockPath);
        this.owned = false;
        this.file = undefined;
    }
    async tickOwnership() {
        try {
            if (!this.file)
                return;
            let requestFileExists = !(await fs.promises.access(this.requestPath, fs.constants.F_OK).catch(_e => true));
            if (requestFileExists)
                await this.yieldOwnership();
        }
        finally {
            if (this.active)
                setTimeout(() => this.tickOwnership(), this.tickIntervalOwnership);
        }
    }
    async tickPersistence() {
        try {
            if (!this.file)
                return;
            await this.writeState();
        }
        finally {
            if (this.active)
                setTimeout(() => this.tickPersistence(), this.tickIntervalPersistence);
        }
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
            parts[i++] = value;
        }
        console.log(parts);
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
exports.default = Storage;
