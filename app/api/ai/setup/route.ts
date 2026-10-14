import { handleSetupRequest } from "@/plugins/assistant/server/board-api"

// Connect details for the AI panel; POST makes a new token.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = handleSetupRequest
export const POST = handleSetupRequest
