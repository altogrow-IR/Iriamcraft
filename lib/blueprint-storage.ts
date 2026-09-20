import { openDB } from './storage.ts';
import {
  validateBlueprint,
  type CustomBlueprint,
} from './custom-blueprints.ts';
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blueprints', mode),
      request = action(tx.objectStore('blueprints'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
export async function loadBlueprints(): Promise<CustomBlueprint[]> {
  const values = await transaction('readonly', (s) => s.getAll());
  return values
    .map(validateBlueprint)
    .sort((a, b) => b.createdAt - a.createdAt);
}
export async function saveBlueprint(plan: CustomBlueprint) {
  await transaction('readwrite', (s) => s.put(validateBlueprint(plan)));
}
export async function deleteBlueprint(id: string) {
  await transaction('readwrite', (s) => s.delete(id));
}
export async function renameBlueprint(id: string, name: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('blueprints', 'readwrite'),
      store = tx.objectStore('blueprints'),
      req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) {
        tx.abort();
        return;
      }
      store.put({
        ...validateBlueprint(req.result),
        name: name.trim().slice(0, 30) || 'マイ設計図',
        updatedAt: Date.now(),
      });
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
