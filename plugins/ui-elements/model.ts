// UI elements: controls and readouts drawn with the app's own shadcn components, bound
// to live points. Pure (no React, no DOM, relative imports only) so `node --test` can
// run it.

export type UiKind =
  | "button"
  | "switch"
  | "slider"
  | "setpoint"
  | "select"
  | "badge"
  | "progress"
  | "value"
  | "menu"
  | "nav"

export const UI_KINDS: readonly UiKind[] = [
  "button",
  "switch",
  "slider",
  "setpoint",
  "select",
  "badge",
  "progress",
  "value",
  "menu",
  "nav",
]

export const KIND_LABEL: Record<UiKind, string> = {
  button: "Button",
  switch: "Switch",
  slider: "Slider",
  setpoint: "Setpoint",
  select: "Select",
  badge: "Badge",
  progress: "Progress",
  value: "Value",
  menu: "Dropdown",
  nav: "Nav bar",
}

/** Kinds that take people somewhere rather than showing or writing a point. */
export const NAVIGATES: ReadonlySet<UiKind> = new Set(["menu", "nav"])

/** Kinds that change the point they're bound to. */
export const WRITES: ReadonlySet<UiKind> = new Set([
  "switch",
  "slider",
  "setpoint",
  "select",
])

export type ButtonVariant =
  "default" | "secondary" | "outline" | "ghost" | "destructive"

export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
]

/** How a control writes: a plain set, or an override (timed, or until released). */
export type WriteMode = "set" | "override"

/** Where a button's icon sits; "only" drops the text (it stays as the accessible name). */
export type IconPosition = "start" | "end" | "only"

/** One entry of a dropdown or nav bar. */
export type NavLink = {
  label: string
  /** A navigation target (see studio/navigation/targets). */
  target: string
  /** A Hugeicons icon name, e.g. "Home01Icon"; empty for none. */
  icon: string
}

export type NavLayout = "row" | "column"

/** Accent presets offered beside "Theme" (custom hex colors work too). */
export const COLOR_PRESETS: readonly { value: string; label: string }[] = [
  { value: "#7ccf00", label: "Lime" },
  { value: "#0ea5e9", label: "Sky" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#d946ef", label: "Fuchsia" },
  { value: "#78716c", label: "Stone" },
]

export interface UiElement {
  kind: UiKind
  /** Button text or the row's label. Empty: the point's name. */
  label: string
  /** The bound point; empty when none. */
  source: string
  point: string
  pointLabel: string
  writeMode: WriteMode
  /** Override length in seconds; 0 lasts until released. */
  overrideSec: number
  /** Offers "Auto" to release an override on the point. */
  releasable: boolean
  /** Button: what a click does. */
  onClick: "go" | "write"
  /** Button: the value it writes ("true", "72", "occupied"). */
  writeValue: string
  /** Button: where it goes (a navigation target). */
  target: string
  variant: ButtonVariant
  min: number
  max: number
  step: number
  /** Switch, badge and value: words for on and off. */
  onText: string
  offText: string
  /** Select: the choices. Empty: the station's own list for the point. */
  options: string[]
  /** Accent color as #rrggbb; empty follows the theme. */
  color: string
  /** Button and dropdown: a Hugeicons icon name; empty for none. */
  icon: string
  iconPosition: IconPosition
  /** Dropdown and nav bar: where each entry goes. */
  links: NavLink[]
  /** Nav bar: entries side by side, or stacked. */
  layout: NavLayout
}

export const DEFAULT_ELEMENT: UiElement = {
  kind: "value",
  label: "",
  source: "",
  point: "",
  pointLabel: "",
  writeMode: "set",
  overrideSec: 0,
  releasable: false,
  onClick: "go",
  writeValue: "",
  target: "",
  variant: "default",
  min: 0,
  max: 100,
  step: 1,
  onText: "On",
  offText: "Off",
  options: [],
  color: "",
  icon: "",
  iconPosition: "start",
  links: [],
  layout: "row",
}

/** A fresh element of a kind, with that kind's sensible starting values. */
export function newElement(
  kind: UiKind,
  init: Partial<UiElement> = {}
): UiElement {
  const base: UiElement = { ...DEFAULT_ELEMENT, kind }
  if (kind === "button") base.label = "Button"
  if (kind === "menu") base.label = "Go to"
  if (kind === "menu" || kind === "nav")
    base.links = [
      { label: "Overview", target: "", icon: "Home01Icon" },
      { label: "Equipment", target: "", icon: "" },
      { label: "Trends", target: "", icon: "" },
    ]
  if (kind === "setpoint") Object.assign(base, { min: 50, max: 90, step: 0.5 })
  if (kind === "slider" || kind === "progress")
    Object.assign(base, { min: 0, max: 100, step: 1 })
  return normalizeElement({ ...base, ...init })
}

const isKind = (v: unknown): v is UiKind => UI_KINDS.includes(v as UiKind)
const str = (v: unknown, fallback = "") =>
  typeof v === "string" ? v.slice(0, 2000) : fallback
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback
const hex = (v: unknown) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : ""
/** Icon names are the package's export names; anything else is dropped. */
export const iconName = (v: unknown) =>
  typeof v === "string" && /^[A-Z][A-Za-z0-9]{0,60}Icon$/.test(v) ? v : ""

function links(v: unknown): NavLink[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      label: str(l.label).slice(0, 120),
      target: str(l.target),
      icon: iconName(l.icon),
    }))
    .slice(0, 20)
}

