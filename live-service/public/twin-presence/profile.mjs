const database = 'loka-twin-local';
const store = 'profile';

export async function localProfile(mode, operation) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(store, mode);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      const request = operation(transaction.objectStore(store));
    });
  } finally {
    db.close();
  }
}
