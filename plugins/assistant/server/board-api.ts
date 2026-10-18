import "server-only"

import { TOOL_NAME } from "@/sdk/server"

import {
  DEFAULT_TIMEOUT_MS,
  isAccessLevel,
  type AiToolInfo,
  type AiToolOutput,
  type BridgeEvent,
} from "../protocol"

import { getAiBridge } from "./bridge"
import { mcpToken, rotateMcpToken, tokenFromEnv } from "./token"

// The board tab's side of the bridge (same-origin only): a server-sent event stream of
// tool calls, and POSTs for what the board offers, results and focus. Plus the setup
// details the AI panel shows (the connect command carries the token).

const json = (data: unknown, status = 200) => Response.json(data, { status })
const TAB_ID = /^[\w-]{8,64}$/

function parseTools(value: unknown): AiToolInfo[] | null {
  if (!Array.isArray(value) || value.length > 400) return null
  const tools: AiToolInfo[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null
    const t = raw as Record<string, unknown>
    if (
      typeof t.name !== "string" ||
      !TOOL_NAME.test(t.name) ||
      typeof t.title !== "string" ||
      typeof t.description !== "string" ||
      !t.inputSchema ||
      typeof t.inputSchema !== "object" ||
      !["read", "edit", "write"].includes(t.access as string)
    )
      return null
    tools.push({
      name: t.name,
      title: t.title.slice(0, 120),
      description: t.description.slice(0, 4000),
      inputSchema: t.inputSchema as AiToolInfo["inputSchema"],
      access: t.access as AiToolInfo["access"],
      timeoutMs:
        typeof t.timeoutMs === "number" && t.timeoutMs > 0
          ? Math.min(t.timeoutMs, 10 * 60_000)
          : DEFAULT_TIMEOUT_MS,
      plugin: typeof t.plugin === "string" ? t.plugin.slice(0, 80) : "",
    })
  }
  return tools
}

function parseOutput(value: unknown): AiToolOutput | null {
  if (!value || typeof value !== "object") return null
  const { content, isError } = value as Record<string, unknown>
  if (!Array.isArray(content) || content.length > 40) return null
  for (const item of content) {
    if (!item || typeof item !== "object") return null
    const c = item as Record<string, unknown>
    if (c.type === "text" && typeof c.text === "string") continue
    if (
      c.type === "image" &&
      typeof c.data === "string" &&
      typeof c.mimeType === "string" &&
      /^image\/(png|jpeg|webp)$/.test(c.mimeType)
    )
      continue
    return null
  }
  return {
    content: content as AiToolOutput["content"],
    isError: isError === true,
  }
}

function events(request: Request, tab: string): Response {
  const encoder = new TextEncoder()
  let cleanup = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const write = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text))
      }
      const close = getAiBridge().openTab(tab, (event: BridgeEvent) =>
        write(`data: ${JSON.stringify(event)}\n\n`)
      )
      const heartbeat = setInterval(() => write(": keep-alive\n\n"), 15_000)
      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        close()
        try {
          controller.close()
        } catch {
          // Already closed by the browser.
        }
      }
      request.signal.addEventListener("abort", cleanup)
    },
    cancel() {
      cleanup()
    },
  })
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

export async function handleBridgeRequest(request: Request): Promise<Response> {
  const bridge = getAiBridge()

  if (request.method === "GET") {
    const tab = new URL(request.url).searchParams.get("tab") ?? ""
    if (!TAB_ID.test(tab)) return json({ error: "Missing tab." }, 400)
    return events(request, tab)
  }
  if (request.method !== "POST")
    return json({ error: "Method not allowed." }, 405)

  let data: Record<string, unknown>
  try {
    data = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: "Send JSON." }, 400)
  }
  const tab =
    typeof data.tab === "string" && TAB_ID.test(data.tab) ? data.tab : null
  if (!tab) return json({ error: "Missing tab." }, 400)

  switch (data.type) {
    case "catalog": {
      const tools = parseTools(data.tools)
      if (!tools || !isAccessLevel(data.access))
        return json({ error: "Bad catalog." }, 400)
      const ok = bridge.setCatalog(tab, {
        access: data.access,
        board: typeof data.board === "string" ? data.board.slice(0, 200) : "",
        tools,
      })
      return json({ ok }, ok ? 200 : 409)
    }
    case "result": {
      const output = parseOutput(data.output)
      if (!output || typeof data.callId !== "string")
        return json({ error: "Bad result." }, 400)
      return json({ ok: bridge.answer(tab, data.callId, output) })
    }
    case "focus":
      return json({ ok: bridge.focus(tab) })
    default:
      return json({ error: "Unknown message." }, 400)
  }
}

/** Connect details for the AI panel. Same-origin only, so other sites can't read it. */
export async function handleSetupRequest(request: Request): Promise<Response> {
  try {
    if (request.method === "POST") await rotateMcpToken()
    else if (request.method !== "GET")
      return json({ error: "Method not allowed." }, 405)
    const origin = new URL(request.url).origin
    return json({
      url: `${origin}/api/mcp`,
      token: await mcpToken(),
      fromEnv: Boolean(tokenFromEnv()),
    })
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Couldn't read the token.",
      },
      500
    )
  }
}
