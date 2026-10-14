import assert from "node:assert/strict"
import { test } from "node:test"

import {
  age,
  csvField,
  equipmentOf,
  groupByEquipmentKind,
  looksLikeEquipment,
  pivotByEquipment,
  toCsv,
  unescapeSlot,
} from "./model.ts"

const row = (point: string, label = point.split("/").pop()!) => ({
  source: "sim",
  point,
  label,
})

test("equipment comes from the point's path", () => {
  assert.equal(
    equipmentOf("slot:/Drivers/BacnetNetwork/AHU_1/points/DA-T"),
    "AHU_1"
  )
  assert.equal(
    equipmentOf("slot:/Drivers/Net/VAV$2d2$2d01/points/Sub/Temp"),
    "VAV-2-01"
  )
  assert.equal(equipmentOf("slot:/Drivers/Meter_1/kW"), "Meter_1")
  assert.equal(equipmentOf("slot:/kW"), "")
  assert.equal(unescapeSlot("RTU$2d1"), "RTU-1")
})

test("pivot: one row per unit, one column per point name", () => {
  const rows = [
    row("slot:/N/VAV_1/points/SpaceTemp"),
    row("slot:/N/VAV_1/points/DamperPos"),
    row("slot:/N/VAV_2/points/SpaceTemp"),
  ]
  const pivot = pivotByEquipment(rows)
  assert.deepEqual(pivot.equipment, ["VAV_1", "VAV_2"])
  assert.deepEqual(pivot.names, ["SpaceTemp", "DamperPos"])
  assert.equal(pivot.cell("VAV_2", "DamperPos"), undefined)
  assert.equal(pivot.cell("VAV_2", "SpaceTemp")?.point, rows[2].point)
  assert.equal(looksLikeEquipment(rows), true)
  assert.equal(looksLikeEquipment([rows[0], rows[1]]), false)
})

test("CSV quotes what it must and defuses formulas", () => {
  assert.equal(csvField('Say "hi", ok'), '"Say ""hi"", ok"')
  assert.equal(csvField("=HYPERLINK(1)"), "'=HYPERLINK(1)")
  assert.equal(csvField("-5 °F"), "'-5 °F")
  assert.equal(csvField(-5), "-5")
  assert.equal(csvField(null), "")
  assert.equal(
    toCsv([
      ["a", 1],
      ["b", null],
    ]),
    "a,1\r\nb,\r\n"
  )
})

test("ages read in the largest whole unit", () => {
  assert.equal(age(null, 0), "")
  assert.equal(age(0, 12_000), "12 s")
  assert.equal(age(0, 4 * 60_000), "4 min")
  assert.equal(age(0, 3 * 3_600_000), "3 h")
  assert.equal(age(0, 3 * 86_400_000), "3 d")
})

test("a network splits into groups of similar equipment", () => {
  const ahu = ["DA-T", "DA-T-SP", "SF-S", "SF-C", "OA-D"].map((n) =>
    row(`slot:/N/AHU_1/points/${n}`)
  )
  const vav = (unit: string, names: string[]) =>
    names.map((n) => row(`slot:/N/${unit}/points/${n}`))
  const groups = groupByEquipmentKind([
    ...ahu,
    ...vav("VAV_1", ["SpaceTemp", "SpaceTempSP", "DamperPos"]),
    ...vav("VAV_2", ["SpaceTemp", "SpaceTempSP", "DamperPos", "Flow"]),
    ...vav("VAV_3", ["SpaceTemp", "DamperPos"]),
  ])
  assert.deepEqual(
    groups.map((g) => [...new Set(g.map((r) => equipmentOf(r.point)))]),
    [["AHU_1"], ["VAV_1", "VAV_2", "VAV_3"]]
  )
})
