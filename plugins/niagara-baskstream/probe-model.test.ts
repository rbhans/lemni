import assert from "node:assert/strict"
import { test } from "node:test"

import {
  looksLikeStationUrl,
  sameStation,
  stationVerdict,
  type ProbeAnswer,
} from "./probe-model.ts"

const answer = (
  status: number,
  body = "",
  headers: Record<string, string> = {}
): ProbeAnswer => ({ status, body, headers })

test("a Niagara server header or baskStream's health answer is certain", () => {
  const byHeader = stationVerdict({
    prelogin: answer(200, "<html></html>", {
      server: "Niagara Web Server/4.14.0.162",
    }),
    health: answer(302, "", { location: "/prelogin" }),
  })
  assert.equal(byHeader?.confidence, "certain")
  assert.ok(byHeader?.signs.includes("Niagara Web Server/4.14.0.162"))

  const byHealth = stationVerdict({
    prelogin: answer(200),
    health: answer(200, JSON.stringify({ ok: true, apiVersion: "1.7" })),
  })
  assert.equal(byHealth?.confidence, "certain")
  assert.deepEqual(byHealth?.signs, ["baskStream API 1.7"])
})

test("a Niagara sign-in page, or a sign-in redirect at /stream, is likely", () => {
  const page = stationVerdict({
    prelogin: answer(200, '<form><input name="j_username"></form>'),
    health: null,
  })
  assert.equal(page?.confidence, "likely")
  assert.deepEqual(page?.signs, ["Niagara sign-in page"])

  // The simulated station: a bare page at /prelogin, /stream/health sends you there.
  const simulated = stationVerdict({
    prelogin: answer(200, "<html>login</html>"),
    health: answer(302, "", { location: "/prelogin" }),
  })
  assert.equal(simulated?.confidence, "likely")
})

test("other web servers aren't stations", () => {
  // A site that answers every path with its home page.
  assert.equal(
    stationVerdict({
      prelogin: answer(200, "<html>Welcome</html>"),
      health: answer(200, "<html>Welcome</html>"),
    }),
    null
  )
  // A login redirect, but no sign-in page.
  assert.equal(
    stationVerdict({
      prelogin: answer(404),
      health: answer(302, "", { location: "https://idp.example.com/login" }),
    }),
    null
  )
  assert.equal(stationVerdict({ prelogin: null, health: null }), null)
})

test("pasted links that may be a station's", () => {
  assert.ok(looksLikeStationUrl(new URL("https://10.0.0.20/")))
  assert.ok(looksLikeStationUrl(new URL("https://jace.local/")))
  assert.ok(
    looksLikeStationUrl(
      new URL("https://bms.example.com/ord?station:%7Cslot:/")
    )
  )
  assert.ok(looksLikeStationUrl(new URL("https://bms.example.com/prelogin")))
  assert.equal(looksLikeStationUrl(new URL("https://example.com/docs")), false)
})

test("sameStation compares origins", () => {
  assert.ok(sameStation("https://10.0.0.20", "https://10.0.0.20/prelogin"))
  assert.equal(sameStation("https://10.0.0.20", "http://10.0.0.20"), false)
  assert.equal(sameStation("not a url", "https://10.0.0.20"), false)
})
