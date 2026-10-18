import { definePluginRoutes } from "@/sdk/server"

import { handleSctRequest } from "./api"

// SCT archive connections (SQL Server) live in this Node process. The archive API does
// its own routing, so one catch-all route hands it everything.
export default definePluginRoutes({
  "* /*rest": ({ request, path }) => handleSctRequest(request, path),
})
