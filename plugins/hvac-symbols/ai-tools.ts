"use client"

import {
  Box,
  createShapeId,
  type Editor,
  type TLParentId,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from "tldraw"

import { pageForInsert, pageIdSchema } from "@/studio/ai/pages"
import type { JsonSchema } from "@/studio/ai/schema"
import { customShapeName } from "@/studio/lib/shape-names"
import type { AiBoardTool, AiContribution } from "@/studio/plugins/types"

import {
  DEFAULT_STATE,
  defaultSize,
  getSymbol,
  PIECES,
  searchTermsFor,
  stateOptionsFor,
  type SymbolPiece,
  type SymbolState,
} from "./library"
import { manifestFor, type LineKind, type PortDir } from "./manifest"
import {
  localPorts,
  onGrid,
  originFor,
  route,
  turnDir,
  type PlacedPort,
} from "./ports"
import { isSymbolShape, SYMBOL_TYPE, type SymbolShape } from "./symbol-shape"

// The HVAC library for AI apps: what each piece is, where its ducts and pipes connect,
// which points drive it, and tools to place pieces, run lines between ports, lay out a
// whole air or water path, and check the result.

const LINE_PIECE: Record<Exclude<LineKind, "probe">, string> = {
  duct: "air/duct",
  pipe: "water/pipe",
}
const JUNCTION_PIECE: Record<Exclude<LineKind, "probe">, string> = {
  duct: "air/duct-junction",
  pipe: "water/pipe-junction",
}
const isLine = (id: string) =>
  id === "air/duct" ||
  id === "water/pipe" ||
  id === "air/duct-junction" ||
  id === "water/pipe-junction"

const round = (n: number) => Math.round(n * 10) / 10
const quarterTurns = (shape: TLShape) =>
  Math.round(shape.rotation / (Math.PI / 2))

function pieceOrThrow(id: string): SymbolPiece {
  const piece = getSymbol(id)
  if (!piece)
    throw new Error(`No symbol ${id}. list_symbols shows the library.`)
  return piece
}

/** A symbol's ports on the page. */
export function pagePorts(editor: Editor, shape: SymbolShape): PlacedPort[] {
  const piece = getSymbol(shape.props.symbol)
  const entry = manifestFor(shape.props.symbol)
  if (!piece || !entry) return []
  const transform = editor.getShapePageTransform(shape.id)
  const turns = quarterTurns(shape)
  return localPorts(piece, entry, shape.props).map((port) => {
    const p = transform.applyToPoint({ x: port.x, y: port.y })
    return {
      ...port,
      x: round(p.x),
      y: round(p.y),
      dir: turnDir(port.dir, turns),
    }
  })
}

const stateSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  description:
    "Built-in look: booleans, and percentages for position, level and sash.",
  properties: {
    on: { type: "boolean" },
    ccw: { type: "boolean" },
    flow: { type: "boolean" },
    parallel: { type: "boolean" },
    loaded: { type: "boolean" },
    position: { type: "number", minimum: 0, maximum: 100 },
    level: { type: "number", minimum: 0, maximum: 100 },
    sash: { type: "number", minimum: 0, maximum: 100 },
  },
}

const portRef: JsonSchema = {
  type: "object",
  required: ["shape", "port"],
  additionalProperties: false,
  properties: { shape: { type: "string" }, port: { type: "string" } },
}

type StateInput = Partial<Omit<SymbolState, "text">>

interface SymbolInput {
  ref?: string
  symbol: string
  x?: number
  y?: number
  at?: { port: string; x: number; y: number }
  w?: number
  length?: number
  flipX?: boolean
  flipY?: boolean
  rotation?: 0 | 90 | 180 | 270
  state?: StateInput
  text?: string
  name?: string
}

