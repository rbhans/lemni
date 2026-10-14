import assert from "node:assert/strict"
import { test } from "node:test"

import { PIECES, stateOptionsFor } from "./library.ts"
import { MANIFEST } from "./manifest.ts"
import { localPorts, originFor, rotateLocal, route, turnDir } from "./ports.ts"

test("every piece is described, and every description has a piece", () => {
  const ids = new Set(PIECES.map((p) => p.id))
  assert.deepEqual(
    PIECES.filter((p) => !MANIFEST[p.id]).map((p) => p.id),
    []
  )
  assert.deepEqual(
    Object.keys(MANIFEST).filter((id) => !ids.has(id)),
    []
  )
})

test("ports sit inside the drawing and have unique ids", () => {
  for (const piece of PIECES) {
    const entry = MANIFEST[piece.id]
    const ids = entry.ports.map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length, `${piece.id}: duplicate ports`)
    for (const port of entry.ports) {
      const [x, y] = port.at
      assert.ok(x >= 0 && x <= piece.width, `${piece.id}.${port.id} x`)
      assert.ok(y >= 0 && y <= piece.height, `${piece.id}.${port.id} y`)
      if (port.end)
        assert.ok(piece.stretch, `${piece.id}: end port on a fixed piece`)
    }
  }
})

test("roles only drive states the piece has", () => {
  for (const piece of PIECES) {
    const states = new Set(stateOptionsFor(piece).map((s) => s.key))
    for (const role of MANIFEST[piece.id].roles)
      for (const behavior of role.behaviors)
        if (behavior.effect === "state")
          assert.ok(
            states.has(behavior.params?.state as never),
            `${piece.id}: role ${role.role} drives a state it doesn't have`
          )
  }
})

test("ports follow size, flips and stretch", () => {
  const fan = PIECES.find((p) => p.id === "air/fan-centrifugal")!
  const [inPort, outPort] = localPorts(fan, MANIFEST[fan.id], {
    w: 240,
    h: 240,
  })
  assert.deepEqual([inPort.x, inPort.y, outPort.x], [42, 120, 226])
  const flipped = localPorts(fan, MANIFEST[fan.id], {
    w: 120,
    h: 120,
    flipX: true,
  })
  assert.deepEqual(
    flipped.map((p) => [p.id, p.x, p.dir]),
    [
      ["in", 99, "right"],
      ["out", 7, "left"],
    ]
  )
  const duct = PIECES.find((p) => p.id === "air/duct")!
  assert.deepEqual(
    localPorts(duct, MANIFEST[duct.id], { w: 300, h: 20 }).map((p) => [
      p.x,
      p.y,
    ]),
    [
      [0, 10],
      [300, 10],
    ]
  )
})

test("turns and placement", () => {
  assert.equal(turnDir("right", 1), "down")
  assert.equal(turnDir("up", -1), "left")
  assert.deepEqual(rotateLocal(10, 0, 1), [-0, 10])
  assert.deepEqual(originFor({ x: 9, y: 60 }, { x: 100, y: 200 }), {
    x: 91,
    y: 140,
  })
})

test("routes go straight when ports line up, else turn once", () => {
  assert.deepEqual(
    route({ x: 0, y: 50, dir: "right" }, { x: 100, y: 50.5 }).corner,
    null
  )
  const elbow = route({ x: 0, y: 0, dir: "right" }, { x: 100, y: 80 })
  assert.deepEqual(elbow.corner, { x: 100, y: 0 })
  assert.equal(elbow.runs.length, 2)
  const down = route({ x: 0, y: 0, dir: "down" }, { x: 100, y: 80 })
  assert.deepEqual(down.corner, { x: 0, y: 80 })
})
