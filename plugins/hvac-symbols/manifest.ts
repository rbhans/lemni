// What an agent needs to know about each piece beyond its drawing: where ducts and
// pipes connect (ports, in the piece's own viewBox units, before flips), what the piece
// is for, and which kinds of points drive it (roles, with the behavior to bind each).
// Pure module (no React, no DOM, relative imports) so `node --test` can check it.
//
// Ports sit where the drawing meets its line. Equipment carries the duct or pipe
// through its vertical center (the library's rule); the exceptions are written out
// (roof fans from below, end-suction discharge on top, chiller barrels, exchangers).

export type PortDir = "left" | "right" | "up" | "down"
export type LineKind = "duct" | "pipe" | "probe"

export interface SymbolPort {
  id: string
  /** Position in the piece's viewBox (x, y). */
  at: readonly [number, number]
  /** Which way a line leaves the port. */
  dir: PortDir
  line: LineKind
  /** Stretchable runs: the port sits at the far end, whatever the run's length. */
  end?: boolean
}

/** A behavior to add for a point in this role (see the Behaviors plugin's add_behavior). */
export interface RoleBehavior {
  effect: string
  params?: Readonly<Record<string, string | number | boolean>>
}

export interface PointRole {
  role: string
  kind: "boolean" | "number" | "any"
  unit?: string
  /** Name fragments that suggest a point plays this role ("status", "-S", "VFD"). */
  words: readonly string[]
  behaviors: readonly RoleBehavior[]
}

export interface ManifestEntry {
  /** What the piece is and where it goes, for choosing pieces from a drawing. */
  use: string
  ports: readonly SymbolPort[]
  roles: readonly PointRole[]
}

// ---- Roles ------------------------------------------------------------------------------

const run: PointRole = {
  role: "run",
  kind: "boolean",
  words: ["status", "sts", "run", "proof", "prf", "-s", "_s", "on"],
  behaviors: [{ effect: "state", params: { state: "on" } }],
}
const speed: PointRole = {
  role: "speed",
  kind: "number",
  unit: "%",
  words: ["speed", "spd", "vfd", "hz", "output", "-o"],
  behaviors: [{ effect: "label" }],
}
const fault: PointRole = {
  role: "fault",
  kind: "boolean",
  words: ["fault", "flt", "fail", "trip", "alarm", "alm"],
  behaviors: [{ effect: "blink" }],
}
const command: PointRole = {
  role: "command",
  kind: "any",
  words: ["cmd", "command", "start", "ss", "-c", "_c"],
  behaviors: [{ effect: "label" }],
}
const reading: PointRole = {
  role: "reading",
  kind: "any",
  words: ["temp", "-t", "rh", "humidity", "pressure", "-p", "co2", "flow"],
  behaviors: [{ effect: "label" }],
}

const air = (x0: number, x1: number, y: number): SymbolPort[] => [
  { id: "in", at: [x0, y], dir: "left", line: "duct" },
  { id: "out", at: [x1, y], dir: "right", line: "duct" },
]
const water = (x0: number, x1: number, y: number): SymbolPort[] => [
  { id: "in", at: [x0, y], dir: "left", line: "pipe" },
  { id: "out", at: [x1, y], dir: "right", line: "pipe" },
]
const cross = (size: number, line: LineKind): SymbolPort[] => [
  { id: "left", at: [0, size / 2], dir: "left", line },
  { id: "right", at: [size, size / 2], dir: "right", line },
  { id: "top", at: [size / 2, 0], dir: "up", line },
  { id: "bottom", at: [size / 2, size], dir: "down", line },
]

