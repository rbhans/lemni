"use client"

import { FanIcon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { createShapeId, type Editor, type VecLike } from "tldraw"

import {
  bindBehavior,
  canBindBehaviors,
  getDataSource,
  kindOfValue,
  type PointCreateOption,
  type PointDragData,
  type PointDropContribution,
  type PointKind,
} from "@/sdk"

import {
  CATEGORIES,
  defaultSize,
  PIECES,
  searchTermsFor,
  type SymbolPiece,
} from "./library"
import { manifestFor, type PointRole } from "./manifest"
import { SYMBOL_TYPE } from "./symbol-shape"

// Points dropped on empty canvas can become a symbol that already reacts to them: a fan
// for a fan status (running), a damper for its position. The manifest says which kinds
// of points drive each piece and with which behavior.

function kindOf(point: PointDragData): PointKind | null {
  return (
    point.kind ??
    kindOfValue(getDataSource(point.source)?.value(point.point).get())
  )
}

const fits = (role: PointRole, kind: PointKind | null) =>
  role.kind === "any" || kind === null || role.kind === kind

const named = (role: PointRole, point: PointDragData) => {
  const name =
    `${point.label} ${point.point.split("/").pop() ?? ""}`.toLowerCase()
  return role.words.some((word) => name.includes(word.toLowerCase()))
}

/**
 * Equipment a point's name points at, from common BAS abbreviations: SF-S → fan,
 * CHWP-1 → pump, OA-D → damper. Matched against each piece's search terms.
 */
const EQUIPMENT: readonly [RegExp, string][] = [
  [/\b(sf|rf|ef|exf|fan)\b|fan/, "fan"],
  [/\b(p|chwp|hwp|cwp|pump)\b|pump/, "pump"],
  [/\b(blr|b|boiler)\b|boiler/, "boiler"],
  [/\b(ch|chlr|chiller)\b|chiller/, "chiller"],
  [/\b(ct|tower)\b|tower/, "tower"],
  [/\b(d|dmp|dpr|damper)\b|damper|dmpr/, "damper"],
  [/\b(v|vlv|valve)\b|valve/, "valve"],
  [/\b(flt|filter)\b|filter/, "filter"],
  [/\b(hum|humidifier)\b|humid/, "humidifier"],
  [/\b(erw|wheel)\b|wheel/, "wheel"],
  [/\b(tk|tank)\b|tank/, "tank"],
  [/\b(hx|exchanger)\b|exchanger/, "exchanger"],
]

function equipmentWords(point: PointDragData): string[] {
  const name = `${point.label} ${point.point.split("/").slice(-3).join(" ")}`
    .toLowerCase()
    .replace(/[_\-/.]+/g, " ")
  return EQUIPMENT.filter(([pattern]) => pattern.test(name)).map(
    ([, word]) => word
  )
}

const pieceIs = (piece: SymbolPiece, words: string[]) => {
  const terms = searchTermsFor(piece).join(" ").toLowerCase()
  return words.some((word) => terms.includes(word))
}

/** The role this point plays on the piece: a fitting kind, its name first. */
function roleFor(piece: SymbolPiece, point: PointDragData): PointRole | null {
  const roles = (manifestFor(piece.id)?.roles ?? []).filter((role) =>
    fits(role, kindOf(point))
  )
  return roles.find((role) => named(role, point)) ?? roles[0] ?? null
}

function place(
  editor: Editor,
  piece: SymbolPiece,
  point: PointDragData,
  at: VecLike
) {
  const { w, h } = defaultSize(piece)
  const id = createShapeId()
  editor.markHistoryStoppingPoint("insert symbol for point")
  editor.createShape({
    id,
    type: SYMBOL_TYPE,
    x: at.x - w / 2,
    y: at.y - h / 2,
    props: { symbol: piece.id, w, h },
  })
  editor.select(id)
  const role = roleFor(piece, point)
  const behavior = role?.behaviors[0]
  if (!behavior) return
  if (!canBindBehaviors()) {
    toast.info(`Placed a ${piece.title.toLowerCase()}.`, {
      description: "Turn on Behaviors to make it react to the point.",
    })
    return
  }
  const bound = bindBehavior(editor, id, {
    effect: behavior.effect,
    params: behavior.params,
    point: { source: point.source, point: point.point, label: point.label },
    kind: kindOf(point),
  })
  if (!bound)
    toast.info(`Placed a ${piece.title.toLowerCase()}.`, {
      description: `Couldn't bind ${point.label} to it; add a behavior in the Behavior tab.`,
    })
}

const sectionOf = (piece: SymbolPiece) =>
  CATEGORIES.find((c) => c.id === piece.category)?.title ?? ""

/** The pieces a point can drive, from the manifest's roles. */
function options(
  preview: (piece: SymbolPiece) => React.ReactNode
): PointCreateOption[] {
  return PIECES.filter((piece) => manifestFor(piece.id)?.roles.length).map(
    (piece) => ({
      id: piece.id,
      label: piece.title,
      icon: FanIcon,
      preview: preview(piece),
      section: sectionOf(piece),
      accepts: ([point]) => Boolean(point && roleFor(piece, point)),
      // Suggested when the name says both what it is and what it does (SF-S: a fan's status).
      suggested: ([point]) => {
        const role = point ? roleFor(piece, point) : null
        return Boolean(
          point &&
          role &&
          named(role, point) &&
          pieceIs(piece, equipmentWords(point))
        )
      },
      run: ({ editor }, [point], at) => {
        if (point) place(editor, piece, point, at)
      },
    })
  )
}

/** The drop menu's HVAC flyout. */
export function symbolPointDrop(
  preview: (piece: SymbolPiece) => React.ReactNode
): PointDropContribution {
  return {
    id: "hvac-symbol",
    order: 25,
    group: { id: "hvac", label: "HVAC", order: 20 },
    creates: options(preview),
  }
}
