import assert from "node:assert/strict"
import { test } from "node:test"

import {
  actionLabel,
  buildWrite,
  coerceWriteValue,
  elementLabel,
  formatValue,
  contrastText,
  designHeight,
  elementSize,
  newElement,
  normalizeElement,
  percentOf,
  releaseWrite,
  snap,
  writesPoint,
} from "./model.ts"

test("stored elements are cleaned up", () => {
  const el = normalizeElement({
    kind: "slider",
    min: 80,
    max: 20,
    step: -0.5,
    overrideSec: 1e9,
    options: ["Occupied", "", 3, " Unoccupied "],
    variant: "neon",
  })
  assert.equal(el.kind, "slider")
  assert.deepEqual([el.min, el.max, el.step], [20, 80, 0.5])
  assert.equal(el.overrideSec, 7 * 86_400)
  assert.deepEqual(el.options, ["Occupied", "Unoccupied"])
  assert.equal(el.variant, "default")
  assert.equal(normalizeElement(null).kind, "value")
  assert.equal(normalizeElement({ kind: "nope" }).kind, "value")
})

test("values are typed to suit the point", () => {
  assert.equal(coerceWriteValue("On", "boolean"), true)
  assert.equal(coerceWriteValue("stop", "boolean"), false)
  assert.equal(coerceWriteValue("maybe", "boolean"), null)
  assert.equal(coerceWriteValue("72.5", "number"), 72.5)
  assert.equal(coerceWriteValue("warm", "number"), null)
  assert.equal(coerceWriteValue("occupied", "text"), "occupied")
  assert.equal(coerceWriteValue("56", null), 56)
  assert.equal(coerceWriteValue("  ", null), null)
})

test("numbers snap to the range and step", () => {
  const el = { min: 55, max: 80, step: 0.5 }
  assert.equal(snap(el, 72.3), 72.5)
  assert.equal(snap(el, 90), 80)
  assert.equal(snap(el, 10), 55)
  assert.equal(snap({ min: 0, max: 1, step: 0.1 }, 0.35), 0.4)
  assert.equal(percentOf({ min: 0, max: 200 }, 50), 25)
  assert.equal(percentOf({ min: 0, max: 100 }, 140), 100)
})

test("writes follow the element's mode", () => {
  const set = newElement("setpoint", { point: "slot:/a", source: "s" })
  assert.deepEqual(buildWrite(set, 56), {
    point: "slot:/a",
    action: "set",
    value: 56,
  })
  const timed = newElement("switch", {
    point: "slot:/b",
    source: "s",
    writeMode: "override",
    overrideSec: 3600,
  })
  assert.deepEqual(buildWrite(timed, true), {
    point: "slot:/b",
    action: "override",
    value: true,
    durationSec: 3600,
  })
  const held = newElement("switch", {
    point: "slot:/b",
    source: "s",
    writeMode: "override",
  })
  assert.deepEqual(buildWrite(held, false), {
    point: "slot:/b",
    action: "override",
    value: false,
  })
  assert.deepEqual(releaseWrite(held), { point: "slot:/b", action: "auto" })
  assert.equal(actionLabel(buildWrite(timed, true)), "Override for 1 h")
  assert.equal(actionLabel(buildWrite(held, true)), "Override until released")
  assert.equal(actionLabel(releaseWrite(held)), "Release to auto")
})

test("which elements write, and what they're called", () => {
  assert.equal(
    writesPoint(newElement("value", { point: "p", source: "s" })),
    false
  )
  assert.equal(writesPoint(newElement("switch")), false)
  assert.equal(
    writesPoint(newElement("switch", { point: "p", source: "s" })),
    true
  )
  assert.equal(
    writesPoint(newElement("button", { point: "p", source: "s" })),
    false
  )
  assert.equal(
    writesPoint(
      newElement("button", { point: "p", source: "s", onClick: "write" })
    ),
    true
  )
  assert.equal(
    elementLabel(newElement("value", { point: "slot:/AHU_1/points/DA-T" })),
    "DA-T"
  )
  assert.equal(
    elementLabel(newElement("value", { label: " Supply temp " })),
    "Supply temp"
  )
  assert.equal(
    formatValue({ onText: "Running", offText: "Stopped" }, true),
    "Running"
  )
  assert.equal(
    formatValue({ onText: "On", offText: "Off" }, 72.5, "°F"),
    "72.5 °F"
  )
})

test("color, icon and links are read safely", () => {
  const el = normalizeElement({
    kind: "menu",
    color: "#0EA5E9",
    icon: "Home01Icon",
    iconPosition: "only",
    links: [
      { label: "Plant", target: "page:abc", icon: "Factory01Icon" },
      { label: "Bad icon", target: "", icon: "<script>" },
      "not a link",
    ],
  })
  assert.equal(el.color, "#0ea5e9")
  assert.equal(el.icon, "Home01Icon")
  assert.equal(el.iconPosition, "only")
  assert.deepEqual(el.links, [
    { label: "Plant", target: "page:abc", icon: "Factory01Icon" },
    { label: "Bad icon", target: "", icon: "" },
  ])
  const bad = normalizeElement({ color: "red", icon: "home", layout: "grid" })
  assert.equal(bad.color, "")
  assert.equal(bad.icon, "")
  assert.equal(bad.layout, "row")
})

test("design heights: one line 40, stacked controls taller, stacked nav grows", () => {
  assert.equal(designHeight(newElement("button")), 40)
  assert.equal(designHeight(newElement("value")), 40)
  assert.equal(designHeight(newElement("slider")), 60)
  assert.equal(designHeight(newElement("setpoint")), 72)
  const nav = newElement("nav", { layout: "column" })
  assert.equal(designHeight(nav), 8 + nav.links.length * 36)
  assert.equal(elementSize("setpoint").h, 72)
})

test("text on an accent color picks black or white for contrast", () => {
  assert.equal(contrastText("#7ccf00"), "#0c0a09")
  assert.equal(contrastText("#6366f1"), "#ffffff")
})
