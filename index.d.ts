export declare class Storage {
    private path;
    private tickInterval;
    private file;
    private state;
    private requestPath;
    private hasChanged;
    private exclusiveFlag;
    constructor(path: string, tickInterval?: number);
    /**
     * Delete a key from the storage
     * @param key
     */
    Delete(key: string): Promise<void>;
    /**
     * Set a value to specified key
     * @param key
     * @param value valid types: number, boolean, string, null, undefined, object
     */
    Set(key: string, value: number | boolean | string | null | undefined | object): Promise<void>;
    /**
     * Get a value from the specified key
     * @param key
     * @returns one of the following: number, boolean, string, null, undefined, object
     */
    Get(key: string): Promise<number | boolean | string | null | undefined | object>;
    /**
     * Locks the specified key, the end of the ttl will be written to it
     * @param key
     * @param maximumTTL the maximum time the key is locked
     * @param retryTime if the lock can not be acquired, wait for this amount of ms for a retry
     * @returns the ttl of the key, pass it to unlock to ensure correct behaviour
     */
    Lock(key: string, maximumTTL?: number, retryTime?: number): Promise<number>;
    /**
     * The same as Lock but it will fail if it can not acquire the lock
     * @param key
     * @param maximumTTL
     */
    TryLock(key: string, maximumTTL?: number): Promise<void>;
    /**
     * Unlocks a key if the expectedValue still matches the key's value
     * @param key
     * @param expectedValue
     */
    Unlock(key: string, expectedValue: number): Promise<void>;
    private writeState;
    private readState;
    private requestAccess;
    private yieldAccess;
    private tick;
    private stateToString;
    private updateStateFromString;
}
//# sourceMappingURL=index.d.ts.map