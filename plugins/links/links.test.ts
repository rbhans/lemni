import assert from "node:assert/strict"
import { test } from "node:test"

import { layoutAll, NODE, placeNew } from "./layout.ts"

test("wire sheet: one column per category, ordered to avoid crossings", () => {
  const nodes = [
    { key: "d1", column: 0, label: "M-601" },
    { key: "d2", column: 0, label: "M-602" },
    { key: "u1", column: 1, label: "AHU-1" },
    { key: "u2", column: 1, label: "VAV-1" },
  ]
  // M-601 ↔ VAV-1 and M-602 ↔ AHU-1: by name they would cross.
  const positions = layoutAll(nodes, [
    { a: "d1", b: "u2" },
    { a: "d2", b: "u1" },
  ])
  const y = (k: string) => positions.get(k)!.y
  const x = (k: string) => positions.get(k)!.x
  assert.equal(x("d1"), 0)
  assert.equal(x("u1"), NODE.w + NODE.gapX)
  // Each document lines up with the graphic it links to.
  assert.equal(y("d1") < y("d2"), y("u2") < y("u1"))
})

test("new boxes go under their column without moving others", () => {
  const existing = [
    { column: 0, x: 0, y: 0 },
    { column: 0, x: 0, y: 76 },
    { column: 2, x: 380, y: 0 },
  ]
  assert.deepEqual(placeNew(existing, 0), { x: 0, y: 152 })
  assert.deepEqual(placeNew(existing, 1), { x: NODE.w + NODE.gapX, y: 0 })
})
