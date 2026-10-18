import "server-only"

import { mkdir } from "node:fs/promises"
import path from "node:path"

import { ensureLocalData } from "./local-data"

// A plugin's own files on this machine (caches, tokens, logs), in
// `.lemscape/plugins/<id>/`. Never committed, never part of a board file.

const PLUGIN_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

/**
 * The path of one of a plugin's files, its folder created on first use:
 * `await pluginDataPath("my-plugin", "cache.json")`. Names are plain file names
 * (letters, digits, dots, dashes and underscores), so they can't reach outside it.
 */
export async function pluginDataPath(
  pluginId: string,
  name: string
): Promise<string> {
  if (!PLUGIN_ID.test(pluginId))
    throw new Error(`"${pluginId}" isn't a plugin id.`)
  if (!FILE_NAME.test(name) || name.includes(".."))
    throw new Error(
      `"${name}" isn't a plain file name: use letters, digits, dots, dashes and underscores.`
    )
  await ensureLocalData()
  const folder = path.join(process.cwd(), ".lemscape", "plugins", pluginId)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  return path.join(folder, name)
}