const symbolInputSchema: JsonSchema = {
  type: "object",
  required: ["symbol"],
  additionalProperties: false,
  properties: {
    ref: { type: "string", maxLength: 40 },
    symbol: { type: "string", description: "A library id from list_symbols." },
    x: { type: "number", description: "Left edge (page coordinates)." },
    y: { type: "number", description: "Top edge (page coordinates)." },
    at: {
      type: "object",
      required: ["port", "x", "y"],
      additionalProperties: false,
      description: "Instead of x/y: put this port at this page point.",
      properties: {
        port: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
      },
    },
    w: {
      type: "number",
      minimum: 10,
      maximum: 2000,
      description: "Width; equipment keeps its proportions.",
    },
    length: {
      type: "number",
      minimum: 10,
      maximum: 10000,
      description: "Runs (duct, pipe): their length.",
    },
    flipX: { type: "boolean" },
    flipY: { type: "boolean" },
    rotation: { type: "integer", enum: [0, 90, 180, 270] },
    state: stateSchema,
    text: {
      type: "string",
      maxLength: 12,
      description: "Sensor tag, e.g. T, P, RH.",
    },
    name: { type: "string", maxLength: 120 },
  },
}

/** Size, origin and props for a new symbol; doesn't create it. */
function symbolPartial(
  editor: Editor,
  input: SymbolInput,
  pageId: TLParentId
): TLShapePartial {
  const piece = pieceOrThrow(input.symbol)
  const entry = manifestFor(piece.id)!
  const base = defaultSize(piece)
  const size = piece.stretch
    ? { w: input.length ?? input.w ?? base.w, h: base.h }
    : input.w
      ? { w: input.w, h: (input.w * piece.height) / piece.width }
      : base
  const flips = { flipX: input.flipX ?? false, flipY: input.flipY ?? false }
  const turns = (input.rotation ?? 0) / 90
  const local = localPorts(piece, entry, { ...size, ...flips })
  let origin: { x: number; y: number }
  if (input.at) {
    const port = local.find((p) => p.id === input.at!.port)
    if (!port)
      throw new Error(
        `${piece.id} has no port ${input.at.port} (it has ${local.map((p) => p.id).join(", ") || "none"}).`
      )
    origin = originFor(port, input.at, turns)
  } else {
    const center = editor.getViewportPageBounds().center
    origin = {
      x: input.x ?? center.x - size.w / 2,
      y: input.y ?? center.y - size.h / 2,
    }
  }
  const state: Partial<SymbolState> = { ...(input.state ?? {}) }
  if (input.text !== undefined) state.text = input.text
  const partial: TLShapePartial = {
    id: createShapeId(),
    type: SYMBOL_TYPE,
    parentId: pageId,
    x: origin.x,
    y: origin.y,
    rotation: (turns * Math.PI) / 2,
    props: {
      symbol: piece.id,
      w: size.w,
      h: size.h,
      ...flips,
      ...state,
    },
    ...(input.name ? { meta: { name: input.name } } : {}),
  }
  return partial
}

function describeSymbol(editor: Editor, shape: SymbolShape) {
  return {
    id: shape.id,
    symbol: shape.props.symbol,
    ...(customShapeName(shape) ? { name: customShapeName(shape) } : {}),
    ports: pagePorts(editor, shape),
  }
}

function frameOrThrow(editor: Editor, id: string) {
  const shape = editor.getShape(id as TLShapeId)
  if (!shape) throw new Error(`No shape ${id} to put them in.`)
  if (shape.type !== "frame" && shape.type !== "group")
    throw new Error(`${id} isn't a frame or group.`)
  return shape
}

// ---- Tools ------------------------------------------------------------------------------

