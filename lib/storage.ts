import { parseWorld, type World } from './world.ts';
export const LEGACY_KEY = 'iriamcraft-world-v1';
let connection: Promise<IDBDatabase> | undefined;
export function openDB() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('iriamcraft', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('worlds'))
        db.createObjectStore('worlds');
      if (!db.objectStoreNames.contains('blueprints'))
        db.createObjectStore('blueprints', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        connection = undefined;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      connection = undefined;
      reject(req.error);
    };
    req.onblocked = () => {
      connection = undefined;
      reject(Error('ほかのタブを閉じてください'));
    };
  }));
}
async function read(): Promise<World | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('worlds', 'readonly');
    const req = tx.objectStore('worlds').get('current');
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
let queue = Promise.resolve();
export function saveWorld(world: World): Promise<void> {
  const next = queue
    .catch(() => {})
    .then(async () => {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('worlds', 'readwrite');
        tx.objectStore('worlds').put(world, 'current');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      });
    });
  queue = next;
  return next;
}
export async function loadWorld(): Promise<World | undefined> {
  let current: World | undefined;
  try {
    current = await read();
  } catch (error) {
    // A browser may deny IndexedDB but still allow recovery of the old local save.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return parseWorld(legacy);
    throw error;
  }
  if (current !== undefined) return parseWorld(JSON.stringify(current));
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return;
  const world = parseWorld(legacy);
  try {
    await saveWorld(world);
  } catch {
    return world;
  } // Keep the legacy island playable; autosave reports the failure.
  const verified = await read();
  if (!verified || JSON.stringify(verified) !== JSON.stringify(world))
    throw Error('移行を確認できません');
  // The original v1 value deliberately remains available for recovery.
  return world;
}
