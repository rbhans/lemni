#!/usr/bin/env node
// `npm run dev`: Next's dev server, plus a watch on plugins/ that rewrites the plugin
// registries (scripts/plugins.mjs) when a plugin folder, its index or its
// server/routes.ts comes or goes. So adding, copying or deleting a plugin needs no
// restart. Arguments go to `next dev` (e.g. `npm run dev -- -p 3100`).

import { spawn } from "node:child_process"
import { watch } from "node:fs"
import { createRequire } from "node:module"

import { pluginsDir, syncPlugins } from "./plugins.mjs"

async function sync() {
  try {
    const { problems, written } = await syncPlugins()
    for (const file of written) console.log(`[plugins] wrote ${file}`)
    if (problems.length)
      console.error(`[plugins] ${problems.join("\n[plugins] ")}`)
    return problems.length === 0
  } catch (error) {
    console.error("[plugins] couldn't update the plugin registries:", error)
    return false
  }
}

if (!(await sync())) process.exit(1)

// What changes the registries: a top-level folder, or a plugin's index.ts(x),
// server folder or server/routes.ts.
const RELEVANT =
  /^[^/\\]+$|^[^/\\]+[/\\](index\.tsx?|server|server[/\\]routes\.ts)$/
let timer = null
const watcher = watch(pluginsDir, { recursive: true }, (_event, file) => {
  if (!file || file.endsWith(".generated.ts") || !RELEVANT.test(file)) return
  clearTimeout(timer)
  timer = setTimeout(sync, 150)
})

const next = spawn(
  process.execPath,
  [
    createRequire(import.meta.url).resolve("next/dist/bin/next"),
    "dev",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" }
)
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => next.kill(signal))
next.on("exit", (code, signal) => {
  watcher.close()
  process.exit(code ?? (signal ? 1 : 0))
})