const listSymbols: AiBoardTool<{ query?: string; ids?: string[] }> = {
  name: "list_symbols",
  title: "Look up HVAC symbols",
  access: "read",
  description:
    "The HVAC library in detail: what each piece is for, its default size, its ports (where ducts and pipes connect: position in the piece's own units, the way the line leaves, duct or pipe), the states it can show, and the point roles that drive it with the behavior to add for each (use add_behavior). Filter with a query ('fan', 'chw valve') or ids.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", maxLength: 100 },
      ids: { type: "array", maxItems: 40, items: { type: "string" } },
    },
  },
  run(_ctx, input) {
    const words = (input.query ?? "").toLowerCase().split(/\s+/).filter(Boolean)
    const pieces = PIECES.filter((piece) => {
      if (input.ids) return input.ids.includes(piece.id)
      const entry = manifestFor(piece.id)
      const text = [
        piece.id,
        piece.title,
        entry?.use ?? "",
        ...searchTermsFor(piece),
      ]
        .join(" ")
        .toLowerCase()
      return words.every((word) => text.includes(word))
    })
    return {
      text: `${pieces.length} piece(s). Equipment carries its duct or pipe through its vertical center, flowing left to right; flipX reverses it. Lay out a whole air or water path with place_run.`,
      data: pieces.map((piece) => {
        const entry = manifestFor(piece.id)!
        const size = defaultSize(piece)
        return {
          id: piece.id,
          title: piece.title,
          use: entry.use,
          size: [size.w, size.h],
          ...(piece.stretch ? { stretches: "length" } : {}),
          ports: entry.ports.map((p) => ({
            id: p.id,
            at: p.end ? ["end", p.at[1]] : p.at,
            dir: p.dir,
            line: p.line,
          })),
          states: stateOptionsFor(piece).map((s) => ({
            key: s.key,
            kind: s.kind,
            ...(s.unit ? { unit: s.unit } : {}),
          })),
          roles: entry.roles,
          ...(piece.features.includes("text")
            ? { text: piece.text ?? "" }
            : {}),
        }
      }),
    }
  },
}

const placeSymbols: AiBoardTool<{
  pageId?: string
  parent?: string
  symbols: SymbolInput[]
}> = {
  name: "place_symbols",
  title: "Place HVAC symbols",
  access: "edit",
  description:
    "Places library pieces on a UI page in one go: by top-left x/y, or with `at` to put one of its ports on a page point (e.g. a damper's in-port on the end of a duct). Options: width (equipment keeps proportions), length (ducts, pipes), flips, rotation in quarter turns, built-in state, sensor tag text, name, and a frame to put them in. Returns each new shape's id and its ports on the page.",
  inputSchema: {
    type: "object",
    required: ["symbols"],
    additionalProperties: false,
    properties: {
      pageId: pageIdSchema,
      parent: { type: "string", description: "A frame to put them in." },
      symbols: {
        type: "array",
        minItems: 1,
        maxItems: 60,
        items: symbolInputSchema,
      },
    },
  },
  run({ editor }, input) {
    const page = pageForInsert(editor, input.pageId, ["ui"], "HVAC symbols")
    const parent = input.parent ? frameOrThrow(editor, input.parent) : null
    const made: { ref?: string; id: TLShapeId }[] = []
    editor.run(() => {
      for (const symbol of input.symbols) {
        const partial = symbolPartial(editor, symbol, page.id)
        editor.createShape(partial)
        made.push({ ref: symbol.ref, id: partial.id })
      }
      if (parent)
        editor.reparentShapes(
          made.map((m) => m.id),
          parent.id
        )
    })
    return {
      text: `Placed ${made.length} symbol(s).`,
      data: made.map(({ ref, id }) => ({
        ...(ref ? { ref } : {}),
        ...describeSymbol(editor, editor.getShape(id) as SymbolShape),
      })),
    }
  },
}

/** Draws a duct or pipe along runs and puts an elbow at a corner. Returns new ids. */
function drawLine(
  editor: Editor,
  kind: Exclude<LineKind, "probe">,
  runs: { x0: number; y0: number; x1: number; y1: number }[],
  corner: { x: number; y: number } | null,
  pageId: TLParentId
): TLShapeId[] {
  const piece = pieceOrThrow(LINE_PIECE[kind])
  const thickness = piece.height
  const ids: TLShapeId[] = []
  for (const run of runs) {
    const horizontal = Math.abs(run.y1 - run.y0) < Math.abs(run.x1 - run.x0)
    const length = horizontal
      ? Math.abs(run.x1 - run.x0)
      : Math.abs(run.y1 - run.y0)
    if (length < 1) continue
    const id = createShapeId()
    ids.push(id)
    editor.createShape({
      id,
      type: SYMBOL_TYPE,
      parentId: pageId,
      ...(horizontal
        ? {
            x: Math.min(run.x0, run.x1),
            y: run.y0 - thickness / 2,
            rotation: 0,
          }
        : {
            x: run.x0 + thickness / 2,
            y: Math.min(run.y0, run.y1),
            rotation: Math.PI / 2,
          }),
      props: { symbol: piece.id, w: length, h: thickness },
    })
  }
  if (corner) {
    const junction = pieceOrThrow(JUNCTION_PIECE[kind])
    const id = createShapeId()
    ids.push(id)
    editor.createShape({
      id,
      type: SYMBOL_TYPE,
      parentId: pageId,
      x: corner.x - junction.width / 2,
      y: corner.y - junction.height / 2,
      props: { symbol: junction.id, w: junction.width, h: junction.height },
    })
  }
  return ids
}

