import { handleSctRequest } from "@/plugins/metasys-sct/server/api"

// SCT archive connections (SQL Server) live in this Node process.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ path?: string[] }> }

async function handle(request: Request, context: Context) {
  const { path } = await context.params
  return handleSctRequest(request, path ?? [])
}

export const GET = handle
export const POST = handle
export const DELETE = handle
