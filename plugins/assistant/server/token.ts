import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"

import { localDataPath } from "@/server/local-data"

// The MCP endpoint answers only AI apps that present this token. It's made on first
// use and kept in `.lemscape/mcp-token` (or set LEMSCAPE_MCP_TOKEN). The AI panel shows
// the command to connect with it; making a new one disconnects every app.

const FILE = "mcp-token"

/** LEMSCAPE_MCP_TOKEN (LEMNI_ and BASBOARD_MCP_TOKEN still work from earlier names). */
export const tokenFromEnv = () =>
  (
    process.env.LEMSCAPE_MCP_TOKEN ??
    process.env.LEMNI_MCP_TOKEN ??
    process.env.BASBOARD_MCP_TOKEN
  )?.trim() || undefined

const cache = globalThis as typeof globalThis & {
  __lemscapeMcpToken?: Promise<string>
}

async function load(): Promise<string> {
  const fromEnv = tokenFromEnv()
  if (fromEnv) return fromEnv
  const file = await localDataPath(FILE)
  try {
    const saved = (await readFile(file, "utf8")).trim()
    if (saved.length >= 32) return saved
  } catch {
    // Not made yet.
  }
  const token = randomBytes(32).toString("base64url")
  await writeFile(file, `${token}\n`, { mode: 0o600 })
  return token
}

export function mcpToken(): Promise<string> {
  cache.__lemscapeMcpToken ??= load().catch((error: unknown) => {
    cache.__lemscapeMcpToken = undefined
    throw error
  })
  return cache.__lemscapeMcpToken
}

/** Makes a new token (unless it comes from the environment). */
export async function rotateMcpToken(): Promise<string> {
  if (tokenFromEnv())
    throw new Error(
      "The token is set by an environment variable (LEMSCAPE_MCP_TOKEN); change it there."
    )
  const token = randomBytes(32).toString("base64url")
  await writeFile(await localDataPath(FILE), `${token}\n`, { mode: 0o600 })
  cache.__lemscapeMcpToken = Promise.resolve(token)
  return token
}

const digest = (value: string) => createHash("sha256").update(value).digest()

/** True when the request carries the token as a Bearer credential. */
export async function hasValidToken(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? ""
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  if (!match) return false
  return timingSafeEqual(digest(match[1]), digest(await mcpToken()))
}