/** Puts new line pieces next to (and behind) the equipment they join. */
function settleLines(editor: Editor, ids: TLShapeId[], beside: TLShape) {
  if (!ids.length) return
  const parent = editor.getShape(beside.parentId as TLShapeId)
  if (parent) editor.reparentShapes(ids, parent.id)
  editor.sendToBack(ids)
}

function portOf(editor: Editor, ref: { shape: string; port: string }) {
  const shape = editor.getShape(ref.shape as TLShapeId)
  if (!isSymbolShape(shape))
    throw new Error(`${ref.shape} isn't an HVAC symbol.`)
  const port = pagePorts(editor, shape).find((p) => p.id === ref.port)
  if (!port)
    throw new Error(
      `${shape.props.symbol} has no port ${ref.port} (it has ${
        pagePorts(editor, shape)
          .map((p) => p.id)
          .join(", ") || "none"
      }).`
    )
  return { shape, port }
}

const connectPorts: AiBoardTool<{
  connections: {
    from: { shape: string; port: string }
    to: { shape: string; port: string }
  }[]
}> = {
  name: "connect_ports",
  title: "Run duct or pipe between ports",
  access: "edit",
  description:
    "Draws duct or pipe between symbol ports (ids from place_symbols, place_run or read_page): straight when the ports line up, otherwise with one elbow, leaving the first port the way it faces. The line goes behind the equipment, in the same frame.",
  inputSchema: {
    type: "object",
    required: ["connections"],
    additionalProperties: false,
    properties: {
      connections: {
        type: "array",
        minItems: 1,
        maxItems: 40,
        items: {
          type: "object",
          required: ["from", "to"],
          additionalProperties: false,
          properties: { from: portRef, to: portRef },
        },
      },
    },
  },
  run({ editor }, input) {
    const made: TLShapeId[] = []
    const notes: string[] = []
    editor.run(() => {
      for (const connection of input.connections) {
        const a = portOf(editor, connection.from)
        const b = portOf(editor, connection.to)
        if (a.port.line === "probe" || b.port.line === "probe")
          throw new Error(
            "Sensor probes sit on a line; place them with `at` instead."
          )
        if (a.port.line !== b.port.line)
          notes.push(
            `${connection.from.shape}.${a.port.id} is ${a.port.line}, ${connection.to.shape}.${b.port.id} is ${b.port.line}; drew ${a.port.line}.`
          )
        const segment = route(a.port, b.port)
        const pageId = editor.getAncestorPageId(a.shape)!
        const ids = drawLine(
          editor,
          a.port.line,
          segment.runs,
          segment.corner,
          pageId
        )
        settleLines(editor, ids, a.shape)
        made.push(...ids)
      }
    })
    return {
      text: `Drew ${made.length} line piece(s).${notes.length ? ` ${notes.join(" ")}` : ""}`,
      data: { ids: made },
    }
  },
}

interface RunItem {
  ref?: string
  symbol: string
  gapBefore?: number
  w?: number
  flipX?: boolean
  state?: StateInput
  name?: string
}

