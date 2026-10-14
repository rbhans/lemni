// Document import: file kinds, CSV, and where uploads land on the page. Pure (no
// React, no DOM, relative imports only) so `node --test` can run it.

export type DocumentKind = "pdf" | "word" | "sheet" | "csv"

const BY_EXTENSION: Record<string, DocumentKind> = {
  pdf: "pdf",
  docx: "word",
  xlsx: "sheet",
  csv: "csv",
}

/** File-picker types for the documents this plugin opens. */
export const DOCUMENT_ACCEPT = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]

export function documentKind(file: { name: string; type: string }) {
  if (file.type === "application/pdf") return "pdf"
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  return BY_EXTENSION[extension] ?? null
}

/** "Controls set.pdf" → "Controls set". */
export const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || name

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF; trailing blank line dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Most rows and columns a sheet keeps on the board. */
export const SHEET_LIMITS = { rows: 2000, columns: 40 }

/** First row as headings, the rest as data (trimmed to the limits, ragged rows padded). */
export function sheetFromRows(rows: readonly (readonly unknown[])[]) {
  const text = (v: unknown) =>
    v === null || v === undefined
      ? ""
      : v instanceof Date
        ? v.toISOString().slice(0, 10)
        : String(v)
  const width = Math.min(
    Math.max(0, ...rows.map((r) => r.length)),
    SHEET_LIMITS.columns
  )
  const fit = (r: readonly unknown[]) =>
    Array.from({ length: width }, (_, i) => text(r[i]))
  const [head = [], ...body] = rows
  return {
    columns: fit(head).map((name, i) => name || `Column ${i + 1}`),
    rows: body.slice(0, SHEET_LIMITS.rows).map(fit),
    totalRows: body.length,
  }
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Places new items in a grid of cells (`cell` wide and tall, plus `gap`), left to
 * right in rows of `columns`, starting at `origin` and skipping cells taken by what's
 * already on the page.
 */
export function placeInGrid(
  occupied: readonly Rect[],
  count: number,
  origin: { x: number; y: number },
  cell: { w: number; h: number },
  columns = 4,
  gap = 40
): { x: number; y: number }[] {
  const taken = [...occupied]
  const out: { x: number; y: number }[] = []
  for (let slot = 0; out.length < count && slot < 10_000; slot++) {
    const x = origin.x + (slot % columns) * (cell.w + gap)
    const y = origin.y + Math.floor(slot / columns) * (cell.h + gap)
    const rect = { x, y, w: cell.w, h: cell.h }
    if (taken.some((r) => overlaps(r, rect))) continue
    out.push({ x, y })
    taken.push(rect)
  }
  return out
}
