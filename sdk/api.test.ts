import assert from "node:assert/strict"
import { test } from "node:test"

import { pluginApiUrl } from "./api.ts"

test("plugin route addresses", () => {
  assert.equal(pluginApiUrl("trend-alerts"), "/api/plugins/trend-alerts")
  assert.equal(
    pluginApiUrl("trend-alerts", "/sites"),
    "/api/plugins/trend-alerts/sites"
  )
  assert.equal(
    pluginApiUrl("trend-alerts", "sites/1"),
    "/api/plugins/trend-alerts/sites/1"
  )
  assert.equal(
    pluginApiUrl("trend-alerts", "?q=1"),
    "/api/plugins/trend-alerts?q=1"
  )
})