const placeRun: AiBoardTool<{
  pageId?: string
  parent?: string
  frame?: string
  x: number
  y: number
  direction?: "right" | "left"
  gap?: number
  lead?: number
  tail?: number
  items: RunItem[]
  sensors?: { ref?: string; after: number; text: string; name?: string }[]
}> = {
  name: "place_run",
  title: "Lay out an air or water path",
  access: "edit",
  description:
    "Builds a straight air or water path in one call, the quick way to draw an air handler: the pieces in flow order (e.g. outside air damper, filter, preheat coil, cooling coil, supply fan) on one centerline starting at x/y, their boxes spaced by gap (boxes include a 10 px margin; sensors get room automatically), on the 10 px grid, with one continuous duct (or pipe) behind them that extends `lead` before and `tail` after. direction 'left' runs right to left (pieces are mirrored to face the flow). Sensors (tag text like T, P, RH) go on the line after item index `after` (-1 = before the first). Optionally wraps everything in a new frame. Returns ids and ports.",
  inputSchema: {
    type: "object",
    required: ["x", "y", "items"],
    additionalProperties: false,
    properties: {
      pageId: pageIdSchema,
      parent: {
        type: "string",
        description: "An existing frame to put it in.",
      },
      frame: {
        type: "string",
        maxLength: 120,
        description: "Name of a new frame around it.",
      },
      x: { type: "number", description: "Where the line starts (page)." },
      y: { type: "number", description: "The line's centerline (page)." },
      direction: { type: "string", enum: ["right", "left"] },
      gap: { type: "number", minimum: 0, maximum: 500 },
      lead: { type: "number", minimum: 0, maximum: 2000 },
      tail: { type: "number", minimum: 0, maximum: 2000 },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 24,
        items: {
          type: "object",
          required: ["symbol"],
          additionalProperties: false,
          properties: {
            ref: { type: "string", maxLength: 40 },
            symbol: { type: "string" },
            gapBefore: { type: "number", minimum: 0, maximum: 1000 },
            w: { type: "number", minimum: 10, maximum: 1000 },
            flipX: { type: "boolean" },
            state: stateSchema,
            name: { type: "string", maxLength: 120 },
          },
        },
      },
      sensors: {
        type: "array",
        maxItems: 24,
        items: {
          type: "object",
          required: ["after", "text"],
          additionalProperties: false,
          properties: {
            ref: { type: "string", maxLength: 40 },
            after: { type: "integer", minimum: -1 },
            text: { type: "string", maxLength: 12 },
            name: { type: "string", maxLength: 120 },
          },
        },
      },
    },
  },
  run({ editor }, input) {
    const page = pageForInsert(editor, input.pageId, ["ui"], "HVAC symbols")
    const parent = input.parent ? frameOrThrow(editor, input.parent) : null
    const sign = input.direction === "left" ? -1 : 1
    const sensorPiece = pieceOrThrow("shared/sensor")
    // A sensor needs its own width of free line; make room wherever one goes.
    const room = sensorPiece.width + 10
    const sensorsAfter = new Set((input.sensors ?? []).map((s) => s.after))
    const gap = input.gap ?? 10
    const lead = Math.max(input.lead ?? 40, sensorsAfter.has(-1) ? room : 0)
    const tail = Math.max(
      input.tail ?? 60,
      sensorsAfter.has(input.items.length - 1) ? room + 20 : 0
    )
    const entryDir: PortDir = sign > 0 ? "left" : "right"
    const exitDir: PortDir = sign > 0 ? "right" : "left"
    const snap = (n: number) => Math.round(n / 10) * 10

    let line: LineKind | null = null
    // Pieces line up by their boxes (on the 10 px grid), not their drawn edges.
    let cursor = snap(input.x + sign * lead)
    const placed: {
      ref?: string
      id: TLShapeId
      entry: number
      exit: number
    }[] = []
    const allIds: TLShapeId[] = []

    editor.run(() => {
      input.items.forEach((item, index) => {
        const piece = pieceOrThrow(item.symbol)
        if (piece.stretch || isLine(piece.id))
          throw new Error(
            `${piece.id} is a line; the run draws the line itself.`
          )
        const flipX = (item.flipX ?? false) !== sign < 0
        const w = item.w ?? defaultSize(piece).w
        const h = (w * piece.height) / piece.width
        const ports = localPorts(piece, manifestFor(piece.id)!, { w, h, flipX })
        const entry = ports.find(
          (p) => p.dir === entryDir && p.line !== "probe"
        )
        const exit = ports.find((p) => p.dir === exitDir && p.line !== "probe")
        if (!entry || !exit)
          throw new Error(
            `${piece.id} doesn't sit in a straight run (no ports facing both ways).`
          )
        line ??= entry.line
        if (index > 0) {
          const space = item.gapBefore ?? gap
          cursor +=
            sign *
            snap(sensorsAfter.has(index - 1) ? Math.max(space, room) : space)
        }
        // The box starts at the cursor; its through-line sits on the centerline.
        const origin = {
          x: sign > 0 ? cursor : cursor - w,
          y: input.y - entry.y,
        }
        const id = createShapeId()
        editor.createShape({
          id,
          type: SYMBOL_TYPE,
          parentId: page.id,
          x: origin.x,
          y: origin.y,
          props: {
            symbol: piece.id,
            w,
            h,
            flipX,
            ...(item.state ?? {}),
          },
          ...(item.name ? { meta: { name: item.name } } : {}),
        })
        // Box edges, so sensors centre in the free space between boxes.
        const near = sign > 0 ? origin.x : origin.x + w
        const far = sign > 0 ? origin.x + w : origin.x
        placed.push({ ref: item.ref, id, entry: near, exit: far })
        allIds.push(id)
        cursor = far
      })

      const kind = (line ?? "duct") as Exclude<LineKind, "probe">
      const end = cursor + sign * tail
      const lineIds = drawLine(
        editor,
        kind,
        [{ x0: input.x, y0: input.y, x1: end, y1: input.y }],
        null,
        page.id
      )
      allIds.unshift(...lineIds)

      const probe = localPorts(sensorPiece, manifestFor(sensorPiece.id)!, {
        w: sensorPiece.width,
        h: sensorPiece.height,
      })[0]
      // Sensors are placed between the run's own pieces, so look only at those.
      const pieces = [...placed]
      for (const sensor of input.sensors ?? []) {
        if (sensor.after >= pieces.length)
          throw new Error(
            `Sensor after item ${sensor.after}: there are ${pieces.length} items.`
          )
        const before = sensor.after >= 0 ? pieces[sensor.after] : null
        const after = pieces[sensor.after + 1]
        const x = snap(
          before && after
            ? (before.exit + after.entry) / 2
            : before
              ? before.exit + sign * (room / 2 + 10)
              : input.x + sign * (lead / 2)
        )
        const id = createShapeId()
        editor.createShape({
          id,
          type: SYMBOL_TYPE,
          parentId: page.id,
          x: x - probe.x,
          // Top on the grid; the probe tip lands on the centerline (within a pixel).
          y: snap(input.y - probe.y),
          props: {
            symbol: sensorPiece.id,
            w: sensorPiece.width,
            h: sensorPiece.height,
            text: sensor.text,
          },
          ...(sensor.name ? { meta: { name: sensor.name } } : {}),
        })
        allIds.push(id)
        placed.push({ ref: sensor.ref, id, entry: x, exit: x })
      }

      let frameId: TLShapeId | null = null
      if (input.frame !== undefined && !parent) {
        const bounds = Box.Common(
          allIds.flatMap((id) => {
            const b = editor.getShapePageBounds(id)
            return b ? [b] : []
          })
        ).expandBy(40)
        frameId = createShapeId()
        editor.createShape({
          id: frameId,
          type: "frame",
          parentId: page.id,
          x: Math.floor(bounds.x / 10) * 10,
          y: Math.floor(bounds.y / 10) * 10,
          props: {
            w: Math.ceil(bounds.w / 10) * 10 + 10,
            h: Math.ceil(bounds.h / 10) * 10 + 10,
            name: input.frame,
          },
        })
      }
      const container = parent?.id ?? frameId
      if (container) editor.reparentShapes(allIds, container)
      editor.sendToBack(lineIds)
    })

    const frame = allIds.length
      ? editor.getShape(allIds[0])?.parentId
      : undefined
    return {
      text: `Laid out ${input.items.length} piece(s)${input.sensors?.length ? ` and ${input.sensors.length} sensor(s)` : ""} on one ${line ?? "duct"} line.`,
      data: {
        ...(frame && frame !== page.id ? { frame } : {}),
        line: allIds[0],
        items: placed.map(({ ref, id }) => ({
          ...(ref ? { ref } : {}),
          ...describeSymbol(editor, editor.getShape(id) as SymbolShape),
        })),
      },
    }
  },
}

