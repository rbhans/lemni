import assert from "node:assert/strict"
import { test } from "node:test"

import {
  DEFAULT_STATE,
  getSymbol,
  PIECES,
  resolveState,
  searchTermsFor,
  SHARED_CSS,
  stateOptionsFor,
  stretchLength,
  symbolClasses,
  symbolMarkup,
  symbolVars,
} from "./library.ts"

test("every piece is scoped, unique and template-complete", () => {
  assert.ok(PIECES.length >= 30)
  assert.equal(new Set(PIECES.map((p) => p.id)).size, PIECES.length)
  assert.equal(new Set(PIECES.map((p) => p.scope)).size, PIECES.length)
  for (const piece of PIECES) {
    // No rule may escape the piece's own root class.
    assert.doesNotMatch(piece.css, /\.nx(?![\w-])/, piece.id)
    for (const rule of piece.css
      .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "")
      .split("}")) {
      const selector = rule
        .split("{")[0]
        .replace(/^@media[^{]*/, "")
        .trim()
      if (selector)
        for (const s of selector.split(","))
          assert.ok(s.trim().startsWith(`.${piece.scope}`), `${piece.id}: ${s}`)
    }
    // Keyframes are renamed per piece so identical names can't collide.
    for (const [, name] of piece.css.matchAll(/@keyframes\s+([\w-]+)/g))
      assert.ok(name.endsWith(`--${piece.scope.slice(3)}`), name)
    const markup = symbolMarkup(piece, { length: 250, text: "CO2" })
    assert.doesNotMatch(markup, /\{L\}|\{TEXT\}/, piece.id)
    assert.ok(piece.width > 0 && piece.height > 0)
  }
})

test("runs stretch without scaling their thickness", () => {
  const pipe = getSymbol("water/pipe")!
  assert.equal(pipe.stretch, "x")
  assert.equal(stretchLength(pipe, 400, 10), 400)
  assert.equal(stretchLength(pipe, 400, 20), 200)
  assert.match(symbolMarkup(pipe, { length: 400 }), /width="400"/)
  assert.equal(getSymbol("air/fan-centrifugal")!.stretch, undefined)
})

test("state becomes classes and variables the piece understands", () => {
  const fan = getSymbol("air/fan-centrifugal")!
  const on = { ...DEFAULT_STATE, on: true, ccw: true, flow: true }
  // `flow` is ignored: fans don't have it.
  assert.equal(
    symbolClasses(fan, on, { dark: true, flipX: true }),
    `bas-symbol ${fan.scope} dk on ccw fx`
  )
  assert.deepEqual(symbolVars(fan, on), {})

  const damper = getSymbol("air/damper")!
  assert.deepEqual(symbolVars(damper, { ...DEFAULT_STATE, position: 100 }), {
    "--blade": "0deg",
  })
  assert.deepEqual(symbolVars(damper, { ...DEFAULT_STATE, position: 0 }), {
    "--blade": "90deg",
  })
  assert.deepEqual(
    symbolVars(getSymbol("water/tank")!, { ...DEFAULT_STATE, level: 150 }),
    { "--level": "1" }
  )
  assert.deepEqual(
    stateOptionsFor(damper).map((s) => s.key),
    ["on", "position"]
  )
})

test("runtime overrides win, but only with the right types", () => {
  const saved = { ...DEFAULT_STATE, on: true, level: 40 }
  assert.equal(resolveState(saved, null), saved)
  assert.deepEqual(
    resolveState(saved, {
      on: false,
      level: 80,
      text: 1,
      sash: "x" as unknown as number,
    }),
    {
      ...saved,
      on: false,
      level: 80,
    }
  )
})

test("sensor text is escaped and defaults to the piece's letter", () => {
  const sensor = getSymbol("shared/sensor")!
  assert.equal(sensor.text, "T")
  assert.match(symbolMarkup(sensor), />T<\/text>/)
  assert.match(symbolMarkup(sensor, { text: "<P>" }), />&lt;P&gt;<\/text>/)
  assert.ok(searchTermsFor(sensor).includes("temperature"))
})

test("symbols reset inherited SVG styles so they draw as they do standalone", () => {
  // tldraw's containers set round caps; the plug fan's dashed blades depend on butt caps.
  assert.match(SHARED_CSS, /\.bas-symbol\{[^}]*stroke-linecap:butt/)
  assert.match(SHARED_CSS, /\.bas-symbol\{[^}]*stroke-linejoin:miter/)
  assert.match(getSymbol("air/fan-plug")!.css, /stroke-dasharray:2 5/)
})
