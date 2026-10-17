import assert from "node:assert/strict"
import { test } from "node:test"

import {
  parseTarget,
  safeUrl,
  serializeTarget,
  type NavTarget,
} from "./targets.ts"

test("targets round-trip through their stored string", () => {
  const targets: NavTarget[] = [
    { kind: "page", pageId: "page:abc" },
    { kind: "shape", shapeId: "shape:xyz" },
    { kind: "docPage", shapeId: "shape:doc1", page: 5 },
    {
      kind: "point",
      source: "niagara:https://10.0.0.20",
      point: "slot:/A/B/DA-T",
      label: "DA-T",
    },
    { kind: "url", href: "https://example.com/trend?x=1" },
  ]
  for (const target of targets)
    assert.deepEqual(parseTarget(serializeTarget(target)), target)
})

test("plain page and shape ids saved before targets existed still work", () => {
  assert.deepEqual(parseTarget("page:old"), {
    kind: "page",
    pageId: "page:old",
  })
  assert.deepEqual(parseTarget("shape:old"), {
    kind: "shape",
    shapeId: "shape:old",
  })
})

test("bad targets read as none", () => {
  for (const value of [
    "",
    "nonsense",
    "doc:shape:a",
    "doc:shape:a#0",
    "doc:x#2",
    "point:",
    42,
    null,
    "url:javascript:alert(1)",
  ])
    assert.equal(parseTarget(value), null, String(value))
})

test("web addresses get a scheme and only http(s) is allowed", () => {
  assert.equal(safeUrl("example.com"), "https://example.com/")
  assert.equal(safeUrl(" http://10.0.0.5/ord "), "http://10.0.0.5/ord")
  assert.equal(safeUrl("javascript:alert(1)"), null)
  assert.equal(safeUrl("file:///etc/passwd"), null)
  assert.equal(safeUrl(""), null)
})

test("a point's label falls back to the last part of its path", () => {
  assert.deepEqual(parseTarget("point:src\nslot:/AHU_1/points/SF-S\n"), {
    kind: "point",
    source: "src",
    point: "slot:/AHU_1/points/SF-S",
    label: "SF-S",
  })
})