/** Reads a stored element, filling anything missing or malformed with defaults. */
export function normalizeElement(value: unknown): UiElement {
  const v = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >
  const kind = isKind(v.kind) ? v.kind : DEFAULT_ELEMENT.kind
  let min = num(v.min, DEFAULT_ELEMENT.min)
  let max = num(v.max, DEFAULT_ELEMENT.max)
  if (max < min) [min, max] = [max, min]
  if (max === min) max = min + 1
  const step = Math.abs(num(v.step, DEFAULT_ELEMENT.step)) || 1
  return {
    kind,
    label: str(v.label),
    source: str(v.source),
    point: str(v.point),
    pointLabel: str(v.pointLabel),
    writeMode: v.writeMode === "override" ? "override" : "set",
    overrideSec: Math.max(
      0,
      Math.min(7 * 86_400, Math.round(num(v.overrideSec, 0)))
    ),
    releasable: v.releasable === true,
    onClick: v.onClick === "write" ? "write" : "go",
    writeValue: str(v.writeValue),
    target: str(v.target),
    variant: BUTTON_VARIANTS.includes(v.variant as ButtonVariant)
      ? (v.variant as ButtonVariant)
      : "default",
    min,
    max,
    step,
    onText: str(v.onText, "On"),
    offText: str(v.offText, "Off"),
    options: Array.isArray(v.options)
      ? v.options
          .filter((o): o is string => typeof o === "string" && o.trim() !== "")
          .map((o) => o.trim().slice(0, 200))
          .slice(0, 50)
      : [],
    color: hex(v.color),
    icon: iconName(v.icon),
    iconPosition:
      v.iconPosition === "end" || v.iconPosition === "only"
        ? v.iconPosition
        : "start",
    links: links(v.links),
    layout: v.layout === "column" ? "column" : "row",
  }
}