const checkLayout: AiBoardTool<{
  pageId?: string
  frameId?: string
  shapeIds?: string[]
}> = {
  name: "check_layout",
  title: "Check an HVAC layout",
  access: "read",
  description:
    "Checks HVAC symbols on a page, in a frame, or listed: equipment overlapping other equipment or text, ports with nothing connected, pieces sticking out of their frame (frames clip them), equipment off the 10 px grid, equipment with no live points bound (no behaviors), and repeated names. Run it after building, fix what it finds, and confirm with a screenshot.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      pageId: pageIdSchema,
      frameId: { type: "string" },
      shapeIds: { type: "array", maxItems: 500, items: { type: "string" } },
    },
  },
  run({ editor }, input) {
    let scope: TLShape[]
    if (input.shapeIds)
      scope = input.shapeIds.flatMap((id) => {
        const s = editor.getShape(id as TLShapeId)
        return s ? [s] : []
      })
    else if (input.frameId) {
      const frame = frameOrThrow(editor, input.frameId)
      scope = [...editor.getShapeAndDescendantIds([frame.id])].flatMap((id) => {
        const s = editor.getShape(id)
        return s ? [s] : []
      })
    } else {
      const pageId = input.pageId ?? editor.getCurrentPageId()
      scope = [...editor.getPageShapeIds(pageId as never)].flatMap((id) => {
        const s = editor.getShape(id)
        return s ? [s] : []
      })
    }
    const symbols = scope.filter(isSymbolShape)
    const equipment = symbols.filter((s) => !isLine(s.props.symbol))
    const lines = symbols.filter((s) => isLine(s.props.symbol))
    const texts = scope.filter((s) => s.type === "text" || s.type === "note")
    const bounds = new Map(
      scope.map((s) => [s.id, editor.getShapePageBounds(s.id)] as const)
    )

    const overlaps: string[] = []
    for (let i = 0; i < equipment.length; i++)
      for (let j = i + 1; j < equipment.length; j++) {
        const a = bounds.get(equipment[i].id)
        const b = bounds.get(equipment[j].id)
        if (!a || !b || !Box.Collides(a, b)) continue
        const x = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
        const y = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
        // Equipment boxes carry a 10 px margin; touching margins are fine.
        if (x > 16 && y > 16)
          overlaps.push(
            `${equipment[i].id} (${equipment[i].props.symbol}) and ${equipment[j].id} (${equipment[j].props.symbol})`
          )
      }
    for (const text of texts)
      for (const symbol of equipment) {
        const a = bounds.get(text.id)
        const b = bounds.get(symbol.id)
        if (
          a &&
          b &&
          Box.Collides(a.clone().expandBy(-4), b.clone().expandBy(-10))
        )
          overlaps.push(
            `text ${text.id} and ${symbol.id} (${symbol.props.symbol})`
          )
      }

    const lineBoxes = lines.flatMap((s) => {
      const b = bounds.get(s.id)
      return b ? [b.clone().expandBy(2)] : []
    })
    const allPorts = equipment.map((s) => ({
      shape: s,
      ports: pagePorts(editor, s),
    }))
    const unconnected: string[] = []
    for (const { shape, ports } of allPorts)
      for (const port of ports) {
        const onLine = lineBoxes.some((b) => b.containsPoint(port))
        const meetsPort = allPorts.some(
          (other) =>
            other.shape.id !== shape.id &&
            other.ports.some((p) => Math.hypot(p.x - port.x, p.y - port.y) <= 4)
        )
        if (!onLine && !meetsPort)
          unconnected.push(
            `${shape.id} (${shape.props.symbol}) port ${port.id} at (${port.x}, ${port.y})`
          )
      }

    // Lines follow the ports they join, so only equipment has to sit on the grid.
    const offGrid = equipment
      .filter((s) => {
        const b = bounds.get(s.id)
        if (!b) return false
        return (
          !(onGrid(b.minX) || onGrid(b.center.x)) ||
          !(onGrid(b.minY) || onGrid(b.center.y))
        )
      })
      .map((s) => `${s.id} (${s.props.symbol})`)

    const unbound = equipment
      .filter((s) => {
        const roles = manifestFor(s.props.symbol)?.roles.length ?? 0
        const behaviors = (s.meta as { behaviors?: unknown }).behaviors
        return roles > 0 && !(Array.isArray(behaviors) && behaviors.length)
      })
      .map((s) => `${s.id} (${s.props.symbol})`)

    // Frames clip what's inside them, so anything sticking out is partly hidden.
    const clipped = symbols
      .filter((s) => {
        const parent = editor.getShape(s.parentId as TLShapeId)
        if (parent?.type !== "frame") return false
        const box = bounds.get(s.id)
        const frame = editor.getShapePageBounds(parent.id)
        return box && frame && !frame.clone().expandBy(1).contains(box)
      })
      .map(
        (s) => `${s.id} (${s.props.symbol}) sticks out of frame ${s.parentId}`
      )

    const names = new Map<string, number>()
    for (const s of symbols) {
      const name = customShapeName(s)
      if (name) names.set(name, (names.get(name) ?? 0) + 1)
    }
    const duplicates = [...names].filter(([, n]) => n > 1).map(([name]) => name)

    const cap = (list: string[]) => list.slice(0, 40)
    const problems =
      overlaps.length + unconnected.length + clipped.length + duplicates.length
    return {
      text: problems
        ? `${problems} problem(s) to fix; ${unbound.length} piece(s) without live points, ${offGrid.length} off the grid.`
        : `No overlaps or loose ports. ${unbound.length} piece(s) without live points, ${offGrid.length} off the grid.`,
      data: {
        checked: { equipment: equipment.length, lines: lines.length },
        overlaps: cap(overlaps),
        unconnectedPorts: cap(unconnected),
        outsideFrame: cap(clipped),
        duplicateNames: duplicates,
        noLivePoints: cap(unbound),
        offGrid: cap(offGrid),
      },
    }
  },
}

