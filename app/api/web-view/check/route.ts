import { checkFraming } from "@/plugins/web-view/server/check"
import { guardRequest } from "@/server/request-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET ?url=… → whether the page will show inside a web view on this board. */
export async function GET(request: Request) {
  const denied = guardRequest(request)
  if (denied) return denied
  const url = new URL(request.url)
  const address = url.searchParams.get("url")
  if (!address) return Response.json({ error: "Missing url." }, { status: 400 })
  return Response.json(await checkFraming(address, url.origin))
}
