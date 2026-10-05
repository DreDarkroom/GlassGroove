/* Glass Groove: the Takes library. Recordings are kept in this browser (IndexedDB), nowhere else: nothing is uploaded.
   Two stores: `takes` holds the small description of each take (so the list is instant), `blobs` holds the bytes. */
const DB = 'wipelight', VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('takes', { keyPath: 'id' });
      db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error || new Error('this browser would not open its storage')); };
  });
  return dbp;
}

const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const library = {
  /** take: { kind: 'performance'|'video'|'audio', name, duration, mime, meta? } and the bytes as a Blob. Resolves to the saved description. */
  async add(take, blob) {
    const db = await open(), rec = { id: newId(), created: new Date().toISOString(), notes: '', ...take, bytes: blob.size };
    const tx = db.transaction(['takes', 'blobs'], 'readwrite');
    tx.objectStore('takes').put(rec);
    tx.objectStore('blobs').put(blob, rec.id);
    await done(tx);
    return rec;
  },
  async list() {
    const db = await open();
    return (await wrap(db.transaction('takes').objectStore('takes').getAll())).sort((a, b) => (a.created < b.created ? 1 : -1));
  },
  async get(id) { const db = await open(); return wrap(db.transaction('takes').objectStore('takes').get(id)); },
  async blob(id) { const db = await open(); return wrap(db.transaction('blobs').objectStore('blobs').get(id)); },
  async update(id, patch) {
    const db = await open(), tx = db.transaction('takes', 'readwrite'), store = tx.objectStore('takes'), cur = await wrap(store.get(id));
    if (!cur) return null;
    const next = { ...cur, ...patch, id };
    store.put(next);
    await done(tx);
    return next;
  },
  /** Replace the bytes of a take (after an edit). */
  async replaceBlob(id, blob, patch = {}) {
    const db = await open(), tx = db.transaction(['takes', 'blobs'], 'readwrite'), cur = await wrap(tx.objectStore('takes').get(id));
    if (!cur) return null;
    const next = { ...cur, ...patch, id, bytes: blob.size };
    tx.objectStore('takes').put(next);
    tx.objectStore('blobs').put(blob, id);
    await done(tx);
    return next;
  },
  async remove(id) {
    const db = await open(), tx = db.transaction(['takes', 'blobs'], 'readwrite');
    tx.objectStore('takes').delete(id);
    tx.objectStore('blobs').delete(id);
    await done(tx);
  },
  async usage() { try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } catch (err) { return null; } },
  async persist() { try { return await navigator.storage.persist(); } catch (err) { return false; } },
};
