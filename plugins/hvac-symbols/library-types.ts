// Shapes of the generated symbol library (see scripts/build-symbols.mjs). Pure module.

export type SymbolCategory = "air" | "water" | "shared"

/** What a piece can show, detected from its CSS. */
export type SymbolFeature =
  | "on" // active: color and animation on moving parts
  | "ccw" // reversed rotation (mirrored blades)
  | "flow" // animated flow along a duct or pipe
  | "parallel" // parallel damper blades (opposed by default)
  | "loaded" // dirty filter
  | "position" // damper position, % open (drives --blade)
  | "level" // tank level, % (drives --level)
  | "sash" // fume hood sash, % open (drives --sash)
  | "text" // editable label text (sensors)
  | "status" // status plate: takes Niagara's status color (st-alarm, st-fault, …)

/** Niagara statuses a piece's plate can show (ok shows none). */
export type SymbolStatus =
  "alarm" | "fault" | "down" | "overridden" | "stale" | "disabled"

/** The library's status model (svg/library.json). */
export interface StatusModel {
  /** Highest first: a point that is both disabled and in alarm shows disabled. */
  priority: SymbolStatus[]
  colors: Record<SymbolStatus, { bg: string; fg: string }>
  /** The plate sits at +offset and steps out to +statusOffset with a status. */
  plate: { offset: number; statusOffset: number }
}

export interface SymbolPiece {
  /** "category/name", from the file path. */
  id: string
  category: SymbolCategory
  title: string
  /** viewBox size; the origin is always 0 0. */
  width: number
  height: number
  /** Root class every rule in `css` is scoped to. */
  scope: string
  css: string
  /** Drawing markup. Contains {L} when it stretches and {TEXT} when it has a label. */
  body: string
  features: SymbolFeature[]
  /** Extra search terms from library.json (the id's own words are added by searchTermsFor). */
  keywords: string[]
  /** Default label text. */
  text?: string
  /** Stretches along x (ducts and pipes) instead of scaling uniformly. */
  stretch?: "x"
}
