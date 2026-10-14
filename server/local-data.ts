import "server-only"

import { access, mkdir, rename } from "node:fs/promises"
import path from "node:path"

// Files Lemni keeps for this machine only (the AI connection token, the audit log), in
// `.lemni/` next to the app. Never committed; never part of a board file. Paths are
// spelled out so the build's file tracing stays inside these folders.

let ready: Promise<void> | null = null

async function prepare() {
  const folder = path.join(process.cwd(), ".lemni")
  try {
    await access(folder)
  } catch {
    // The folder from before the rename (BAS Board) moves over, token and log included.
    await rename(path.join(process.cwd(), ".basboard"), folder).catch(() => {})
  }
  await mkdir(folder, { recursive: true, mode: 0o700 })
}

export async function localDataPath(
  name: "mcp-token" | "audit.log"
): Promise<string> {
  ready ??= prepare().catch((error: unknown) => {
    ready = null
    throw error
  })
  await ready
  return path.join(process.cwd(), ".lemni", name)
}
