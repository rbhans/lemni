import assert from "node:assert/strict"
import { test } from "node:test"

import {
  baseName,
  documentKind,
  parseCsv,
  placeInGrid,
  sheetFromRows,
  SHEET_LIMITS,
} from "./model.ts"

test("document kinds come from the type or the extension", () => {
  assert.equal(documentKind({ name: "set.PDF", type: "" }), "pdf")
  assert.equal(documentKind({ name: "x", type: "application/pdf" }), "pdf")
  assert.equal(documentKind({ name: "Spec.docx", type: "" }), "word")
  assert.equal(documentKind({ name: "points.xlsx", type: "" }), "sheet")
  assert.equal(documentKind({ name: "trend.csv", type: "text/csv" }), "csv")
  assert.equal(documentKind({ name: "plan.png", type: "image/png" }), null)
  assert.equal(baseName("M-601 controls.pdf"), "M-601 controls")
})

test("CSV handles quotes, commas and both line endings", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\n3,\n'), [
    ["a", "b"],
    ["x, y", 'say "hi"'],
    ["3", ""],
  ])
  assert.deepEqual(parseCsv('one\n"multi\nline"'), [["one"], ["multi\nline"]])
})

test("sheets take headings from the first row and stay within limits", () => {
  const sheet = sheetFromRows([
    ["Tag", null, "Value"],
    ["AHU-1", "x"],
    ["AHU-2", "y", 3, "extra"],
  ])
  assert.deepEqual(sheet.columns, ["Tag", "Column 2", "Value", "Column 4"])
  assert.deepEqual(sheet.rows[0], ["AHU-1", "x", "", ""])
  const big = sheetFromRows([
    ["h"],
    ...Array.from({ length: 2500 }, (_, i) => [i]),
  ])
  assert.equal(big.rows.length, SHEET_LIMITS.rows)
  assert.equal(big.totalRows, 2500)
})

test("uploads fill a grid around what's already there", () => {
  const cell = { w: 100, h: 100 }
  const spots = placeInGrid(
    [{ x: 0, y: 0, w: 100, h: 100 }],
    3,
    { x: 0, y: 0 },
    cell,
    2,
    10
  )
  assert.deepEqual(spots, [
    { x: 110, y: 0 },
    { x: 0, y: 110 },
    { x: 110, y: 110 },
  ])
})