/** Black or white, whichever reads better on the accent color. */
export function contrastText(color: string): string {
  const n = parseInt(color.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.36 ? "#0c0a09" : "#ffffff"
}

export const hasPoint = (el: UiElement) => el.point !== "" && el.source !== ""

/** Whether an element changes its point when used (a write-button counts). */
export const writesPoint = (el: UiElement) =>
  hasPoint(el) &&
  (WRITES.has(el.kind) || (el.kind === "button" && el.onClick === "write"))

/** What a row or button says: its label, else the point's name. */
export function elementLabel(el: UiElement): string {
  if (el.label.trim()) return el.label.trim()
  if (el.pointLabel) return el.pointLabel
  if (el.point) return el.point.split("/").pop() ?? el.point
  return KIND_LABEL[el.kind]
}

// ---- Values --------------------------------------------------------------------------

export type ValueKind = "boolean" | "number" | "text"

/** A typed value for a write from what someone entered, to suit the point. */
export function coerceWriteValue(
  text: string,
  kind: ValueKind | null
): boolean | number | string | null {
  const t = text.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  if (kind === "boolean") {
    if (["true", "on", "1", "yes", "start", "open"].includes(lower)) return true
    if (["false", "off", "0", "no", "stop", "close", "closed"].includes(lower))
      return false
    return null
  }
  const n = Number(t)
  if (kind === "number") return Number.isFinite(n) ? n : null
  if (kind === null) {
    if (lower === "true") return true
    if (lower === "false") return false
    if (Number.isFinite(n)) return n
  }
  return t
}

/** Snaps a number into the element's range and onto its step (from min). */
export function snap(el: Pick<UiElement, "min" | "max" | "step">, n: number) {
  // A hair over, so halves that land at x.49999 from float error still round up.
  const steps = Math.round((n - el.min) / el.step + 1e-9)
  const snapped = el.min + steps * el.step
  const decimals = (String(el.step).split(".")[1] ?? "").length
  return Number(
    Math.min(el.max, Math.max(el.min, snapped)).toFixed(Math.min(decimals, 6))
  )
}

/** 0–100 for a progress bar. */
export function percentOf(el: Pick<UiElement, "min" | "max">, n: number) {
  return Math.min(100, Math.max(0, ((n - el.min) / (el.max - el.min)) * 100))
}

// ---- Writes ----------------------------------------------------------------------------

export interface WriteRequest {
  point: string
  action: "set" | "override" | "auto"
  value?: boolean | number | string
  durationSec?: number
}

/** The write for a new value, following the element's write mode. */
export function buildWrite(
  el: UiElement,
  value: boolean | number | string
): WriteRequest {
  if (el.writeMode === "override")
    return {
      point: el.point,
      action: "override",
      value,
      ...(el.overrideSec > 0 ? { durationSec: el.overrideSec } : {}),
    }
  return { point: el.point, action: "set", value }
}

/** Releases an override on the element's point. */
export const releaseWrite = (el: UiElement): WriteRequest => ({
  point: el.point,
  action: "auto",
})

export const OVERRIDE_LENGTHS: readonly { sec: number; label: string }[] = [
  { sec: 0, label: "Until released" },
  { sec: 900, label: "15 min" },
  { sec: 1800, label: "30 min" },
  { sec: 3600, label: "1 h" },
  { sec: 7200, label: "2 h" },
  { sec: 14_400, label: "4 h" },
  { sec: 28_800, label: "8 h" },
  { sec: 86_400, label: "24 h" },
]

export function durationLabel(sec: number): string {
  const known = OVERRIDE_LENGTHS.find((o) => o.sec === sec)
  if (known) return known.label
  if (sec % 3600 === 0) return `${sec / 3600} h`
  if (sec % 60 === 0) return `${sec / 60} min`
  return `${sec} s`
}

/** How a write reads in a confirmation: "Set", "Override for 1 h", "Release to auto". */
export function actionLabel(w: WriteRequest): string {
  if (w.action === "auto") return "Release to auto"
  if (w.action === "set") return "Set"
  return w.durationSec
    ? `Override for ${durationLabel(w.durationSec)}`
    : "Override until released"
}

/** A value as people read it, using the element's on/off words for booleans. */
export function formatValue(
  el: Pick<UiElement, "onText" | "offText">,
  value: boolean | number | string,
  units = ""
): string {
  if (typeof value === "boolean") return value ? el.onText : el.offText
  if (typeof value === "number")
    return `${Number.isInteger(value) ? value : Number(value.toFixed(3))}${units ? ` ${units}` : ""}`
  return value
}

// ---- Panels ----------------------------------------------------------------------------

export const PANEL_HEADER = 44
export const PANEL_ROW = 40
export const PANEL_PADDING = 10

/** A panel's height for its rows (it grows as rows are added). */
export const panelHeight = (rows: number, title: boolean) =>
  (title ? PANEL_HEADER : PANEL_PADDING) +
  Math.max(1, rows) * PANEL_ROW +
  PANEL_PADDING

/**
 * The height an element is designed at. Its content is laid out at this height and
 * scaled to the shape, so a taller shape is a bigger control, not a roomier card.
 */
export function designHeight(el: Pick<UiElement, "kind" | "links" | "layout">) {
  switch (el.kind) {
    case "badge":
      return 28
    case "slider":
    case "progress":
      return 60
    case "setpoint":
    case "select":
      return 72
    case "nav":
      return el.layout === "column" ? 8 + Math.max(1, el.links.length) * 36 : 40
    default:
      return 40
  }
}

/** A single element's starting size (its design size). */
export function elementSize(
  kind: UiKind,
  el: Pick<UiElement, "links" | "layout"> = { links: [], layout: "row" }
): { w: number; h: number } {
  const h = designHeight({ kind, ...el })
  switch (kind) {
    case "button":
      return { w: 152, h }
    case "badge":
      return { w: 112, h }
    case "menu":
      return { w: 168, h }
    case "nav":
      return el.layout === "column"
        ? { w: 184, h }
        : { w: Math.max(240, 8 + Math.max(1, el.links.length) * 104), h }
    default:
      return { w: 224, h }
  }
}
