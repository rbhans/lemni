import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

import ts from "typescript"

// The plugin rules (docs/PLUGINS.md → The rules) that keep a plugin working when the
// studio's insides move. A plugin imports the studio only through the SDK, its relative
// imports stay in its own folder, and anything its server code loads stays free of
// browser code. ESLint flags the first as you type; this checks all three.

const pluginsDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(pluginsDir)
const CORE = path.join(root, "sdk", "core.ts")

const BROWSER_ALIASES = [
  /^@\/sdk$/,
  /^@\/components\/ui\/[\w-]+$/,
  /^@\/lib\/utils$/,
]
const SERVER_ALIASES = [/^@\/sdk\/server$/]

const rel = (file: string) => path.relative(root, file)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory())
      return entry.name === "node_modules" ? [] : sourceFiles(full)
    return /\.(ts|tsx|mts|js|mjs)$/.test(entry.name) ? [full] : []
  })
}

const pluginFolders = readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => path.join(pluginsDir, entry.name))

const importsCache = new Map<string, string[]>()
function importsOf(file: string): string[] {
  let found = importsCache.get(file)
  if (!found) {
    found = ts
      .preProcessFile(readFileSync(file, "utf8"), true, true)
      .importedFiles.map((ref) => ref.fileName)
    importsCache.set(file, found)
  }
  return found
}

function resolveRelative(from: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(from), specifier)
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ])
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  return null
}

const isServerFile = (folder: string, file: string) =>
  path.relative(folder, file).split(path.sep)[0] === "server"

function checkFile(folder: string, file: string, problems: string[]) {
  const server = isServerFile(folder, file)
  for (const specifier of importsOf(file)) {
    if (specifier.startsWith("@/")) {
      const allowed = server ? SERVER_ALIASES : BROWSER_ALIASES
      if (!allowed.some((pattern) => pattern.test(specifier)))
        problems.push(
          `${rel(file)} imports "${specifier}": ${
            server
              ? 'server code imports the studio from "@/sdk/server"'
              : 'plugins import the studio from "@/sdk" (plus "@/components/ui/*" and "@/lib/utils")'
          }.`
        )
      continue
    }
    if (!specifier.startsWith(".")) continue // an npm package or node builtin
    const target = resolveRelative(file, specifier)
    if (!target) {
      problems.push(`${rel(file)} imports "${specifier}", which doesn't exist.`)
      continue
    }
    if (target === CORE) continue
    if (path.relative(folder, target).startsWith(".."))
      problems.push(
        `${rel(file)} imports "${specifier}", outside its plugin. Use "@/sdk", or "../../sdk/core.ts" in a pure module.`
      )
    else if (!server && isServerFile(folder, target))
      problems.push(
        `${rel(file)} imports server code ("${specifier}"); the browser reaches it through the plugin's routes (pluginApi).`
      )
  }
}

test("plugins import the studio only through the SDK, and stay in their folder", () => {
  const problems: string[] = []
  for (const folder of pluginFolders)
    for (const file of sourceFiles(folder)) checkFile(folder, file, problems)
  assert.deepEqual(problems, [])
})

test("what a plugin's server code loads has no browser code in it", () => {
  const problems: string[] = []
  for (const folder of pluginFolders) {
    const serverDir = path.join(folder, "server")
    if (!existsSync(serverDir)) continue
    // Follow server files' relative imports into the rest of the plugin (shared types,
    // protocols): those modules run on the server too, so "@/sdk" (React) can't be there.
    const seen = new Set<string>()
    const queue = sourceFiles(serverDir)
    while (queue.length) {
      const file = queue.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      for (const specifier of importsOf(file)) {
        if (specifier.startsWith(".")) {
          const target = resolveRelative(file, specifier)
          if (target && target !== CORE && !isServerFile(folder, target))
            queue.push(target)
          continue
        }
        if (!isServerFile(folder, file) && specifier.startsWith("@/"))
          problems.push(
            `${rel(file)} is loaded by server code but imports "${specifier}". Keep shared modules pure (relative imports, "../../sdk/core.ts").`
          )
      }
    }
  }
  assert.deepEqual(problems, [])
})
