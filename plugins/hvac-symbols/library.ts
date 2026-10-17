// The HVAC symbol library: lookup, search terms, and how a symbol's state turns into
// root classes, CSS variables and markup. Pure module (no React, no DOM).

import { PIECES, STATUS } from "./library.generated.ts"
import type {
  StatusModel,
  SymbolCategory,
  SymbolFeature,
  SymbolPiece,
  SymbolStatus,
} from "./library-types.ts"

export type {
  StatusModel,
  SymbolCategory,
  SymbolFeature,
  SymbolPiece,
  SymbolStatus,
}
export { PIECES, STATUS }

const BY_ID = new Map(PIECES.map((piece) => [piece.id, piece]))

export function getSymbol(id: string): SymbolPiece | undefined {
  return BY_ID.get(id)
}

export const CATEGORIES: { id: SymbolCategory; title: string }[] = [
  { id: "air", title: "Air side" },
  { id: "water", title: "Water side" },
  { id: "shared", title: "Sensors" },
]

export function searchTermsFor(piece: SymbolPiece): string[] {
  return [...new Set([...piece.id.split(/[/-]/), ...piece.keywords])]
}

/** Inserted size: native for equipment, a longer run for ducts and pipes. */
export function defaultSize(piece: SymbolPiece): { w: number; h: number } {
  return piece.stretch
    ? { w: piece.width * 2, h: piece.height }
    : { w: piece.width, h: piece.height }
}

/** Everything a symbol can show. Numbers are percentages (0–100). */
export interface SymbolState {
  on: boolean
  ccw: boolean
  flow: boolean
  parallel: boolean
  loaded: boolean
  /** Damper, % open. */
  position: number
  /** Tank, % full. */
  level: number
  /** Fume hood sash, % open. */
  sash: number
  /** Label text; empty uses the symbol's default. */
  text: string
}

export const DEFAULT_STATE: SymbolState = {
  on: false,
  ccw: false,
  flow: false,
  parallel: false,
  loaded: false,
  position: 50,
  level: 60,
  sash: 50,
  text: "",
}

const BOOLEAN_STATES = ["on", "ccw", "flow", "parallel", "loaded"] as const
const NUMBER_STATES = ["position", "level", "sash"] as const

const clampPct = (n: number) =>
  Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0

/** Saved state with runtime overrides (from behaviors) on top. Unknown or mistyped keys are ignored. */
export function resolveState(
  saved: SymbolState,
  overrides: Readonly<Record<string, boolean | number>> | null
): SymbolState {
  if (!overrides) return saved
  const next = { ...saved }
  for (const key of BOOLEAN_STATES) {
    const value = overrides[key]
    if (typeof value === "boolean") next[key] = value
  }
  for (const key of NUMBER_STATES) {
    const value = overrides[key]
    if (typeof value === "number") next[key] = value
  }
  return next
}

/** Words in a Niagara status string ("{alarm,unackedAlarm}", "overridden @ 8") per status. */
const STATUS_WORDS: Record<SymbolStatus, RegExp> = {
  disabled: /disabled/,
  fault: /fault/,
  down: /down/,
  alarm: /alarm/,
  stale: /stale/,
  overridden: /overridden|@\s*\d+/,
}

/** The status a plate shows for a point's status string, by the library's priority; null for ok. */
export function symbolStatus(
  status: string | null | undefined
): SymbolStatus | null {
  if (!status) return null
  const s = status.toLowerCase()
  return STATUS.priority.find((key) => STATUS_WORDS[key].test(s)) ?? null
}

/** Root classes for the symbol's <svg>. Only classes the piece understands are added. */
export function symbolClasses(
  piece: SymbolPiece,
  state: SymbolState,
  opts: {
    dark: boolean
    flipX?: boolean
    flipY?: boolean
    /** A Niagara status string (or a SymbolStatus); colors the plate. */
    status?: string | null
  }
): string {
  const classes = ["bas-symbol", piece.scope]
  if (opts.dark) classes.push("dk")
  for (const key of BOOLEAN_STATES) {
    if (state[key] && piece.features.includes(key)) classes.push(key)
  }
  const status = piece.features.includes("status")
    ? symbolStatus(opts.status)
    : null
  if (status) classes.push(`st-${status}`)
  if (opts.flipX) classes.push("fx")
  if (opts.flipY) classes.push("fy")
  return classes.join(" ")
}

