import "server-only"

import { access, mkdir, rename } from "node:fs/promises"
import path from "node:path"

// Files Lemscape keeps for this machine only (the AI connection token, the audit log), in
// `.lemscape/` next to the app. Never committed; never part of a board file. Paths are
// spelled out so the build's file tracing stays inside these folders.

let ready: Promise<void> | null = null

async function prepare() {
  const folder = path.join(process.cwd(), ".lemscape")
  try {
    await access(folder)
  } catch {
    // The folder from an earlier name moves over, token and log included: Lemni's
    // `.lemni/`, or BAS Board's `.basboard/` before that.
    await rename(path.join(process.cwd(), ".lemni"), folder).catch(() =>
      rename(path.join(process.cwd(), ".basboard"), folder).catch(() => {})
    )
  }
  await mkdir(folder, { recursive: true, mode: 0o700 })
}

/** Makes sure `.lemscape/` exists (moving an older one over) before anything uses it. */
export async function ensureLocalData(): Promise<void> {
  ready ??= prepare().catch((error: unknown) => {
    ready = null
    throw error
  })
  await ready
}

export async function localDataPath(
  name: "mcp-token" | "audit.log"
): Promise<string> {
  await ensureLocalData()
  return path.join(process.cwd(), ".lemscape", name)
}
