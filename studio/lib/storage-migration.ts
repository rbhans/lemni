// The product was called BAS Board, then Lemni, before it became Lemscape. Settings saved
// under an old key prefix move to the new one, once, before anything reads them. Pure
// apart from the storage objects it's given, so `node --test` can run it with fakes.

/** Newest first: when the same setting exists under both, the newer name wins. */
const OLD_PREFIXES = ["lemni.", "basboard."]
const NEW_PREFIX = "lemscape."

type KeyStore = Pick<
  Storage,
  "length" | "key" | "getItem" | "setItem" | "removeItem"
>

/** Moves `lemni.*` and `basboard.*` entries to `lemscape.*`; an entry already there wins. */
export function migrateKeys(storage: KeyStore): number {
  let moved = 0
  for (const prefix of OLD_PREFIXES) {
    const old: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(prefix)) old.push(key)
    }
    for (const key of old) {
      const next = NEW_PREFIX + key.slice(prefix.length)
      const value = storage.getItem(key)
      if (value !== null && storage.getItem(next) === null)
        storage.setItem(next, value)
      storage.removeItem(key)
    }
    moved += old.length
  }
  return moved
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
