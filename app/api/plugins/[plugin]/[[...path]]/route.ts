import { handlePluginRequest } from "@/server/plugin-dispatch"

// Every plugin's server routes (plugins/<id>/server/routes.ts), behind the request
// guard. Plugins run in this Node process (station SDKs, SQL clients and so on).
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ plugin: string; path?: string[] }> }

async function handle(request: Request, context: Context) {
  const { plugin, path } = await context.params
  return handlePluginRequest(request, plugin, path ?? [])
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