export const hvacAi: AiContribution = {
  guide:
    "HVAC equipment for UI pages. list_symbols describes every piece (ports, states, point roles). place_run lays out an air or water path in one call; place_symbols and connect_ports handle branches, sensors and anything off the main line; check_layout finds overlaps and loose ports. Bind points with add_behavior using each role's behaviors.",
  tools: [
    listSymbols,
    placeSymbols,
    connectPorts,
    placeRun,
    checkLayout,
  ] as AiContribution["tools"],
  shapes: {
    [SYMBOL_TYPE]: (editor, shape) => {
      if (!isSymbolShape(shape)) return null
      const piece = getSymbol(shape.props.symbol)
      const changed = Object.fromEntries(
        Object.entries(DEFAULT_STATE).flatMap(([key, value]) =>
          shape.props[key as keyof SymbolState] !== value
            ? [[key, shape.props[key as keyof SymbolState]]]
            : []
        )
      )
      return {
        symbol: shape.props.symbol,
        ...(piece ? { title: piece.title } : {}),
        ...(shape.props.flipX ? { flipX: true } : {}),
        ...(shape.props.flipY ? { flipY: true } : {}),
        ...(Object.keys(changed).length ? { state: changed } : {}),
        ports: pagePorts(editor, shape).map(({ id, x, y, dir }) => ({
          id,
          x,
          y,
          dir,
        })),
        roles: manifestFor(shape.props.symbol)?.roles.map((r) => r.role) ?? [],
      }
    },
  },
}
