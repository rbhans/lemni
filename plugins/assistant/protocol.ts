// What the board tab and the MCP endpoint say to each other, plus the access levels
// both enforce. Pure (no React, no DOM, relative imports only) so the server side of
// this plugin can import it and `node --test` can run it.

import type {
  AiAccessLevel,
  AiToolAccess,
  JsonSchema,
} from "../../studio/ai/schema.ts"

export type { AiAccessLevel, AiToolAccess }

export const ACCESS_LEVELS: {
  id: AiAccessLevel
  label: string
  description: string
}[] = [
  {
    id: "off",
    label: "Off",
    description: "AI apps can't see or change anything.",
  },
  {
    id: "read",
    label: "Read only",
    description: "Reads the board, documents and station. Changes nothing.",
  },
  {
    id: "edit",
    label: "Edit the board",
    description:
      "Also adds, changes and removes things on the board. Undoable.",
  },
  {
    id: "full",
    label: "Edit + station writes",
    description:
      "Also proposes station writes. Each one waits for your Allow once.",
  },
]

export const isAccessLevel = (value: unknown): value is AiAccessLevel =>
  ACCESS_LEVELS.some((level) => level.id === value)

export function allows(level: AiAccessLevel, access: AiToolAccess): boolean {
  switch (access) {
    case "read":
      return level !== "off"
    case "edit":
      return level === "edit" || level === "full"
    case "write":
      return level === "full"
  }
}

/** A tool as the AI app sees it (no code; the board runs it). */
export interface AiToolInfo {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  access: AiToolAccess
  /** How long the server waits for the board (approvals wait longer). */
  timeoutMs: number
  /** The plugin that brings it. */
  plugin: string
}

export type AiContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }

/** A tool's answer, in MCP's shape. */
export interface AiToolOutput {
  content: AiContent[]
  isError?: boolean
}

/** An AI app that has connected to the board's MCP endpoint. */
export interface AiClientInfo {
  id: string
  name: string
  version: string
  connectedAt: number
  lastSeen: number
}

/** Server → board (server-sent events). */
export type BridgeEvent =
  | {
      type: "call"
      callId: string
      tool: string
      input: unknown
      client: string
    }
  | { type: "cancel"; callId: string }
  | { type: "clients"; clients: AiClientInfo[] }

/** Board → server. */
export type BridgeMessage =
  | {
      type: "catalog"
      tab: string
      access: AiAccessLevel
      board: string
      tools: AiToolInfo[]
    }
  | { type: "result"; tab: string; callId: string; output: AiToolOutput }
  | { type: "focus"; tab: string }

export const DEFAULT_TIMEOUT_MS = 60_000
/** Write approvals wait this long for Allow once before they lapse. */
export const APPROVAL_TIMEOUT_MS = 4 * 60_000

export const errorOutput = (text: string): AiToolOutput => ({
  content: [{ type: "text", text }],
  isError: true,
})
