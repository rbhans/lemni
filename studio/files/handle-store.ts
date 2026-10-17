"use client"

// A tiny key-value store in IndexedDB. File handles can only be kept across reloads
// here (they're structured-cloneable, not JSON).

// Named when the product was BAS Board; changing it would forget recent files.
const DB_NAME = "basboard-files"
const STORE = "kv"

let opening: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return opening
}

function run<T>(
  mode: IDBTransactionMode,
  act: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return db().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const request = act(
          database.transaction(STORE, mode).objectStore(STORE)
        )
        request.onsuccess = () => resolve(request.result as T)
        request.onerror = () => reject(request.error)
      })
  )
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>("readonly", (store) => store.get(key))
  } catch {
    return undefined // Blocked storage: behave as if nothing was saved.
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    await run("readwrite", (store) => store.put(value, key))
  } catch {
    // Blocked storage: the board still works; recents just won't survive a reload.
  }
}
