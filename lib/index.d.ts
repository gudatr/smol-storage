export default class Storage {
    private path;
    private tickIntervalOwnership;
    private tickIntervalPersistence;
    private file;
    private requested;
    private state;
    private requestPath;
    private lockPath;
    private hasChanged;
    private active;
    constructor(path: string, tickIntervalOwnership?: number, tickIntervalPersistence?: number);
    /**
     * Shut the storage down, storage file will be released and writes or reads will no longer be performed
     * @param key
     */
    shutdown(): Promise<void>;
    /**
     * Delete a key from the storage
     * @param key
     */
    delete(key: string): Promise<void>;
    /**
     * Set a value to specified key
     * @param key
     * @param value valid types: number, boolean, string, null, undefined, object
     */
    set(key: string, value: number | boolean | string | null | undefined | object): Promise<void>;
    /**
     * Get a value from the specified key
     * @param key
     * @returns one of the following: number, boolean, string, null, undefined, object
     */
    get(key: string): Promise<number | boolean | string | null | undefined | object>;
    /**
     * Locks the specified key, the end of the ttl will be written to it
     * @param key
     * @param maximumTTL the maximum time the key is locked
     * @param retryTime if the lock can not be acquired, wait for this amount of ms for a retry
     * @returns the ttl of the key, pass it to unlock to ensure correct behaviour
     */
    lock(key: string, maximumTTL?: number, retryTime?: number): Promise<number>;
    /**
     * The same as lock but it will fail if it can not acquire the lock
     * @param key
     * @param maximumTTL
     */
    tryLock(key: string, maximumTTL?: number): Promise<void>;
    /**
     * Unlocks a key if the expectedValue still matches the key's value
     * @param key
     * @param expectedValue
     */
    unlock(key: string, expectedValue: number): Promise<void>;
    private writeState;
    private readState;
    private requestAccess;
    private acquireOwnership;
    private yieldOwnership;
    private tickOwnership;
    private tickPersistence;
    private stateToString;
    private updateStateFromString;
}
