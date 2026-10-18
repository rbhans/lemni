// Document import: file kinds, CSV, and where uploads land on the page. Pure (no
// React, no DOM, relative imports only) so `node --test` can run it.

export type DocumentKind = "pdf" | "word" | "sheet" | "csv"

const BY_EXTENSION: Record<string, DocumentKind> = {
  pdf: "pdf",
  docx: "word",
  xlsx: "sheet",
  csv: "csv",
  // Tab-separated files read like CSV (the separator is worked out from the text).
  tsv: "csv",
}

/** File-picker types for the documents this plugin opens. */
export const DOCUMENT_ACCEPT = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".csv",
  ".tsv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/tab-separated-values",
]

export function documentKind(file: { name: string; type: string }) {
  if (file.type === "application/pdf") return "pdf"
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
  return BY_EXTENSION[extension] ?? null
}

/** "Controls set.pdf" → "Controls set". */
export const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || name

/**
 * The separator a delimited file uses: whichever of comma, semicolon (Excel in many
 * European locales) or tab is most common in its first line, outside quotes.
 */
export function sniffDelimiter(text: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 }
  let quoted = false
  for (const c of text) {
    if (c === '"') quoted = !quoted
    else if (!quoted && (c === "\n" || c === "\r")) break
    else if (!quoted && c in counts) counts[c as keyof typeof counts]++
  }
  if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) return "\t"
  return counts[";"] > counts[","] ? ";" : ","
}

/**
 * RFC 4180 delimited text: quoted fields, doubled quotes, CRLF or LF; trailing blank
 * line dropped. The separator is a comma unless given.
 */
export function parseDelimited(text: string, delimiter = ","): string[][] {
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
    else if (c === delimiter) {
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

/** A CSV (or TSV, or semicolon-separated) file's rows. */
export function parseCsv(text: string): string[][] {
  return parseDelimited(text, sniffDelimiter(text))
}

/**
 * Rows copied from a spreadsheet or a web page's table: tab-separated, at least two
 * rows and two columns, most rows as wide as the widest. Null for other text, so
 * prose with a stray tab stays text.
 */
export function tableFromTabbed(text: string): string[][] | null {
  if (!text.includes("\t")) return null
  const rows = parseDelimited(text.replace(/[\r\n]+$/, ""), "\t")
  if (rows.length < 2) return null
  const width = Math.max(...rows.map((row) => row.length))
  if (width < 2) return null
  const full = rows.filter((row) => row.length === width).length
  return full >= Math.max(2, rows.length * 0.6) ? rows : null
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