/** CSS variables the piece reads (damper blade angle, tank level, sash opening). */
export function symbolVars(
  piece: SymbolPiece,
  state: SymbolState
): Record<string, string> {
  const vars: Record<string, string> = {}
  if (piece.features.includes("position"))
    vars["--blade"] = `${round((1 - clampPct(state.position) / 100) * 90)}deg`
  if (piece.features.includes("level"))
    vars["--level"] = String(round(clampPct(state.level) / 100))
  if (piece.features.includes("sash"))
    vars["--sash"] = String(round(clampPct(state.sash) / 100))
  return vars
}

/** The drawing's length in viewBox units for a stretched piece drawn w × h. */
export function stretchLength(
  piece: SymbolPiece,
  w: number,
  h: number
): number {
  if (!piece.stretch || h <= 0) return piece.width
  return round(Math.max(1, (w * piece.height) / h))
}

export function viewBoxFor(piece: SymbolPiece, length: number): string {
  return `0 0 ${piece.stretch ? length : piece.width} ${piece.height}`
}

/** Inner markup with the run length and label text filled in. */
export function symbolMarkup(
  piece: SymbolPiece,
  opts: { length?: number; text?: string } = {}
): string {
  let body = piece.body
  if (piece.stretch)
    body = body.replaceAll("{L}", String(opts.length ?? piece.width))
  if (piece.features.includes("text"))
    body = body.replaceAll("{TEXT}", escapeXml(opts.text || piece.text || ""))
  return body
}

/**
 * CSS every symbol needs on top of its own:
 * - The pieces are drawn for plain SVG defaults, but inline SVG inherits from the page
 *   (tldraw's shape containers set round line caps and joins, which turn the plug fan's
 *   dashed blades into a solid bar). The root resets every inherited SVG property.
 * - Label text stays upright when a symbol is mirrored (the library's .label contract).
 */
export const SHARED_CSS =
  ".bas-symbol{color:#000;fill:#000;fill-opacity:1;fill-rule:nonzero;" +
  "stroke:none;stroke-width:1;stroke-opacity:1;stroke-linecap:butt;stroke-linejoin:miter;" +
  "stroke-miterlimit:4;stroke-dasharray:none;stroke-dashoffset:0;paint-order:normal;" +
  "font-family:sans-serif;font-size:16px;font-style:normal;font-weight:400;" +
  "letter-spacing:normal;text-anchor:start;dominant-baseline:auto;visibility:visible}" +
  ".bas-symbol .label{transform-box:fill-box;transform-origin:center}" +
  ".bas-symbol.fx .label{transform:scale(-1,1)}" +
  ".bas-symbol.fy .label{transform:scale(1,-1)}" +
  ".bas-symbol.fx.fy .label{transform:scale(-1,-1)}"

export function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function round(n: number) {
  return Math.round(n * 1000) / 1000
}

/** States a behavior can drive, per feature the piece has. */
export interface SymbolStateOption {
  key: keyof SymbolState
  label: string
  kind: "boolean" | "number"
  unit?: string
  min?: number
  max?: number
}

const STATE_OPTIONS: Partial<Record<SymbolFeature, SymbolStateOption>> = {
  on: { key: "on", label: "On", kind: "boolean" },
  flow: { key: "flow", label: "Flow", kind: "boolean" },
  loaded: { key: "loaded", label: "Dirty filter", kind: "boolean" },
  ccw: { key: "ccw", label: "Reverse rotation", kind: "boolean" },
  position: {
    key: "position",
    label: "Damper open",
    kind: "number",
    unit: "%",
    min: 0,
    max: 100,
  },
  level: {
    key: "level",
    label: "Level",
    kind: "number",
    unit: "%",
    min: 0,
    max: 100,
  },
  sash: {
    key: "sash",
    label: "Sash open",
    kind: "number",
    unit: "%",
    min: 0,
    max: 100,
  },
}

export function stateOptionsFor(piece: SymbolPiece): SymbolStateOption[] {
  return piece.features.flatMap((feature) => {
    const option = STATE_OPTIONS[feature]
    return option ? [option] : []
  })
}
