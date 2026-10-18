import { definePluginRoutes } from "@/sdk/server"

import { handleBridgeRequest, handleSetupRequest } from "./board-api"

// The board tab's side of the AI connection. (AI apps themselves connect to /api/mcp,
// which keeps its own route: they authenticate with a token, not as this browser.)
export default definePluginRoutes({
  /** The open board tab listens here for tool calls, and posts their results. */
  "GET /bridge": ({ request }) => handleBridgeRequest(request),
  "POST /bridge": ({ request }) => handleBridgeRequest(request),
  /** Connect details for the AI panel; POST makes a new token. */
  "GET /setup": ({ request }) => handleSetupRequest(request),
  "POST /setup": ({ request }) => handleSetupRequest(request),
})
