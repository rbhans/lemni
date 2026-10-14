import { handleBridgeRequest } from "@/plugins/assistant/server/board-api"

// The open board tab runs AI tool calls; this is its line to the MCP endpoint.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = handleBridgeRequest
export const POST = handleBridgeRequest
