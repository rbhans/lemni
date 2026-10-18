import { definePluginRoutes } from "@/sdk/server"

import { checkFraming } from "./check"

export default definePluginRoutes({
  /** ?url=… → whether the page will show inside a web view on this board. */
  "GET /check": async ({ request, query }) => {
    const address = query.get("url")
    if (!address)
      return Response.json({ error: "Missing url." }, { status: 400 })
    return Response.json(
      await checkFraming(address, new URL(request.url).origin)
    )
  },
})
