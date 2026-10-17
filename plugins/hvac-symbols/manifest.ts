// What an agent needs to know about each piece beyond its drawing: where ducts and
// pipes connect (ports, in the piece's own viewBox units, before flips), what the piece
// is for, and which kinds of points drive it (roles, with the behavior to bind each).
// Pure module (no React, no DOM, relative imports) so `node --test` can check it.
//
// Ports sit where the drawing meets its line. Equipment carries the duct or pipe
// through its vertical center (the library's rule); the exceptions are written out
// (roof fans from below, end-suction discharge on top, chiller barrels, exchangers).
// Edit them in the symbol library's svg/library.json, then `npm run symbols:sync`.

import { MANIFEST } from "./manifest.generated.ts"

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

// The entries come from the symbol library's svg/library.json, written out by
// scripts/build-symbols.mjs (shared roles such as "run" and "fault" expanded).
export { MANIFEST }

export function manifestFor(id: string): ManifestEntry | undefined {
  return MANIFEST[id]
}
