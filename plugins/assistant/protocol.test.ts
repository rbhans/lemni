import assert from "node:assert/strict"
import { test } from "node:test"

import { allows } from "./protocol.ts"

test("access levels allow tools step by step", () => {
  assert.equal(allows("off", "read"), false)
  assert.equal(allows("read", "read"), true)
  assert.equal(allows("read", "edit"), false)
  assert.equal(allows("edit", "edit"), true)
  assert.equal(allows("edit", "write"), false)
  assert.equal(allows("full", "write"), true)
})
