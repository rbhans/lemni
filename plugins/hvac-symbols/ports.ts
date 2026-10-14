// Where a symbol's ports are once it's sized, flipped and turned. Pure module (no
// React, no DOM, relative imports) so `node --test` can check it.

import type { SymbolPiece } from "./library-types.ts"
import type { LineKind, ManifestEntry, PortDir } from "./manifest.ts"

export interface PlacedPort {
  id: string
  x: number
  y: number
  dir: PortDir
  line: LineKind
}

export interface SymbolSize {
  w: number
  h: number
  flipX?: boolean
  flipY?: boolean
}

const FLIP_X: Record<PortDir, PortDir> = {
  left: "right",
  right: "left",
  up: "up",
  down: "down",
}
const FLIP_Y: Record<PortDir, PortDir> = {
  left: "left",
  right: "right",
  up: "down",
  down: "up",
}
const TURN: PortDir[] = ["right", "down", "left", "up"]

/** A direction after `quarterTurns` clockwise quarter turns. */
export function turnDir(dir: PortDir, quarterTurns: number): PortDir {
  const i = TURN.indexOf(dir)
  return TURN[(((i + quarterTurns) % 4) + 4) % 4]
}

/**
 * Ports in the shape's own space (0,0 = its top-left, before rotation). Equipment
 * keeps its proportions inside the box (centered); runs stretch along x.
 */
export function localPorts(
  piece: SymbolPiece,
  entry: ManifestEntry,
  size: SymbolSize
): PlacedPort[] {
  const { w, h } = size
  let map: (x: number, y: number, end?: boolean) => [number, number]
  if (piece.stretch) {
    const sy = h / piece.height
    map = (x, y, end) => [end ? w : x * sy, y * sy]
  } else {
    const s = Math.min(w / piece.width, h / piece.height)
    const ox = (w - piece.width * s) / 2
    const oy = (h - piece.height * s) / 2
    map = (x, y) => [ox + x * s, oy + y * s]
  }
  return entry.ports.map((port) => {
    let [x, y] = map(port.at[0], port.at[1], port.end)
    let dir = port.dir
    if (size.flipX) {
      x = w - x
      dir = FLIP_X[dir]
    }
    if (size.flipY) {
      y = h - y
      dir = FLIP_Y[dir]
    }
    return { id: port.id, x, y, dir, line: port.line }
  })
}

/** Rotates a point in shape space by quarter turns about the shape's origin. */
export function rotateLocal(
  x: number,
  y: number,
  quarterTurns: number
): [number, number] {
  switch (((quarterTurns % 4) + 4) % 4) {
    case 1:
      return [-y, x]
    case 2:
      return [-x, -y]
    case 3:
      return [y, -x]
    default:
      return [x, y]
  }
}

/** The shape's top-left (origin) that puts `port` at the page point `at`. */
export function originFor(
  port: { x: number; y: number },
  at: { x: number; y: number },
  quarterTurns = 0
): { x: number; y: number } {
  const [dx, dy] = rotateLocal(port.x, port.y, quarterTurns)
  return { x: at.x - dx, y: at.y - dy }
}

export interface Segment {
  /** Straight runs, as start and end points on the line's center. */
  runs: { x0: number; y0: number; x1: number; y1: number }[]
  /** Where an elbow piece goes, if the line turns. */
  corner: { x: number; y: number } | null
}

/**
 * The line between two ports: straight when they line up (within `tolerance`),
 * otherwise one turn, leaving the first port the way it faces.
 */
export function route(
  from: { x: number; y: number; dir: PortDir },
  to: { x: number; y: number },
  tolerance = 1.5
): Segment {
  if (Math.abs(from.y - to.y) <= tolerance)
    return {
      runs: [{ x0: from.x, y0: from.y, x1: to.x, y1: from.y }],
      corner: null,
    }
  if (Math.abs(from.x - to.x) <= tolerance)
    return {
      runs: [{ x0: from.x, y0: from.y, x1: from.x, y1: to.y }],
      corner: null,
    }
  const horizontalFirst = from.dir === "left" || from.dir === "right"
  const corner = horizontalFirst
    ? { x: to.x, y: from.y }
    : { x: from.x, y: to.y }
  return {
    runs: [
      { x0: from.x, y0: from.y, x1: corner.x, y1: corner.y },
      { x0: corner.x, y0: corner.y, x1: to.x, y1: to.y },
    ],
    corner,
  }
}

/** True when a page point lies on the 10 px grid (to half a pixel). */
export const onGrid = (n: number) =>
  Math.abs(n - Math.round(n / 10) * 10) <= 0.5
