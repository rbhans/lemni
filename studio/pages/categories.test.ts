import assert from "node:assert/strict"
import { test } from "node:test"

import {
  categoryIdOf,
  customCategories,
  groupPages,
  kindOf,
  newCategoryId,
  nextPageName,
  type PageCategory,
} from "./categories.ts"

const page = (id: string, meta: Record<string, unknown> = {}) => ({
  id,
  name: id,
  meta,
})

const BUILT_IN: PageCategory[] = [
  { id: "ui", label: "UI", kind: "ui", order: 20 },
  { id: "documents", label: "Documents", kind: "documents", order: 10 },
  {
    id: "wiresheet",
    label: "Wire sheet",
    kind: "wiresheet",
    order: 90,
    single: true,
  },
]

test("pages without a category are UI pages", () => {
  assert.equal(categoryIdOf(page("a")), "ui")
  assert.equal(kindOf(page("a")), "ui")
  assert.equal(
    kindOf(page("b", { category: "documents", kind: "documents" })),
    "documents"
  )
  assert.equal(kindOf(page("c", { kind: "nonsense" })), "ui")
})

test("custom categories come from the board and can't be wire sheets", () => {
  const custom = customCategories({
    categories: [
      { id: "custom-commissioning", label: "Commissioning", kind: "documents" },
      { id: "x", label: "Bad", kind: "wiresheet" },
      { id: 4 },
      "nope",
    ],
  })
  assert.deepEqual(
    custom.map((c) => c.id),
    ["custom-commissioning"]
  )
  assert.equal(custom[0].custom, true)
  assert.deepEqual(customCategories({}), [])
})

test("pages group by category in order; unknown categories still show", () => {
  const groups = groupPages(
    [
      ...BUILT_IN,
      ...customCategories({
        categories: [{ id: "custom-a", label: "A", kind: "ui" }],
      }),
    ],
    [
      page("p1"),
      page("d1", { category: "documents", kind: "documents" }),
      page("p2", { category: "custom-a", kind: "ui" }),
      page("x1", { category: "from-a-plugin-that-is-off", kind: "documents" }),
    ]
  )
  assert.deepEqual(
    groups.map((g) => [g.id, g.pages.map((p) => p.id)]),
    [
      ["documents", ["d1"]],
      ["ui", ["p1"]],
      ["custom-a", ["p2"]],
      ["wiresheet", []],
      ["from-a-plugin-that-is-off", ["x1"]],
    ]
  )
  assert.equal(groups.at(-1)?.kind, "documents")
})

test("new category ids and page names don't collide", () => {
  assert.equal(newCategoryId("Floor plans!", []), "custom-floor-plans")
  assert.equal(
    newCategoryId("Floor plans", ["custom-floor-plans"]),
    "custom-floor-plans-2"
  )
  assert.equal(newCategoryId("!!!", []), "custom-category")
  assert.equal(nextPageName("UI", "ui", ["Page 1", "Page 2"]), "Page 3")
  assert.equal(nextPageName("Documents", "documents", []), "Documents")
  assert.equal(
    nextPageName("Documents", "documents", ["Documents"]),
    "Documents 2"
  )
})
