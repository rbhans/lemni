// Saving things in the browser. Settings belong to whoever uses this browser (not to a
// board); anything that should travel with a board goes in its shapes' props or meta.

import type { Atom } from "tldraw"

import { persistentAtom } from "@/studio/state"

/**
 * A signal that restores from and writes back to localStorage under `key`. Prefer
 * `pluginStorage(id).atom(...)`, which picks the key for you.
 */
export { persistentAtom }

/**
 * A plugin's corner of browser storage. Keys are `lemscape.plugin.<id>.<name>`, so they
 * never clash with the studio's or another plugin's.
 *
 * ```ts
 * const storage = pluginStorage("my-plugin")
 * export const lastSite = storage.atom("last-site", "", isString)
 * ```
 */
export function pluginStorage(pluginId: string) {
  const prefix = `lemscape.plugin.${pluginId}.`
  return {
    /**
     * The full key for a name, for code that reads localStorage or sessionStorage
     * itself. `from` works as it does for `atom`.
     */
    key(name: string, options: { from?: readonly string[] } = {}): string {
      const key = prefix + name
      moveOldKeys(key, options.from ?? [])
      return key
    },
    /**
     * A setting kept in this browser. `isValid` guards what's read back (a bad or old
     * value falls back to `initial`). `from` lists keys it was saved under before; the
     * first time it's read, the old value moves over.
     */
    atom<T>(
      name: string,
      initial: T,
      isValid: (value: unknown) => value is T,
      options: { from?: readonly string[] } = {}
    ): Atom<T> {
      const key = prefix + name
      moveOldKeys(key, options.from ?? [])
      return persistentAtom(key, initial, isValid)
    },
  }
}

/** Values saved under an old key move to the new one (a value already there wins). */
function moveOldKeys(key: string, from: readonly string[]) {
  if (!from.length) return
  for (const get of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const storage = get()
      for (const old of from) {
        const value = storage.getItem(old)
        if (value === null) continue
        if (storage.getItem(key) === null) storage.setItem(key, value)
        storage.removeItem(old)
      }
    } catch {
      // No storage here (the server) or it's blocked: nothing saved to move.
    }
  }
}
