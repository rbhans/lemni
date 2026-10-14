import assert from "node:assert/strict"
import { test } from "node:test"

import {
  bucketCountFor,
  decimalsFor,
  extentOf,
  layoutSeries,
  nearestTime,
  niceTicks,
  nextSlot,
  refreshFor,
  runsOf,
  samplesFor,
  timeTicks,
  valueAt,
  type ChartSeries,
} from "./model.ts"

const series = (
  point: string,
  kind: ChartSeries["kind"],
  units: string,
  slot: number
): ChartSeries => ({ source: "sim", point, label: point, kind, units, slot })

test("colors follow the series: free slots are reused, survivors keep theirs", () => {
  assert.equal(nextSlot([]), 0)
  assert.equal(nextSlot([{ slot: 0 }, { slot: 2 }]), 1)
  assert.equal(
    nextSlot(Array.from({ length: 8 }, (_, slot) => ({ slot }))),
    null
  )
})

test("numbers stack into one pane per unit; on/off points become lanes", () => {
  const { panes, lanes } = layoutSeries([
    series("DA-T", "number", "°F", 0),
    series("SF-S", "boolean", "", 1),
    series("OA-D", "number", "%", 2),
    series("DA-T-SP", "number", "°F ", 3),
  ])
  assert.deepEqual(
    panes.map((p) => [p.units, p.series.map((s) => s.point)]),
    [
      ["°F", ["DA-T", "DA-T-SP"]],
      ["%", ["OA-D"]],
    ]
  )
  assert.deepEqual(
    lanes.map((s) => s.point),
    ["SF-S"]
  )
})

test("history detail and refresh come in fixed steps", () => {
  assert.equal(bucketCountFor(280), 60)
  assert.equal(bucketCountFor(640), 240)
  assert.equal(refreshFor(3_600_000, 120), 60_000)
  assert.equal(refreshFor(31 * 86_400_000, 240), 15 * 60_000)
})

test("samples: buckets at their centers, live values after the window, gaps kept", () => {
  const samples = samplesFor(
    [
      { t: 0, avg: 1, min: 0, max: 2 },
      { t: 100, avg: null, min: null, max: null },
      { t: 200, avg: 3, min: 3, max: 3 },
    ],
    300,
    [
      { t: 250, v: 9 }, // inside the window: history already covers it
      { t: 320, v: 4 },
    ]
  )
  assert.deepEqual(
    samples.map((s) => [s.t, s.v]),
    [
      [50, 1],
      [150, null],
      [250, 3],
      [320, 4],
    ]
  )
  assert.deepEqual(samples[0].band, [0, 2])
  assert.equal(valueAt(samples, 40), null)
  assert.equal(valueAt(samples, 60), 1)
  assert.equal(valueAt(samples, 160), null)
  assert.equal(valueAt(samples, 999), 4)
  assert.equal(nearestTime([samples, [{ t: 140, v: 1 }]], 143), 140)
})

test("on/off runs merge neighbors and run to the end while on", () => {
  const runs = runsOf(
    [
      { t: 0, v: 0 },
      { t: 10, v: 1 },
      { t: 20, v: 0.8 },
      { t: 30, v: 0.2 },
      { t: 40, v: 1 },
    ],
    50
  )
  assert.deepEqual(runs, [
    { from: 10, to: 30 },
    { from: 40, to: 50 },
  ])
})

test("time ticks land on local boundaries and fit the width", () => {
  const start = new Date(2026, 9, 9, 13, 17).getTime()
  const end = start + 24 * 3_600_000
  const { ticks, step } = timeTicks(start, end, 6)
  assert.equal(step, 6 * 3_600_000)
  assert.ok(ticks.length <= 6 && ticks.length >= 3)
  for (const t of ticks) {
    const d = new Date(t)
    assert.equal(d.getMinutes(), 0)
    assert.equal(d.getHours() % 6, 0)
  }
  const week = timeTicks(start, start + 31 * 86_400_000, 6)
  assert.equal(new Date(week.ticks[0]).getDay(), 1)
})

