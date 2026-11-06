export type IdbRun<T = unknown> = (transaction: IDBTransaction) => IDBRequest<T> | void;

export function createIdb(
  name: string,
  version: number,
  upgrade: (database: IDBDatabase) => void
) {
  let opening: Promise<IDBDatabase> | undefined;

  const open = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onupgradeneeded = () => upgrade(request.result);
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error(`Could not open IndexedDB database: ${name}`));
      request.onblocked = () => reject(new Error(`IndexedDB database upgrade is blocked: ${name}`));
    });
    return opening;
  };

  return {
    async tx<T = unknown>(stores: string[], mode: IDBTransactionMode, run: IdbRun<T>): Promise<T | undefined> {
      const database = await open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(stores, mode);
        let result: T | undefined;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
        transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));

        try {
          const request = run(transaction);
          if (request) {
            request.onsuccess = () => { result = request.result; };
            request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
          }
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      });
    }
  };
}