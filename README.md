# smol-storage
A simple, atomic, persistent and concurrently usable storage without dependencies for Node.js

### Usage

#### Initialization

```
import Storage from "smol-storage";

let tickInterval = 100;

let storage = new Storage('path', tickInterval);
```

The path is the absolute file path of the storage file.
The tickInterval parameter will determine when (in milliseconds) writebacks to disk and ownership switches will occur.
Lower values will increase time spent on IO but allow for higher concurrent access.

#### Get

```
let value = await storage.get('key');
```

#### Set

```
await storage.set('key', 'string');
```

The storage can take the following types:
number | boolean | string | null | undefined | object

Note that objects will be serialized inside the storage so the storage itself will lose the reference on reloading from disk.

#### Delete

```
await storage.delete('key');
```

#### Locking

```
let lockTTL = await storage.lock('lock', 1000);

try {

    //...

} finally{

    await storage.unlock('lock', lockTTL);
}
```

With the lock function you can use the storage to gurantee atomicity over multiple processes.
The unlock function takes in the TTL of the key at the moment the lock was created so the key stays locked in case it has timed out.
The tryLock function will not wait for acquisition of the lock but fail if the key is already locked.

### Ownership and Concurrency

As mentioned in the initialization paragraph, instances of the same storage will switch ownership.
Only the instance that currently owns the storage can read and write to it.
While this limits concurrent access seemingly unnecessary when reading, it will guarantee interactions with the storage to be atomic.
It also allows instances to start up and share one storage without the need for a dedicated server.
If you need something with higher concurrent performance with persistency you might want to consider switching to redis AOF.

### Cleanup

On application exit the storage will clean up the _lock and _request files.
If it is shutdown forcefully and the exit event can not fire, you will have to delete them manually