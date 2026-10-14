import assert from "node:assert/strict"
import { test } from "node:test"

import {
  endKey,
  linksOf,
  otherEnd,
  prune,
  readLinks,
  remapLinks,
  sideOf,
  withComment,
  withLink,
  withoutLink,
  type BoardLink,
  type LinkEnd,
} from "./model.ts"

const frame = (id: string): LinkEnd => ({ kind: "shape", shapeId: id })
const sheet = (id: string, page: number): LinkEnd => ({
  kind: "docPage",
  shapeId: id,
  page,
})
const point: LinkEnd = {
  kind: "point",
  source: "sim",
  point: "slot:/AHU_1",
  label: "AHU-1",
}

test("links have no direction and never duplicate", () => {
  let links: BoardLink[] = []
  const first = withLink(links, frame("graphic"), sheet("cd", 3), "l1")
  assert.ok("link" in first)
  links = first.links
  const again = withLink(links, sheet("cd", 3), frame("graphic"), "l2")
  assert.ok("error" in again)
  assert.ok("error" in withLink(links, point, point, "l3"))
  assert.deepEqual(otherEnd(links[0], sheet("cd", 3)), frame("graphic"))
})

test("a document card's links include its pages'", () => {
  let links: BoardLink[] = []
  for (const [a, b, id] of [
    [frame("graphic"), sheet("cd", 3), "l1"],
    [frame("plan"), sheet("cd", 40), "l2"],
    [frame("plan"), point, "l3"],
  ] as const) {
    const result = withLink(links, a, b, id)
    links = result.links
  }
  assert.deepEqual(
    linksOf(links, frame("cd")).map((l) => l.id),
    ["l1", "l2"]
  )
  assert.deepEqual(
    linksOf(links, sheet("cd", 3)).map((l) => l.id),
    ["l1"]
  )
  assert.deepEqual(
    linksOf(links, frame("plan")).map((l) => l.id),
    ["l2", "l3"]
  )
  links = withComment(links, "l1", "Sequence for this AHU")
  assert.equal(links[0].comment, "Sequence for this AHU")
  assert.equal(withoutLink(links, "l2").length, 2)
})

test("deleting a frame, card or page drops its links", () => {
  const links: BoardLink[] = [
    { id: "a", a: frame("f1"), b: sheet("cd", 2), comment: "" },
    { id: "b", a: { kind: "page", pageId: "p1" }, b: point, comment: "" },
    { id: "c", a: frame("f2"), b: point, comment: "" },
  ]
  assert.deepEqual(prune(links, { shapes: new Set(["cd"]) }).removed, 1)
  const result = prune(links, {
    pages: new Set(["p1"]),
    shapes: new Set(["f2"]),
  })
  assert.deepEqual(
    result.links.map((l) => l.id),
    ["a"]
  )
})

test("links survive a round trip through the board and skip bad entries", () => {
  const links = readLinks({
    links: [
      { id: "a", a: frame("f1"), b: point, comment: "x" },
      { id: "b", a: { kind: "nope" }, b: point },
      "junk",
    ],
  })
  assert.equal(links.length, 1)
  assert.equal(endKey(links[0].b), "point:sim\nslot:/AHU_1")
  assert.deepEqual(readLinks({}), [])
})

test("paste special re-points captured links at the copies", () => {
  const captured: BoardLink[] = [
    { id: "a", a: frame("f1"), b: frame("f2"), comment: "pair" },
    { id: "b", a: frame("f1"), b: point, comment: "station" },
    { id: "c", a: frame("x"), b: point, comment: "untouched" },
  ]
  let n = 0
  const out = remapLinks(
    captured,
    new Map([
      ["f1", "g1"],
      ["f2", "g2"],
    ]),
    () => `n${++n}`
  )
  assert.deepEqual(
    out.map((l) => [endKey(l.a), endKey(l.b), l.comment]),
    [
      ["shape:g1", "shape:g2", "pair"],
      ["shape:g1", "point:sim\nslot:/AHU_1", "station"],
    ]
  )
})

test("a card's own page is 'here' for its links", () => {
  const link: BoardLink = {
    id: "a",
    a: sheet("cd", 3),
    b: frame("graphic"),
    comment: "",
  }
  assert.deepEqual(sideOf(link, frame("cd")), sheet("cd", 3))
  assert.deepEqual(otherEnd(link, sideOf(link, frame("cd"))), frame("graphic"))
  assert.deepEqual(sideOf(link, frame("graphic")), frame("graphic"))
})
