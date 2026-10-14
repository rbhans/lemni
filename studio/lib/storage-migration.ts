// The product was called BAS Board before it became Lemni. Settings saved under the old
// key prefix move to the new one, once, before anything reads them. Pure apart from
// the storage objects it's given, so `node --test` can run it with fakes.

const OLD_PREFIX = "basboard."
const NEW_PREFIX = "lemni."

type KeyStore = Pick<
  Storage,
  "length" | "key" | "getItem" | "setItem" | "removeItem"
>

/** Moves `basboard.*` entries to `lemni.*`; an entry already under the new key wins. */
export function migrateKeys(storage: KeyStore): number {
  const old: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(OLD_PREFIX)) old.push(key)
  }
  for (const key of old) {
    const next = NEW_PREFIX + key.slice(OLD_PREFIX.length)
    const value = storage.getItem(key)
    if (value !== null && storage.getItem(next) === null)
      storage.setItem(next, value)
    storage.removeItem(key)
  }
  return old.length
}

/** Runs once per page load, before the studio's modules load. */
export function migrateStorage() {
  for (const get of [() => localStorage, () => sessionStorage]) {
    try {
      migrateKeys(get())
    } catch {
      // Storage blocked (private mode): nothing saved to move.
    }
  }
}