test("value ticks are round numbers that cover the data", () => {
  assert.deepEqual(niceTicks(57.2, 59.4, 4).ticks, [57, 58, 59, 60])
  assert.deepEqual(niceTicks(57.9, 58.7, 4).ticks, [57.5, 58, 58.5, 59])
  assert.deepEqual(niceTicks(0, 100, 3).ticks, [0, 50, 100])
  assert.deepEqual(niceTicks(54.9, 62.3, 3).ticks, [50, 55, 60, 65])
  const flat = niceTicks(55, 55, 3).ticks
  assert.ok(flat[0] < 55 && flat[flat.length - 1] > 55)
  assert.equal(decimalsFor(0.25), 2)
  assert.equal(decimalsFor(5), 0)
  assert.deepEqual(
    extentOf(
      [
        [
          { t: 5, v: 3, band: [1, 4] },
          { t: 50, v: 99 },
        ],
      ],
      0,
      10
    ),
    [1, 4]
  )
})

test("stat tile: change since the window start, toned by which way is good", async () => {
  const { changeOver, changeTone, onShare } = await import("./value-model.ts")
  const samples = [
    { t: 0, v: null },
    { t: 1, v: 55 },
    { t: 2, v: 57 },
  ]
  assert.equal(changeOver(samples, 58.5), 3.5)
  assert.equal(changeOver(samples, null), null)
  assert.equal(changeOver([{ t: 0, v: null }], 1), null)
  assert.equal(changeTone(2, "neutral"), "neutral")
  assert.equal(changeTone(2, "good"), "good")
  assert.equal(changeTone(-2, "good"), "bad")
  assert.equal(changeTone(-2, "bad"), "good")
  assert.equal(changeTone(0, "bad"), "neutral")
  assert.equal(
    onShare([
      { t: 0, v: 1 },
      { t: 1, v: 0.5 },
      { t: 2, v: 0 },
      { t: 3, v: null },
    ]),
    0.5
  )
})

test("gauge: default scales, limits and dial geometry", async () => {
  const {
    arcPath,
    defaultGaugeRange,
    dialAngle,
    fractionOf,
    polar,
    severityOf,
  } = await import("./value-model.ts")
  assert.deepEqual(defaultGaugeRange("%", 35), [0, 100])
  assert.deepEqual(defaultGaugeRange("°F", 72.4), [50, 100])
  assert.deepEqual(defaultGaugeRange("in", 1.24), [0, 2])
  assert.deepEqual(defaultGaugeRange("kW", null), [0, 100])
  const limits = { alarmLow: 50, warnLow: 55, warnHigh: 75, alarmHigh: 80 }
  assert.deepEqual(severityOf(72, limits), { level: "normal" })
  assert.deepEqual(severityOf(76, limits), {
    level: "warning",
    side: "high",
    limit: 75,
  })
  assert.deepEqual(severityOf(49, limits), {
    level: "alarm",
    side: "low",
    limit: 50,
  })
  assert.equal(fractionOf(150, 0, 100), 1)
  assert.equal(fractionOf(5, 5, 5), 0)
  assert.equal(dialAngle(0.5), 0)
  const top = polar(50, 50, 40, 0)
  assert.ok(Math.abs(top.x - 50) < 1e-9 && Math.abs(top.y - 10) < 1e-9)
  // The full dial is a large arc; a short one isn't.
  assert.match(arcPath(50, 50, 40, -120, 120), / 0 1 1 /)
  assert.match(arcPath(50, 50, 40, -120, -60), / 0 0 1 /)
  assert.equal(arcPath(50, 50, 40, 10, 10), "")
})

test("values split from their units for display", async () => {
  const { splitDisplay } = await import("./value-model.ts")
  assert.deepEqual(splitDisplay("58.4 °F", "°F"), { main: "58.4", units: "°F" })
  assert.deepEqual(splitDisplay("On", null), { main: "On", units: "" })
  assert.deepEqual(splitDisplay("%", "%"), { main: "%", units: "" })
})
