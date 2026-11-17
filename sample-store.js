const DATABASE = 'jutsu-personal-signs-v1';
let opened;
async function database() {
  if (!opened) opened = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('takes', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opened = null; reject(request.error); };
  });
  return opened;
}
async function transaction(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('takes', mode), request = action(tx.objectStore('takes'));
    let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || request.error);
    tx.onabort = () => reject(tx.error || new Error('Storage operation cancelled.'));
  });
}
export const loadSamples = () => transaction('readonly', store => store.getAll());
export const saveSample = sample => transaction('readwrite', store => store.put(sample));
export const deleteSample = id => transaction('readwrite', store => store.delete(id));
