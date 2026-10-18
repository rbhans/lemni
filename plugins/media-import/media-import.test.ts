import assert from "node:assert/strict"
import { test } from "node:test"

import {
  baseName,
  documentKind,
  parseCsv,
  placeInGrid,
  sheetFromRows,
  SHEET_LIMITS,
  sniffDelimiter,
  tableFromTabbed,
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

test("the separator is worked out: semicolons and tabs too", () => {
  assert.equal(sniffDelimiter("a,b,c\n1;2;3"), ",")
  assert.equal(sniffDelimiter("Name;Value;Units\nDA-T;55,2;°F"), ";")
  assert.equal(sniffDelimiter("Name\tValue\n"), "\t")
  assert.equal(sniffDelimiter('"a;b",c\n'), ",")
  assert.deepEqual(parseCsv("Name;Value\nDA-T;55,2\n"), [
    ["Name", "Value"],
    ["DA-T", "55,2"],
  ])
  assert.equal(documentKind({ name: "points.tsv", type: "" }), "csv")
})

test("rows copied from a spreadsheet are a table; prose isn't", () => {
  assert.deepEqual(tableFromTabbed("Point\tValue\nDA-T\t55\nRA-T\t72\n"), [
    ["Point", "Value"],
    ["DA-T", "55"],
    ["RA-T", "72"],
  ])
  // Empty cells at the end of a row stay cells.
  assert.deepEqual(tableFromTabbed("a\tb\tc\r\n1\t\t\r\n"), [
    ["a", "b", "c"],
    ["1", "", ""],
  ])
  assert.equal(tableFromTabbed("Just a sentence."), null)
  assert.equal(tableFromTabbed("One\trow only"), null)
  assert.equal(
    tableFromTabbed("A paragraph\twith a tab\nand two more lines\nof prose\n"),
    null
  )
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
