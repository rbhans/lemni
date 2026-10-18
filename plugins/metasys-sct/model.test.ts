import assert from "node:assert/strict"
import { test } from "node:test"

import {
  fqrOf,
  inNetworkTree,
  displayStored,
  isDatabaseName,
  kindOfClass,
  nodeName,
  parseStored,
  pointShort,
  shortName,
  splitFqr,
  unitsOf,
} from "./model.ts"

test("point classes map to short names and kinds", () => {
  assert.equal(pointShort(0), "AI")
  assert.equal(pointShort(4), "BO")
  assert.equal(pointShort(19), "MV")
  assert.equal(pointShort(805), null)
  assert.equal(kindOfClass(2), "number")
  assert.equal(kindOfClass(5), "boolean")
  assert.equal(kindOfClass(13), "text")
  assert.equal(kindOfClass(null), null)
})

test("FQRs join the engine and the item, and split back", () => {
  const fqr = fqrOf("FC-2.012074FEC.OA-T", "CJAXMETASYS:NAE55-01")
  assert.equal(fqr, "CJAXMETASYS:NAE55-01/FC-2.012074FEC.OA-T")
  assert.deepEqual(splitFqr(fqr), {
    device: "CJAXMETASYS:NAE55-01",
    item: "FC-2.012074FEC.OA-T",
  })
  assert.equal(
    fqrOf("CJAXMETASYS:NAE55-01", "CJAXMETASYS:NAE55-01"),
    "CJAXMETASYS:NAE55-01"
  )
  assert.deepEqual(splitFqr("CJAXMETASYS:CJAXMETASYS"), {
    device: null,
    item: "CJAXMETASYS:CJAXMETASYS",
  })
})

test("names come from the reference's last part", () => {
  assert.equal(shortName("FC-2.012074FEC.OA-T"), "OA-T")
  assert.equal(shortName("CJAXMETASYS:NAE55-01"), "NAE55-01")
  assert.equal(
    nodeName({
      type: "point",
      PartialReference: "FC-2.012074FEC.SF-C",
      UserName: "Site.AHU-8.SF-C",
    }),
    "SF-C"
  )
  assert.equal(
    nodeName({
      type: "site",
      PartialReference: "$site",
      UserName: "Jacksonville",
    }),
    "Jacksonville"
  )
})

test("the network tree leaves out other views' folders", () => {
  assert.equal(
    inNetworkTree({ type: "folder", PartialReference: "equipment" }),
    false
  )
  assert.equal(
    inNetworkTree({ type: "folder", PartialReference: "$FacilityGraphics" }),
    false
  )
  assert.equal(
    inNetworkTree({ type: "folder", PartialReference: "Graphics" }),
    false
  )
  assert.equal(
    inNetworkTree({ type: "folder", PartialReference: "Schedule" }),
    true
  )
  assert.equal(inNetworkTree({ type: "site", PartialReference: "$site" }), true)
  assert.equal(
    inNetworkTree({ type: "controller", PartialReference: "FC-2.012074FEC" }),
    true
  )
  assert.equal(
    inNetworkTree({ type: "extension", PartialReference: "Event Rate Alarm" }),
    false
  )
  assert.equal(
    inNetworkTree({
      type: "object",
      PartialReference: "Site 1",
      bacnetClassid: 806,
    }),
    false
  )
  assert.equal(
    inNetworkTree({
      type: "site",
      PartialReference: "$site",
      bacnetClassid: 2004,
    }),
    false
  )
  assert.equal(
    inNetworkTree({
      type: "object",
      PartialReference: "Programming.AV1",
      bacnetClassid: 2,
    }),
    true
  )
})

test("stored values read as their point kind", () => {
  assert.equal(parseStored("72.5", "number"), 72.5)
  assert.equal(parseStored("abc", "number"), null)
  assert.equal(parseStored("1", "boolean"), true)
  assert.equal(parseStored("false", "boolean"), false)
  assert.equal(parseStored("3.1", "boolean"), true)
  assert.equal(parseStored("xsi:nil", "number"), null)
  assert.equal(parseStored(null, "text"), null)
  assert.equal(parseStored(" Occupied ", "text"), "Occupied")
})

test("database names are checked before use", () => {
  assert.equal(isDatabaseName("QAGTemplates"), true)
  assert.equal(isDatabaseName("StPaulHospital3Mar2026"), true)
  assert.equal(isDatabaseName("x]; DROP TABLE Item;--"), false)
  assert.equal(isDatabaseName(""), false)
})

test("units come from the stored enum member", () => {
  assert.equal(unitsOf("507.98"), "%")
  assert.equal(unitsOf("507.64"), "°F")
  assert.equal(unitsOf("507.9999"), null)
  assert.equal(unitsOf(null), null)
  assert.equal(displayStored(50, "%"), "50 %")
  assert.equal(displayStored(72.456, "°F"), "72.46 °F")
  assert.equal(displayStored(true, null), "On")
  assert.equal(displayStored(null, "%"), "—")
})
