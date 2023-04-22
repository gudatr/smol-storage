import * as fs from "fs";

type StorageState = { [Key: string]: number | boolean | string | null | undefined | object };

export default class Storage {

    private file: fs.promises.FileHandle | undefined;
    private requested: boolean = false;
    private owned: boolean = false;
    private state: StorageState = {};
    private requestPath: string;
    private lockPath: string;
    private hasChanged: boolean = false;
    private active: boolean = true;

    constructor(private path: string, private tickIntervalOwnership: number = 50, private tickIntervalPersistence = 500) {
        this.requestPath = path + "_request";
        this.lockPath = path + "_lock";

        setTimeout(() => this.tickOwnership(), tickIntervalOwnership);

        setTimeout(() => this.tickPersistence(), tickIntervalPersistence);

        process.on('exit', async (_code) => {
            if (this.requested) fs.rmdir(this.requestPath, (err) => console.log(err));

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
    public async shutdown() {
        this.active = false;
        await this.yieldOwnership();
    }

    /**
     * Delete a key from the storage
     * @param key 
     */
    public async delete(key: string) {
        await this.requestAccess();
        delete this.state[key];
        this.hasChanged = true;
    }

    /**
     * Set a value to specified key
     * @param key
     * @param value valid types: number, boolean, string, null, undefined, object
     */
    public async set(key: string, value: number | boolean | string | null | undefined | object) {
        await this.requestAccess();
        this.state[key] = value;
        this.hasChanged = true;
    }

    /**
     * Get a value from the specified key
     * @param key
     * @returns one of the following: number, boolean, string, null, undefined, object
     */
    public async get(key: string): Promise<number | boolean | string | null | undefined | object> {
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
    public async lock(key: string, maximumTTL = 10000, retryTime = 10): Promise<number> {
        await this.requestAccess();
        let lock: any = this.state[key];
        let now = Date.now();
        if (typeof lock === 'number' && !Number.isNaN(lock) && lock > now) {
            return await new Promise((resolve, _reject) => {
                setTimeout(async () => { resolve(this.lock(key, maximumTTL)) }, Math.min(lock - now, retryTime));
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
    public async tryLock(key: string, maximumTTL = 10000) {
        await this.requestAccess();
        let lock: any = this.state[key];
        if (lock && lock > Date.now()) throw new Error(`Key ${key} is already locked until ${lock}`);
        this.state[key] = Date.now() + maximumTTL;
        this.hasChanged = true;
    }

    /**
     * Unlocks a key if the expectedValue still matches the key's value
     * @param key 
     * @param expectedValue 
     */
    public async unlock(key: string, expectedValue: number) {
        let value = await this.get(key);
        if (value === expectedValue) await this.delete(key);
    }

    private async writeState() {
        if (this.hasChanged && this.file) {
            await this.file.truncate();
            await this.file.write(this.stateToString(), 0, 'utf-8');
            this.hasChanged = false;
        }
    }

    private async readState() {
        this.file = await fs.promises.open(this.path, 'a+');
        let result = await this.file.read({ position: 0 });
        let fileContents = result.buffer;
        this.updateStateFromString(fileContents.toString('utf-8', 0, result.bytesRead));
    }

    private async requestAccess() {
        if (this.active && this.file) return;

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

    private async acquireOwnership(path: string, wait: number) {
        return new Promise((resolve, reject) => {
            fs.mkdir(path, (err) => {
                if (err && err.code === 'EEXIST') {
                    setTimeout(async () => {
                        await this.acquireOwnership(path, wait); resolve(true);
                    }, wait);
                } else if (err) {
                    reject(err);
                } else {
                    resolve(true);
                }
            });
        });
    }

    private async yieldOwnership() {
        await this.writeState();
        await this.file?.close();
        await fs.promises.rmdir(this.lockPath);
        this.owned = false;
        this.file = undefined;
    }

    private async tickOwnership() {
        try {
            if (!this.file) return;

            let requestFileExists = !(await fs.promises.access(this.requestPath, fs.constants.F_OK).catch(_e => true));

            if (requestFileExists) await this.yieldOwnership();

        } finally {
            if (this.active) setTimeout(() => this.tickOwnership(), this.tickIntervalOwnership);
        }
    }

    private async tickPersistence() {
        try {
            if (!this.file) return;

            await this.writeState();

        } finally {
            if (this.active) setTimeout(() => this.tickPersistence(), this.tickIntervalPersistence);
        }
    }

    private stateToString(): string {
        let keys = Object.keys(this.state);
        let parts = new Array(keys.length * 2);
        let i = 0;
        for (let key of keys) {
            let value: any = this.state[key];
            let type = typeof value;
            switch (type) {
                case "boolean": value = value ? 't' : 'f'; break;
                case "string": value = '"' + value.replaceAll('\n', '\\\n'); break;
                case "object": value === null ? value = 'n' : value = 'o' + JSON.stringify(value); break;
                case "undefined": value = 'u'; break;
            }
            parts[i++] = key;
            parts[i++] = value;
        }
        console.log(parts);
        return parts.join('\n');
    }

    private updateStateFromString(state: string) {
        let rows = state.split(/(?<!\\)(?:\\\\)*\n/);
        for (let i = 0; i < rows.length - 1; i += 2) {
            let value: any = rows[i + 1];
            switch (value[0]) {
                case 't': value = true; break;
                case 'f': value = false; break;
                case 'n': value = null; break;
                case 'o': value = JSON.parse(value.substring(1)); break;
                case 'u': value = undefined; break;
                case '"': value = value.substring(1).replaceAll('\\\n', '\n'); break;
                default: value = +value; break;
            }
            this.state[rows[i]] = value;
        }
    }
}
