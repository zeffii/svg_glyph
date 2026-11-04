// Underlay images are kept in the browser's IndexedDB, not in the project JSON.
// That keeps project saves small (localStorage has a ~5 MB limit). The project only stores each image's id.
// If IndexedDB is unavailable, images still work for the current session.

const DB_NAME = 'glyphpath-images', STORE = 'images';
let dbPromise = null;
const urls = new Map();      // id -> object URL, or null when the image isn't stored in this browser
const loading = new Set();

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch(() => null);
  }
  return dbPromise;
}

export async function putImage(blob) {
  const id = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  urls.set(id, URL.createObjectURL(blob));
  const db = await openDb();
  if (db) {
    await new Promise(resolve => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = resolve; tx.onerror = resolve;
    });
  }
  return id;
}

// Returns the object URL, undefined while loading (onReady fires when done), or null if it isn't in this browser.
export function imageURL(id, onReady) {
  if (urls.has(id)) return urls.get(id);
  if (!loading.has(id)) {
    loading.add(id);
    openDb().then(db => new Promise(resolve => {
      if (!db) return resolve(null);
      const req = db.transaction(STORE).objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    })).then(blob => {
      urls.set(id, blob ? URL.createObjectURL(blob) : null);
      loading.delete(id);
      onReady?.();
    });
  }
  return undefined;
}

// Read an image file's pixel size.
export function imageSize(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), im = new Image();
    im.onload = () => { resolve({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(url); };
    im.onerror = () => { reject(new Error('That file isn’t an image the browser can read.')); URL.revokeObjectURL(url); };
    im.src = url;
  });
}
