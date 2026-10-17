import assert from "node:assert/strict"
import { test } from "node:test"

import { migrateKeys } from "./storage-migration.ts"

function fakeStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries))
  return {
    map,
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

test("old settings move to the new prefix once; newer ones win", () => {
  const storage = fakeStorage({
    "basboard.plugins.v1": '{"enabled":[]}',
    "basboard.ai-access.v1": '"full"',
    "lemscape.ai-access.v1": '"edit"',
    "other.key": "kept",
  })
  assert.equal(migrateKeys(storage), 2)
  assert.deepEqual(Object.fromEntries(storage.map), {
    "lemscape.plugins.v1": '{"enabled":[]}',
    "lemscape.ai-access.v1": '"edit"',
    "other.key": "kept",
  })
  assert.equal(migrateKeys(storage), 0)
})

test("Lemni-era settings move too, and beat older BAS Board ones", () => {
  const storage = fakeStorage({
    "basboard.workspace.v1": '"documents"',
    "lemni.workspace.v1": '"canvas"',
    "lemni.board-name.v1": '"AHU-1"',
  })
  assert.equal(migrateKeys(storage), 3)
  assert.deepEqual(Object.fromEntries(storage.map), {
    "lemscape.workspace.v1": '"canvas"',
    "lemscape.board-name.v1": '"AHU-1"',
  })
})
