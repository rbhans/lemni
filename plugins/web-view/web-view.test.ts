import assert from "node:assert/strict"
import { test } from "node:test"

import { normalizeAddress, siteLabel } from "./model.ts"

test("addresses: bare hosts get https, only web schemes load", () => {
  assert.deepEqual(normalizeAddress("10.0.0.20"), { url: "https://10.0.0.20/" })
  assert.deepEqual(normalizeAddress(" http://station.local:8080/ord "), {
    url: "http://station.local:8080/ord",
  })
  assert.ok("error" in normalizeAddress("javascript:alert(1)"))
  assert.ok("error" in normalizeAddress("file:///etc/passwd"))
  assert.ok("error" in normalizeAddress("data:text/html,hi"))
  assert.ok("error" in normalizeAddress(""))
  assert.ok("error" in normalizeAddress("https://"))
})

test("addresses: no saved passwords, and the board can't show itself", () => {
  assert.ok("error" in normalizeAddress("https://admin:secret@10.0.0.20/"))
  assert.ok(
    "error" in
      normalizeAddress("http://localhost:3000/", "http://localhost:3000")
  )
  assert.deepEqual(
    normalizeAddress("http://localhost:8080", "http://localhost:3000"),
    {
      url: "http://localhost:8080/",
    }
  )
  assert.equal(siteLabel("https://10.0.0.20:8443/ord?x"), "10.0.0.20:8443")
})

test("framing: the page's headers decide, the way browsers read them", async () => {
  const { framingVerdict } = await import("./framing.ts")
  const app = "http://localhost:3000"
  const site = "https://10.0.0.20/ord"
  const v = (xfo: string | null, csp: string | null) =>
    framingVerdict({ xFrameOptions: xfo, csp }, app, site).allowed
  assert.equal(v(null, null), true)
  assert.equal(v("DENY", null), false)
  assert.equal(v("SAMEORIGIN", null), false)
  assert.equal(v("ALLOW-FROM http://localhost:3000", null), true)
  assert.equal(v(null, "default-src 'self'; frame-ancestors 'self'"), false)
  assert.equal(v(null, "frame-ancestors 'none'"), false)
  assert.equal(v(null, "frame-ancestors http://localhost:3000"), true)
  assert.equal(v(null, "frame-ancestors http://localhost:*"), true)
  assert.equal(v(null, "frame-ancestors https://*.example.com"), false)
  assert.equal(v(null, "frame-ancestors *"), true)
  // frame-ancestors wins over X-Frame-Options when both are sent.
  assert.equal(v("DENY", "frame-ancestors *"), true)
  assert.equal(v(null, "script-src 'self'"), true)
  assert.match(
    framingVerdict({ xFrameOptions: "sameorigin", csp: null }, app, site)
      .reason ?? "",
    /SAMEORIGIN/
  )
})
