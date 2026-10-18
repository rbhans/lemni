import { definePluginRoutes, PluginRouteError } from "@/sdk/server"

import { handleStationsRequest } from "./api"
import { probeStation } from "./probe"

// Station connections live in this Node process (the baskStream SDK is Node-only).
// The station API does its own routing, so one catch-all route hands it everything
// but the Connect… check.
export default definePluginRoutes({
  /** ?address=… → whether a Niagara station answers there (signed out, no login sent). */
  "GET /probe": async ({ query, request }) => {
    const address = query.get("address")
    if (!address) throw new PluginRouteError(400, "Send an address.")
    return Response.json(await probeStation(address, request.signal))
  },
  "* /*rest": ({ request, path }) => handleStationsRequest(request, path),
})
