// Lagring av kvitton och foton i webbläsarens IndexedDB.
// Fas 2 ersätter den här filen med en Supabase-version som har samma funktioner,
// så att resten av appen inte behöver ändras.

const DB_NAME = 'kvitto-app';
const DB_VERSION = 1;

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(storeNames, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeNames, mode);
        let result;
        Promise.resolve(fn(tx)).then((r) => (result = r), reject);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

const asPromise = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Alla kvitton, nyaste datum först. */
export async function listReceipts() {
  const all = await run(['receipts'], 'readonly', (tx) => asPromise(tx.objectStore('receipts').getAll()));
  return all.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

export function getReceipt(id) {
  return run(['receipts'], 'readonly', (tx) => asPromise(tx.objectStore('receipts').get(id)));
}

/**
 * Sparar ett kvitto. `photo` är en Blob (nytt foto), `null` (ta bort foto)
 * eller `undefined` (behåll befintligt foto).
 */
export function saveReceipt(receipt, photo) {
  const now = Date.now();
  const record = { ...receipt, id: receipt.id || newId(), createdAt: receipt.createdAt || now, updatedAt: now };
  if (photo !== undefined) record.hasPhoto = Boolean(photo);
  return run(['receipts', 'photos'], 'readwrite', (tx) => {
    tx.objectStore('receipts').put(record);
    if (photo) tx.objectStore('photos').put(photo, record.id);
    else if (photo === null) tx.objectStore('photos').delete(record.id);
    return record;
  });
}

export function deleteReceipt(id) {
  return run(['receipts', 'photos'], 'readwrite', (tx) => {
    tx.objectStore('receipts').delete(id);
    tx.objectStore('photos').delete(id);
  });
}

export function getPhoto(id) {
  return run(['photos'], 'readonly', (tx) => asPromise(tx.objectStore('photos').get(id)));
}

/** Ber webbläsaren att inte rensa appens data automatiskt. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return navigator.storage?.persist ? await navigator.storage.persist() : false;
  } catch {
    return false;
  }
}
