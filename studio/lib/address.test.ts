import assert from "node:assert/strict"
import { test } from "node:test"

import { isPrivateHost, parseAddress } from "./address.ts"

test("parseAddress takes a bare host, a host and port, or a full address", () => {
  const bare = parseAddress(" 10.0.0.20 ")
  assert.ok(bare.ok)
  assert.equal(bare.host, "10.0.0.20")
  assert.equal(bare.scheme, null)
  assert.equal(bare.url.origin, "https://10.0.0.20")

  const port = parseAddress("station.local:8443")
  assert.ok(port.ok)
  assert.equal(port.hostPort, "station.local:8443")
  assert.equal(port.scheme, null)

  const full = parseAddress("http://127.0.0.1:8710/ord?station:%7Cslot:/")
  assert.ok(full.ok)
  assert.equal(full.scheme, "http")
  assert.equal(full.url.origin, "http://127.0.0.1:8710")
})

test("parseAddress refuses other schemes, logins and junk", () => {
  for (const input of ["", "   ", "ftp://host", "javascript://x", "http://"]) {
    const parsed = parseAddress(input)
    assert.equal(parsed.ok, false, input)
  }
  const login = parseAddress("https://admin:secret@10.0.0.20")
  assert.equal(login.ok, false)
  assert.match(!login.ok ? login.error : "", /login/)
  assert.equal(parseAddress("x".repeat(600)).ok, false)
})

test("isPrivateHost knows local and private networks", () => {
  for (const host of [
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "127.0.0.1",
    "169.254.10.1",
    "localhost",
    "jace-01",
    "station.local",
    "bms.lan",
    "[::1]",
    "fd12:3456::1",
    "fe80::1",
  ])
    assert.equal(isPrivateHost(host), true, host)
  for (const host of [
    "8.8.8.8",
    "172.32.0.1",
    "192.169.0.1",
    "example.com",
    "station.example.org",
    "2001:db8::1",
    "",
  ])
    assert.equal(isPrivateHost(host), false, host)
})
