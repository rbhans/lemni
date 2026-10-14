import { handleStationsRequest } from "@/plugins/niagara-baskstream/server/api"

// Station connections live in this Node process (the baskStream SDK is Node-only).
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ path?: string[] }> }

async function handle(request: Request, context: Context) {
  const { path } = await context.params
  return handleStationsRequest(request, path ?? [])
}

export const GET = handle
export const POST = handle
export const DELETE = handle