export const MANIFEST: Readonly<Record<string, ManifestEntry>> = {
  // ---- Air side -------------------------------------------------------------------------
  "air/duct": {
    use: "A straight duct run; stretches along its length. Draw supply, return, outside and exhaust air paths with it.",
    ports: [
      { id: "in", at: [0, 10], dir: "left", line: "duct" },
      { id: "out", at: [0, 10], dir: "right", line: "duct", end: true },
    ],
    roles: [
      {
        role: "flow",
        kind: "boolean",
        words: ["status", "flow", "run", "fan"],
        behaviors: [{ effect: "state", params: { state: "flow" } }],
      },
    ],
  },
  "air/duct-junction": {
    use: "A tee, elbow or cross where duct runs meet.",
    ports: cross(30, "duct"),
    roles: [],
  },
  "air/damper": {
    use: "Rectangular control damper in a duct (outside, return, exhaust, mixed air).",
    ports: air(9, 41, 70),
    roles: [
      {
        role: "position",
        kind: "number",
        unit: "%",
        words: ["position", "pos", "damper", "dpr", "dmp", "-d", "output"],
        behaviors: [
          { effect: "state", params: { state: "position" } },
          { effect: "label" },
        ],
      },
      command,
    ],
  },
  "air/damper-round": {
    use: "Round damper or VAV box damper in a round duct.",
    ports: air(9, 61, 45),
    roles: [
      {
        role: "position",
        kind: "number",
        unit: "%",
        words: ["position", "pos", "damper", "dpr", "dmp", "-d"],
        behaviors: [
          { effect: "state", params: { state: "position" } },
          { effect: "label" },
        ],
      },
    ],
  },
  "air/filter": {
    use: "Air filter bank (pre-filter or final filter).",
    ports: air(9, 41, 60),
    roles: [
      {
        role: "dirty",
        kind: "boolean",
        words: ["dirty", "filter", "dp", "alarm", "-dp"],
        behaviors: [{ effect: "state", params: { state: "loaded" } }],
      },
      {
        role: "pressure-drop",
        kind: "number",
        unit: "in",
        words: ["dp", "differential", "pressure"],
        behaviors: [{ effect: "label" }],
      },
    ],
  },
  "air/filter-uv": {
    use: "UV lamp bank in the air stream (UVGI).",
    ports: air(9, 41, 60),
    roles: [run],
  },
  "air/coil-cool": {
    use: "Cooling coil (chilled water or DX).",
    ports: [
      ...air(9, 51, 60),
      { id: "water", at: [30, 114], dir: "down", line: "pipe" },
    ],
    roles: [
      {
        role: "valve",
        kind: "number",
        unit: "%",
        words: ["valve", "vlv", "chw", "clg", "cool", "-v", "output"],
        behaviors: [
          { effect: "state", params: { state: "on" } },
          { effect: "label" },
        ],
      },
    ],
  },
  "air/coil-heat": {
    use: "Heating, preheat or reheat coil (hot water, steam or electric).",
    ports: [
      ...air(9, 51, 60),
      { id: "water", at: [30, 114], dir: "down", line: "pipe" },
    ],
    roles: [
      {
        role: "valve",
        kind: "number",
        unit: "%",
        words: ["valve", "vlv", "hw", "htg", "heat", "-v", "output"],
        behaviors: [
          { effect: "state", params: { state: "on" } },
          { effect: "label" },
        ],
      },
    ],
  },
  "air/humidifier": {
    use: "Humidifier dispersion in the air stream.",
    ports: air(9, 51, 60),
    roles: [
      run,
      {
        role: "output",
        kind: "number",
        unit: "%",
        words: ["humidifier", "hum", "output", "valve"],
        behaviors: [{ effect: "label" }],
      },
    ],
  },
  "air/fan-centrifugal": {
    use: "Supply, return or exhaust fan (centrifugal, housed). Air enters at the wheel, leaves through the discharge on the right.",
    ports: air(21, 113, 60),
    roles: [run, speed, fault, command],
  },
  "air/fan-plug": {
    use: "Plug (plenum) fan in an air handler.",
    ports: air(9, 111, 50),
    roles: [run, speed, fault, command],
  },
  "air/fan-roof-downblast": {
    use: "Roof exhaust fan, downblast. The duct comes up from below.",
    ports: [{ id: "in", at: [60, 111], dir: "down", line: "duct" }],
    roles: [run, speed, fault, command],
  },
  "air/fan-roof-upblast": {
    use: "Roof exhaust fan, upblast. The duct comes up from below.",
    ports: [{ id: "in", at: [60, 111], dir: "down", line: "duct" }],
    roles: [run, speed, fault, command],
  },
  "air/heat-wheel": {
    use: "Energy recovery wheel: one air stream through the top half, the other through the bottom.",
    ports: [
      { id: "a-in", at: [9, 35], dir: "left", line: "duct" },
      { id: "a-out", at: [111, 35], dir: "right", line: "duct" },
      { id: "b-in", at: [9, 85], dir: "left", line: "duct" },
      { id: "b-out", at: [111, 85], dir: "right", line: "duct" },
    ],
    roles: [run, speed],
  },
  "air/hx-air-to-air": {
    use: "Fixed-plate air-to-air heat exchanger: one stream left to right, the other top to bottom.",
    ports: [
      { id: "a-in", at: [9, 60], dir: "left", line: "duct" },
      { id: "a-out", at: [111, 60], dir: "right", line: "duct" },
      { id: "b-in", at: [60, 9], dir: "up", line: "duct" },
      { id: "b-out", at: [60, 111], dir: "down", line: "duct" },
    ],
    roles: [reading],
  },
  "air/phoenix-valve": {
    use: "Venturi air valve (lab supply or exhaust, constant volume or VAV).",
    ports: air(9, 91, 40),
    roles: [
      run,
      {
        role: "airflow",
        kind: "number",
        unit: "cfm",
        words: ["flow", "cfm", "airflow"],
        behaviors: [{ effect: "label" }],
      },
    ],
  },
  "air/fume-hood": {
    use: "Laboratory fume hood; exhaust leaves through the collar on top.",
    ports: [{ id: "exhaust", at: [50, 9], dir: "up", line: "duct" }],
    roles: [
      {
        role: "sash",
        kind: "number",
        unit: "%",
        words: ["sash", "position", "opening"],
        behaviors: [{ effect: "state", params: { state: "sash" } }],
      },
      reading,
    ],
  },

  // ---- Water side -----------------------------------------------------------------------
  "water/pipe": {
    use: "A straight pipe run; stretches along its length. Chilled water, hot water, condenser water, steam.",
    ports: [
      { id: "in", at: [0, 5], dir: "left", line: "pipe" },
      { id: "out", at: [0, 5], dir: "right", line: "pipe", end: true },
    ],
    roles: [
      {
        role: "flow",
        kind: "boolean",
        words: ["status", "flow", "pump", "run"],
        behaviors: [{ effect: "state", params: { state: "flow" } }],
      },
    ],
  },
  "water/pipe-junction": {
    use: "A tee, elbow or cross where pipe runs meet.",
    ports: cross(20, "pipe"),
    roles: [],
  },
  "water/valve-2way": {
    use: "Two-way control valve.",
    ports: water(9, 71, 50),
    roles: [
      {
        role: "position",
        kind: "number",
        unit: "%",
        words: ["valve", "vlv", "position", "-v", "output"],
        behaviors: [{ effect: "label" }],
      },
    ],
  },
  "water/valve-3way": {
    use: "Three-way mixing or diverting valve; the bypass port points down.",
    ports: [
      ...water(9, 71, 50),
      { id: "bypass", at: [40, 78], dir: "down", line: "pipe" },
    ],
    roles: [
      {
        role: "position",
        kind: "number",
        unit: "%",
        words: ["valve", "vlv", "position", "-v", "output"],
        behaviors: [{ effect: "label" }],
      },
    ],
  },
  "water/pump-inline": {
    use: "Inline circulator pump.",
    ports: water(9, 91, 70),
    roles: [run, speed, fault, command],
  },
  "water/pump-end-suction": {
    use: "End-suction pump: suction on the left end, discharge out the top.",
    ports: [
      { id: "in", at: [9, 50], dir: "left", line: "pipe" },
      { id: "out", at: [49, 11], dir: "up", line: "pipe" },
    ],
    roles: [run, speed, fault, command],
  },
  "water/tank": {
    use: "Expansion, buffer or storage tank; connects at the bottom.",
    ports: [{ id: "bottom", at: [40, 104], dir: "down", line: "pipe" }],
    roles: [
      {
        role: "level",
        kind: "number",
        unit: "%",
        words: ["level", "lvl", "volume"],
        behaviors: [{ effect: "state", params: { state: "level" } }],
      },
      reading,
    ],
  },
  "water/hx-plate": {
    use: "Plate heat exchanger: one loop on the left frame, the other on the right.",
    ports: [
      { id: "a-in", at: [9, 22], dir: "left", line: "pipe" },
      { id: "a-out", at: [9, 78], dir: "left", line: "pipe" },
      { id: "b-in", at: [111, 22], dir: "right", line: "pipe" },
      { id: "b-out", at: [111, 78], dir: "right", line: "pipe" },
    ],
    roles: [reading],
  },
  "water/hx-shell-tube": {
    use: "Shell-and-tube heat exchanger: tube side through the heads, shell side top and bottom.",
    ports: [
      { id: "tube-in", at: [9, 35], dir: "left", line: "pipe" },
      { id: "tube-out", at: [131, 35], dir: "right", line: "pipe" },
      { id: "shell-in", at: [40, 9], dir: "up", line: "pipe" },
      { id: "shell-out", at: [100, 61], dir: "down", line: "pipe" },
    ],
    roles: [reading],
  },
  "water/chiller-centrifugal": {
    use: "Water-cooled centrifugal chiller: condenser barrel on top, evaporator below, water boxes at both ends.",
    ports: [
      { id: "cond-in", at: [11, 59], dir: "left", line: "pipe" },
      { id: "cond-out", at: [169, 59], dir: "right", line: "pipe" },
      { id: "evap-in", at: [11, 86], dir: "left", line: "pipe" },
      { id: "evap-out", at: [169, 86], dir: "right", line: "pipe" },
    ],
    roles: [run, fault, reading],
  },
  "water/chiller-air-cooled": {
    use: "Air-cooled chiller; chilled water connects at the left end.",
    ports: [
      { id: "in", at: [9, 70], dir: "left", line: "pipe" },
      { id: "out", at: [9, 40], dir: "left", line: "pipe" },
    ],
    roles: [run, fault, reading],
  },
  "water/boiler-drum": {
    use: "Fire-tube (drum) boiler: supply leaves the nozzle on top, return enters at the right end.",
    ports: [
      { id: "out", at: [125, 9], dir: "up", line: "pipe" },
      { id: "in", at: [151, 60], dir: "right", line: "pipe" },
    ],
    roles: [run, fault, reading],
  },
  "water/boiler-vertical": {
    use: "Vertical (condensing) boiler: supply on top, return on the right.",
    ports: [
      { id: "out", at: [40, 9], dir: "up", line: "pipe" },
      { id: "in", at: [71, 95], dir: "right", line: "pipe" },
    ],
    roles: [run, fault, reading],
  },
  "water/cooling-tower": {
    use: "Cooling tower: warm water in near the top on the right, cooled water out of the basin on the left.",
    ports: [
      { id: "in", at: [111, 40], dir: "right", line: "pipe" },
      { id: "out", at: [9, 112], dir: "left", line: "pipe" },
    ],
    roles: [run, speed, fault, reading],
  },

  // ---- Sensors --------------------------------------------------------------------------
  "shared/sensor": {
    use: "A sensor or transmitter with a short tag (T, P, RH, CO2, DP, F). Its probe tip goes on the duct or pipe it measures.",
    ports: [{ id: "probe", at: [30, 49], dir: "down", line: "probe" }],
    roles: [reading],
  },
}

export function manifestFor(id: string): ManifestEntry | undefined {
  return MANIFEST[id]
}
