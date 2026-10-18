import assert from "node:assert/strict"
import { test } from "node:test"

import { compileRoutes, matchRoute } from "./plugin-routes.ts"

const ok = () => new Response("ok")

test("routes match by method and path, first match in order", () => {
  const routes = compileRoutes("demo", {
    "GET /": ok,
    "GET /sites": ok,
    "GET /sites/:id": ok,
    "POST /sites": ok,
    "DELETE /sites/:id": ok,
    "* /files/*rest": ok,
  })
  const found = (method: string, path: string[]) => {
    const match = matchRoute(routes, method, path)
    return match.kind === "found" ? [match.route.key, match.params] : match
  }
  assert.deepEqual(found("GET", []), ["GET /", {}])
  assert.deepEqual(found("GET", ["sites"]), ["GET /sites", {}])
  assert.deepEqual(found("GET", ["sites", "a1"]), [
    "GET /sites/:id",
    { id: "a1" },
  ])
  assert.deepEqual(found("DELETE", ["sites", "a1"]), [
    "DELETE /sites/:id",
    { id: "a1" },
  ])
  assert.deepEqual(found("PUT", ["files", "a", "b.pdf"]), [
    "* /files/*rest",
    { rest: "a/b.pdf" },
  ])
  assert.deepEqual(found("GET", ["files"]), ["* /files/*rest", { rest: "" }])
})

test("a known path with the wrong method lists what's allowed; unknown paths miss", () => {
  const routes = compileRoutes("demo", { "GET /sites": ok, "POST /sites": ok })
  assert.deepEqual(matchRoute(routes, "PATCH", ["sites"]), {
    kind: "method",
    allow: ["GET", "POST"],
  })
  assert.deepEqual(matchRoute(routes, "GET", ["nope"]), { kind: "none" })
  assert.deepEqual(matchRoute(routes, "GET", ["sites", "extra"]), {
    kind: "none",
  })
})

test("bad route keys fail with a sentence naming the route", () => {
  const bad = (key: string) => () => compileRoutes("demo", { [key]: ok })
  assert.throws(bad("FETCH /x"), /route "FETCH \/x": the method must be/)
  assert.throws(bad("GET x"), /must start with "\/"/)
  assert.throws(bad("GET /x extra"), /METHOD \/path/)
  assert.throws(bad("GET /*rest/more"), /must be the last segment/)
  assert.throws(bad("GET /:1d"), /isn't a valid name/)
})
