import { handleMcpRequest } from "@/plugins/assistant/server/mcp"

// AI apps (Claude Code, Claude Desktop, Codex) connect here over MCP.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = handleMcpRequest
export const POST = handleMcpRequest
export const DELETE = handleMcpRequest
