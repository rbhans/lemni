import assert from "node:assert/strict"
import { test } from "node:test"

import {
  matchPoints,
  pickCandidate,
  queryFor,
  readPointsList,
  type PointCandidate,
} from "./points-list.ts"

const station: PointCandidate[] = [
  ["AHU_1", "DA-T"],
  ["AHU_1", "DA-T-SP"],
  ["AHU_1", "SF-S"],
  ["VAV_2_01", "SpaceTemp"],
  ["VAV_2_02", "SpaceTemp"],
  ["VAV_2_10", "SpaceTemp"],
].map(([equipment, name]) => ({
  source: "niagara:http://127.0.0.1:8710",
  point: `slot:/Drivers/BacnetNetwork/${equipment}/points/${name}`,
  label: name,
  path: `Drivers/BacnetNetwork/${equipment}/points`,
  kind: "number",
}))

/** Substring search over names, like a station's. */
const search = async (name: string) =>
  station.filter((c) => c.label.toLowerCase().includes(name.toLowerCase()))

test("a points list is found by its headings and its cells", () => {
  const list = readPointsList([
    ["Name", "Point", "Units"],
    ["AHU-1 Supply Temp", "AHU-1/DA-T", "°F"],
    ["AHU-1 Fan Status", "AHU-1/SF-S", ""],
  ])
  assert.equal(list?.pointColumn, 1)
  assert.deepEqual(list?.queries[0], {
    name: "DA-T",
    id: null,
    context: ["AHU-1"],
  })

  const withEquipment = readPointsList([
    ["Equipment", "Point name", "Description"],
    ["VAV-2-01", "SpaceTemp", "Space temperature"],
    ["VAV-2-02", "SpaceTemp", "Space temperature"],
  ])
  assert.equal(withEquipment?.equipmentColumn, 0)
  assert.deepEqual(withEquipment?.queries[1].context, ["VAV-2-02"])

  // Any column with ORDs counts, whatever its heading.
  const ords = readPointsList([
    ["Thing"],
    ["station:|slot:/Drivers/BacnetNetwork/AHU_1/points/DA$2dT"],
  ])
  assert.deepEqual(ords?.queries[0], {
    name: "DA-T",
    id: "slot:/Drivers/BacnetNetwork/AHU_1/points/DA$2dT",
    context: ["Drivers", "BacnetNetwork", "AHU_1", "points"],
  })
})

test("sheets that don't name points aren't points lists", () => {
  assert.equal(
    readPointsList([
      ["Date", "kWh"],
      ["2026-10-01", "1200"],
    ]),
    null
  )
  // An equipment list: a Tag column, but nothing says its rows are points.
  assert.equal(
    readPointsList([
      ["Tag", "Description"],
      ["AHU-1", "Rooftop unit"],
      ["AHU-2", "Basement unit"],
    ]),
    null
  )
  // The same names beside a Units column are points.
  assert.equal(
    readPointsList([
      ["Name", "Units"],
      ["DA-T", "°F"],
    ])?.queries[0].name,
    "DA-T"
  )
  assert.equal(readPointsList([["Point"]]), null)
  // A Point column that's mostly empty.
  assert.equal(
    readPointsList([
      ["Point", "Note"],
      ["", "a"],
      ["", "b"],
      ["DA-T", "c"],
    ]),
    null
  )
})

test("a Metasys reference is matched by its id", () => {
  const query = queryFor("SITE:NAE-1/FC-2.VMA-1.ZN-T", null)
  assert.equal(query.name, "ZN-T")
  const fqr: PointCandidate = {
    source: "sct:Archive",
    point: "SITE:NAE-1/FC-2.VMA-1.ZN-T",
    label: "ZN-T",
    path: "NAE-1.FC-2.VMA-1",
    kind: "number",
  }
  assert.equal(pickCandidate(query, [fqr, { ...fqr, point: "other" }]), fqr)
})

test("names are matched exactly, narrowed by equipment", async () => {
  const pick = (cell: string, equipment: string | null = null) =>
    pickCandidate(queryFor(cell, equipment), station)
  // DA-T, not DA-T-SP.
  assert.equal(
    (pick("DA-T") as PointCandidate).point,
    "slot:/Drivers/BacnetNetwork/AHU_1/points/DA-T"
  )
  assert.equal(
    (pick("SpaceTemp", "VAV-2-01") as PointCandidate).point,
    "slot:/Drivers/BacnetNetwork/VAV_2_01/points/SpaceTemp"
  )
  // Zero padding doesn't matter, but VAV-2-1 is never VAV-2-10.
  assert.equal(
    (pick("SpaceTemp", "VAV-2-1") as PointCandidate).point,
    "slot:/Drivers/BacnetNetwork/VAV_2_01/points/SpaceTemp"
  )
  assert.equal(pick("SpaceTemp", "VAV-2-3"), "ambiguous")
  assert.equal(pick("SpaceTemp"), "ambiguous")
  assert.equal(pick("ZN-T"), "missing")

  const result = await matchPoints(
    [
      queryFor("AHU-1/DA-T", null),
      queryFor("SpaceTemp", "VAV-2-02"),
      queryFor("SpaceTemp", "VAV-2-02"),
      queryFor("SpaceTemp", null),
      queryFor("ZN-T", null),
    ],
    search
  )
  assert.deepEqual(
    result.matched.map((c) => c.point.split("/").slice(-3).join("/")),
    ["AHU_1/points/DA-T", "VAV_2_02/points/SpaceTemp"]
  )
  assert.equal(result.ambiguous, 1)
  assert.equal(result.missing, 1)
})

test("each name is searched once, and only up to the limit", async () => {
  const asked: string[] = []
  const result = await matchPoints(
    [1, 2, 3].map((i) => queryFor("SpaceTemp", `VAV-2-0${i}`)),
    async (name) => {
      asked.push(name)
      return search(name)
    },
    { limit: 2 }
  )
  assert.deepEqual(asked, ["SpaceTemp"])
  assert.equal(result.matched.length, 2)
  assert.equal(result.skipped, 1)
})
