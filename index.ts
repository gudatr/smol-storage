import * as fs from "fs";

type StorageState = { [Key: string]: number | boolean | string | null | undefined | object };

export class Storage {

    private file: fs.promises.FileHandle | undefined;

    private state: StorageState = {};

    private requestPath: string;

    private hasChanged: boolean = false;

    private exclusiveFlag = fs.constants.S_IRUSR | fs.constants.S_IWUSR | fs.constants.O_CREAT;

    constructor(private path: string, private tickInterval: number = 100) {
        this.requestPath = path + "_";
        setTimeout(() => this.tick(), tickInterval);
    }

    public async Delete(key: string) {
        await this.requestAccess();
        delete this.state[key];
        this.hasChanged = true;
    }

    public async Set(key: string, value: number | boolean | string | null | undefined | object) {
        await this.requestAccess();
        this.state[key] = value;
        this.hasChanged = true;
    }

    public async Get(key: string): Promise<number | boolean | string | null | undefined | object> {
        await this.requestAccess();
        return this.state[key];
    }

    public async Lock(key: string, ttl_ms = 10000): Promise<number> {
        await this.requestAccess();
        let lock: any = this.state[key];
        let now = Date.now();
        if (typeof lock === 'number' && !Number.isNaN(lock) && lock > now) {
            return await new Promise((resolve, _reject) => {
                setTimeout(async () => { resolve(this.Lock(key, ttl_ms)) }, lock - now);
            });
        }
        let ttl = now + ttl_ms;
        this.state[key] = ttl;
        this.hasChanged = true;
        return ttl;
    }

    public async TryLock(key: string, ttl_ms = 10000) {
        await this.requestAccess();
        let lock: any = this.state[key];
        if (lock && lock > Date.now()) throw new Error(`Key ${key} is already locked until ${lock}`);
        this.state[key] = Date.now() + ttl_ms;
        this.hasChanged = true;
    }

    public async Unlock(key: string, expectedValue: number) {
        let value = await this.Get(key);
        if (value === expectedValue) await this.Delete(key);
    }

    private async writeState() {
        if (this.hasChanged && this.file) {
            await this.file.truncate();
            await this.file.write(this.stateToString(), 0, 'utf-8');
            this.hasChanged = false;
        }
    }

    private async readState() {
        await this.requestAccess();
        let tempHandle = await fs.promises.open(this.path, 'r+', this.exclusiveFlag);
        this.file?.close(); this.file = tempHandle;
        let result = (await tempHandle.read());
        let fileContents = result.buffer;
        this.updateStateFromString(fileContents.toString('utf-8', 0, result.bytesRead));
    }

    private async requestAccess() {
        if (this.file) return;

        return new Promise(async (resolve, _reject) => {
            let requestFileHandle = await fs.promises.open(this.requestPath, 'a+', this.exclusiveFlag);
            this.file = await fs.promises.open(this.path, 'a+', this.exclusiveFlag);
            await requestFileHandle.close();
            await fs.promises.unlink(this.requestPath).catch((_err) => { });
            await this.readState();
            resolve(true);
        });
    }

    private async yieldAccess() {
        this.file?.close();
        this.file = undefined;
    }

    private async tick() {
        try {
            if (!this.file) return;

            await this.writeState();

            let requestFileExists = !!(await fs.promises.stat(this.requestPath).catch(_e => false));

            if (requestFileExists) await this.yieldAccess();

        } finally {
            setTimeout(() => this.tick(), this.tickInterval);
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
            parts[++i] = value;
        }
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
