"use client"

import { toast } from "sonner"
import {
  AssetRecordType,
  createShapeId,
  type Editor,
  type TLShapeId,
  type TLShapePartial,
  type VecLike,
} from "tldraw"

import { BAR_H, DOC_TYPE, type DocShape } from "./doc-shape"
import {
  baseName,
  documentKind,
  parseCsv,
  placeInGrid,
  sheetFromRows,
  SHEET_LIMITS,
} from "./model"
import { pdfInfo } from "./pdf"
import { SHEET_TYPE, type SheetShape } from "./sheet-shape"
import { wordDocument } from "./word"

/** The file is kept inside the board; past this the board file gets unwieldy. */
const MAX_FILE_BYTES = 100 * 1024 * 1024

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

/** Stores the original file as a board asset (so the board travels as one file). */
async function storeFile(editor: Editor, file: File) {
  const id = AssetRecordType.createId()
  editor.createAssets([
    {
      id,
      typeName: "asset",
      type: "image",
      props: {
        name: file.name,
        src: await readDataUrl(file),
        w: 0,
        h: 0,
        mimeType: file.type || "application/octet-stream",
        isAnimated: false,
        fileSize: file.size,
      },
      meta: { document: true },
    },
  ])
  return id
}

type Partial = TLShapePartial<DocShape> | TLShapePartial<SheetShape>

/** A sheet card for rows (headings first), or null when there are no columns. */
function sheetPartial(
  title: string,
  rows: readonly (readonly unknown[])[]
): TLShapePartial<SheetShape> | null {
  const sheet = sheetFromRows(rows)
  if (!sheet.columns.length) return null
  return {
    id: createShapeId(),
    type: SHEET_TYPE,
    props: {
      w: Math.min(Math.max(320, sheet.columns.length * 110), 900),
      h: 360,
      title,
      ...sheet,
    },
  }
}

/** Adds one sheet card centered at `at` (rows pasted from a spreadsheet, say). */
export function addSheet(
  editor: Editor,
  title: string,
  rows: readonly (readonly unknown[])[],
  at: VecLike
) {
  const partial = sheetPartial(title, rows)
  if (!partial) return
  const { w = 560, h = 360 } = partial.props ?? {}
  editor.markHistoryStoppingPoint("add table")
  editor.createShape({ ...partial, x: at.x - w / 2, y: at.y - h / 2 })
  editor.select(partial.id)
  if ((partial.props?.totalRows ?? 0) > SHEET_LIMITS.rows)
    toast.info(`Large sheets keep their first ${SHEET_LIMITS.rows} rows.`)
}

/** A CSV's or spreadsheet's tables (one per sheet), rows as read; none for other files. */
export async function readTables(
  file: File
): Promise<{ title: string; rows: unknown[][] }[]> {
  const kind = documentKind(file)
  const name = baseName(file.name)
  if (kind === "csv")
    return [{ title: name, rows: parseCsv(await file.text()) }]
  if (kind !== "sheet") return []
  const sheets = await (await import("read-excel-file/browser")).default(file)
  return sheets.map((sheet, _i, all) => ({
    title: all.length > 1 ? `${name} · ${sheet.sheet}` : name,
    rows: sheet.data as unknown[][],
  }))
}

async function shapesFor(editor: Editor, file: File): Promise<Partial[]> {
  const kind = documentKind(file)
  const name = baseName(file.name)
  if (kind === "pdf") {
    const info = await pdfInfo(await file.arrayBuffer())
    const assetId = await storeFile(editor, file)
    const w = 420
    return [
      {
        id: createShapeId(),
        type: DOC_TYPE,
        props: {
          w,
          h: Math.round(w / info.aspect) + BAR_H,
          assetId,
          name,
          kind: "pdf",
          pageCount: info.pages,
          page: 1,
          sections: [],
        },
      },
    ]
  }
  if (kind === "word") {
    const assetId = await storeFile(editor, file)
    const bytes = await file.arrayBuffer()
    const doc = await wordDocument(assetId, async () => bytes)
    return [
      {
        id: createShapeId(),
        type: DOC_TYPE,
        props: {
          w: 420,
          h: 560,
          assetId,
          name,
          kind: "word",
          pageCount: doc.sections.length,
          page: 1,
          sections: doc.sections,
        },
      },
    ]
  }
  const tables = await readTables(file)
  return tables.flatMap(({ title, rows }) => {
    const partial = sheetPartial(title, rows)
    return partial ? [partial] : []
  })
}

/**
 * Adds documents to the current page: each file becomes a card (PDF, Word) or one
 * table per sheet (spreadsheets, CSV), laid out in a grid around what's there.
 */
export async function importDocuments(
  editor: Editor,
  files: File[],
  point?: VecLike
) {
  const tooBig = files.filter((file) => file.size > MAX_FILE_BYTES)
  for (const file of tooBig)
    toast.error(`${file.name} is too large to keep in the board`, {
      description: "Files up to 100 MB can be added for now.",
    })
  const usable = files.filter((file) => file.size <= MAX_FILE_BYTES)
  if (!usable.length) return

  const loading = toast.loading(
    usable.length === 1
      ? `Opening ${usable[0].name}…`
      : `Opening ${usable.length} files…`
  )
  const partials: Partial[] = []
  const failed: string[] = []
  let trimmed = false
  for (const file of usable) {
    try {
      const made = await shapesFor(editor, file)
      for (const shape of made)
        if (
          shape.type === SHEET_TYPE &&
          (shape.props?.totalRows ?? 0) > SHEET_LIMITS.rows
        )
          trimmed = true
      partials.push(...made)
    } catch (error) {
      console.error(error)
      failed.push(file.name)
    }
  }
  toast.dismiss(loading)
  if (failed.length)
    toast.error(`Couldn't open ${failed.join(", ")}`, {
      description: "The file may be damaged or in an older format.",
    })
  if (trimmed)
    toast.info(`Large sheets keep their first ${SHEET_LIMITS.rows} rows.`)
  if (!partials.length) return

  // A grid of equal cells, starting where the files were dropped (or the view's corner).
  const cell = {
    w: Math.max(...partials.map((p) => p.props?.w ?? 420)),
    h: Math.max(...partials.map((p) => p.props?.h ?? 560)),
  }
  const view = editor.getViewportPageBounds()
  const origin = point
    ? { x: point.x - cell.w / 2, y: point.y - cell.h / 2 }
    : { x: view.x + 40, y: view.y + 40 }
  const occupied = [...editor.getCurrentPageShapeIds()].flatMap((id) => {
    const bounds = editor.getShapePageBounds(id)
    return bounds
      ? [{ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }]
      : []
  })
  const spots = placeInGrid(occupied, partials.length, origin, cell)

  editor.markHistoryStoppingPoint("add documents")
  editor.createShapes(
    partials.map((partial, i) => ({ ...partial, ...spots[i] }))
  )
  const ids = partials.map((p) => p.id as TLShapeId)
  editor.select(...ids)
  editor.zoomToSelection({ animation: { duration: 220 } })
}
