"use client"

import { Table01Icon } from "@hugeicons/core-free-icons"

import type { PastedText, TextImporterContribution } from "@/sdk"

import { addSheet } from "./import"
import { tableFromTabbed } from "./model"

/** Rows of the first HTML table, for tables whose plain text didn't come tab-separated. */
function htmlTable(html: string): string[][] | null {
  if (!/<table[\s>]/i.test(html)) return null
  const table = new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector("table")
  if (!table) return null
  const rows = [...table.querySelectorAll("tr")]
    .map((tr) =>
      [...tr.querySelectorAll("th, td")].map((cell) =>
        (cell.textContent ?? "").replace(/\s+/g, " ").trim()
      )
    )
    .filter((row) => row.length)
  return rows.length >= 2 && Math.max(...rows.map((row) => row.length)) >= 2
    ? rows
    : null
}

/** The table in pasted text: tab-separated rows, else an HTML table. */
export function pastedTable(content: PastedText): string[][] | null {
  if (content.url) return null
  return (
    tableFromTabbed(content.text) ??
    (content.html ? htmlTable(content.html) : null)
  )
}

/** Rows copied from a spreadsheet or a web page become a table card, not a run of text. */
export const tablePaste: TextImporterContribution = {
  id: "table",
  order: 10,
  label: "Table",
  icon: Table01Icon,
  accepts: (content) => pastedTable(content) !== null,
  suggested: () => true,
  import: ({ editor }, content, at) => {
    const rows = pastedTable(content)
    if (rows) addSheet(editor, "Pasted table", rows, at)
  },
}
