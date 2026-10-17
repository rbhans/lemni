import assert from "node:assert/strict"
import { test } from "node:test"

import {
  boardNameFromFileName,
  fileNameForBoard,
  rememberRecent,
  UNTITLED_BOARD,
} from "../files/board-file.ts"
import { hasModifier, isTypingTarget, matchesKbd, parseKbd } from "./hotkeys.ts"

const key = (
  k: string,
  code: string,
  mods: Partial<Record<"meta" | "ctrl" | "shift" | "alt", boolean>> = {}
) => ({
  key: k,
  code,
  metaKey: Boolean(mods.meta),
  ctrlKey: Boolean(mods.ctrl),
  shiftKey: Boolean(mods.shift),
  altKey: Boolean(mods.alt),
})

test("shortcuts parse like the menus show them", () => {
  assert.deepEqual(parseKbd("cmd+shift+s"), [
    { key: "s", mod: true, shift: true, alt: false },
  ])
  assert.deepEqual(
    parseKbd("$!z,ctrl+y").map((c) => c.key),
    ["z", "y"]
  )
  assert.equal(parseKbd("shift++")[0].key, "+")
})

test("cmd is ⌘ on a Mac and Ctrl elsewhere; modifiers must match exactly", () => {
  assert.equal(
    matchesKbd(key("s", "KeyS", { meta: true }), "cmd+s", true),
    true
  )
  assert.equal(
    matchesKbd(key("s", "KeyS", { ctrl: true }), "cmd+s", false),
    true
  )
  assert.equal(
    matchesKbd(key("s", "KeyS", { ctrl: true }), "cmd+s", true),
    false
  )
  assert.equal(
    matchesKbd(key("S", "KeyS", { meta: true, shift: true }), "cmd+s", true),
    false
  )
  assert.equal(
    matchesKbd(
      key("S", "KeyS", { meta: true, shift: true }),
      "cmd+shift+s",
      true
    ),
    true
  )
})

test("shifted punctuation matches by physical key", () => {
  // "?" is shift+/ on most layouts.
  assert.equal(
    matchesKbd(key("?", "Slash", { shift: true }), "shift+/", true),
    true
  )
  assert.equal(matchesKbd(key("/", "Slash"), "shift+/", true), false)
  // Layouts where "?" comes from another key (or arrives without the shift flag).
  assert.equal(
    matchesKbd(key("?", "Minus", { shift: true }), "shift+/", true),
    true
  )
  assert.equal(matchesKbd(key("?", ""), "shift+/", true), true)
  assert.equal(
    matchesKbd(key("?", "Slash", { shift: true, meta: true }), "shift+/", true),
    false
  )
})

test("the comma key is spelled out, since a comma separates alternatives", () => {
  assert.deepEqual(parseKbd("cmd+comma"), [
    { key: ",", mod: true, shift: false, alt: false },
  ])
  assert.ok(matchesKbd(key(",", "Comma", { meta: true }), "cmd+comma", true))
})

test("typing targets and modifier shortcuts", () => {
  assert.equal(isTypingTarget(null), false)
  assert.equal(hasModifier("cmd+s"), true)
  assert.equal(hasModifier("shift+/"), false)
})

test("board file names", () => {
  assert.equal(
    boardNameFromFileName("AHU-1 graphics.lemscape"),
    "AHU-1 graphics"
  )
  assert.equal(boardNameFromFileName("AHU-1 graphics.lemni"), "AHU-1 graphics")
  assert.equal(boardNameFromFileName("plant.TLDR"), "plant")
  assert.equal(boardNameFromFileName(".lemscape"), UNTITLED_BOARD)
  assert.equal(boardNameFromFileName("Old plant.basboard"), "Old plant")
  assert.equal(fileNameForBoard("AHU/1: graphics?"), "AHU-1- graphics.lemscape")
  assert.equal(fileNameForBoard("   "), `${UNTITLED_BOARD}.lemscape`)
  assert.equal(fileNameForBoard("Plant.lemscape"), "Plant.lemscape")
  assert.equal(fileNameForBoard("Plant.lemni"), "Plant.lemscape")
  assert.equal(fileNameForBoard("Plant.basboard"), "Plant.lemscape")
})

test("recent boards move to the front and stay short", () => {
  const entry = (id: string, at: number) => ({
    id,
    name: id,
    openedAt: at,
    handle: null,
  })
  let list = [entry("a", 1), entry("b", 2)]
  list = rememberRecent(list, entry("b", 3))
  assert.deepEqual(
    list.map((e) => e.id),
    ["b", "a"]
  )
  for (let i = 0; i < 10; i++)
    list = rememberRecent(list, entry(`n${i}`, 10 + i), 4)
  assert.equal(list.length, 4)
  assert.equal(list[0].id, "n9")
})

test("palette matching is word-aware, not letter soup", async () => {
  const { scoreEntry } = await import("./palette-score.ts")
  assert.equal(scoreEntry("Bring to front", ["Arrange"], "fan"), 0)
  assert.equal(
    scoreEntry(
      "Turn live effects on or off",
      ["Behaviors", "animation"],
      "fan"
    ),
    0
  )
  assert.ok(scoreEntry("Centrifugal fan", ["Air side"], "fan") > 0.8)
  assert.ok(
    scoreEntry("Insert Plug fan", ["HVAC"], "plug") >
      scoreEntry("Insert Plug fan", ["HVAC"], "hvac")
  )
  assert.equal(scoreEntry("Save as…", ["File"], "save"), 1)
  assert.ok(scoreEntry("Show Library", ["panel"], "panel lib") > 0)
})
