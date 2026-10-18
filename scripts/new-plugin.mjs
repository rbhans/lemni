#!/usr/bin/env node
// Makes a new plugin folder you can start editing right away:
//
//   npm run new-plugin                                (asks what you want)
//   npm run new-plugin -- trend-alerts --panel --ai   (or say it up front)
//
// The plugin is registered automatically (scripts/plugins.mjs) and is on by default.
// Everything it can add is in docs/PLUGINS.md.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createInterface } from "node:readline/promises"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import * as prettier from "prettier"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const CATEGORIES = [
  "core",
  "drawing",
  "libraries",
  "data",
  "media",
  "connections",
  "ai",
]
const PIECES = {
  panel: "a panel in the left rail",
  shape: "a shape, with a toolbar button and properties",
  settings: "a section in Settings with a saved setting",
  server: "server routes at /api/plugins/<id>/… and a client for them",
  ai: "a tool AI apps can call",
}

const USAGE = `Make a new plugin in plugins/<id>/.

  npm run new-plugin                      asks you everything
  npm run new-plugin -- <id> [options]

  <id>                 kebab-case, e.g. trend-alerts (the folder and the plugin's id)
  --name "…"           shown in the plugin manager (default: from the id)
  --description "…"    one line on what it does
  --category <c>       ${CATEGORIES.join(", ")} (default: data)
  --author "…"         shown in the plugin manager
  --url <address>      where to read more, shown in the plugin manager
${Object.entries(PIECES)
  .map(([key, what]) => `  --${key.padEnd(19)}${what}`)
  .join("\n")}
  --all                all of the above`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    description: { type: "string" },
    category: { type: "string" },
    author: { type: "string" },
    url: { type: "string" },
    ...Object.fromEntries(
      Object.keys(PIECES).map((key) => [key, { type: "boolean" }])
    ),
    all: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
})

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const titleFrom = (id) => {
  const words = id.split("-").join(" ")
  return words[0].toUpperCase() + words.slice(1)
}

function checkId(id) {
  if (!ID.test(id))
    return `"${id}" isn't a plugin id: use kebab-case, e.g. "trend-alerts".`
  if (id.length > 40) return "Keep the id under 40 characters."
  if (existsSync(path.join(root, "plugins", id)))
    return `plugins/${id} already exists.`
  return null
}

function checkUrl(url) {
  try {
    const parsed = new URL(url)
    return ["http:", "https:"].includes(parsed.protocol)
      ? null
      : "Use an http(s) address."
  } catch {
    return `"${url}" isn't an address.`
  }
}

async function ask() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const question = async (text, fallback = "") => {
    const answer = (
      await rl.question(fallback ? `${text} [${fallback}] ` : `${text} `)
    ).trim()
    return answer || fallback
  }
  const yes = async (text) => /^y/i.test(await question(`${text}? (y/N)`))
  let id = ""
  for (;;) {
    id = await question('Plugin id (kebab-case, e.g. "trend-alerts"):')
    const problem = checkId(id)
    if (!problem) break
    console.log(problem)
  }
  const answers = { id }
  answers.name = await question("Name:", titleFrom(id))
  answers.description = await question("One line on what it does:")
  for (;;) {
    answers.category = await question(
      `Category (${CATEGORIES.join(", ")}):`,
      "data"
    )
    if (CATEGORIES.includes(answers.category)) break
  }
  for (const [key, what] of Object.entries(PIECES))
    answers[key] = await yes(`Add ${what}`)
  rl.close()
  return answers
}

let options
if (positionals.length) {
  if (positionals.length > 1) fail(`One id at a time.\n\n${USAGE}`)
  options = {
    ...values,
    id: positionals[0],
    ...Object.fromEntries(
      Object.keys(PIECES).map((key) => [
        key,
        Boolean(values[key] || values.all),
      ])
    ),
  }
} else if (process.stdin.isTTY) {
  options = await ask()
} else fail(USAGE)

const { id } = options
const problem = checkId(id)
if (problem) fail(problem)
const category = options.category || "data"
if (!CATEGORIES.includes(category))
  fail(`The category is one of ${CATEGORIES.join(", ")}.`)
if (options.url && checkUrl(options.url)) fail(checkUrl(options.url))

const name = options.name || titleFrom(id)
const description =
  options.description || `${name}: say in a line what it adds.`
const words = id.split("-")
const Pascal = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("")
const camel = Pascal[0].toLowerCase() + Pascal.slice(1)
const snake = words.join("_")
const sdk = /export const SDK_VERSION = "([^"]+)"/.exec(
  readFileSync(path.join(root, "studio/plugins/registry.ts"), "utf8")
)[1]
const q = JSON.stringify

// ---- Files -------------------------------------------------------------------------

const files = {}
const imports = []
const byPath = (a, b) =>
  a.split(" from ")[1].localeCompare(b.split(" from ")[1])
const fields = []

if (options.panel) {
  imports.push(`import { ${Pascal}Panel } from "./panel"`)
  fields.push(`panels: [
    {
      id: ${q(id)},
      title: ${q(name)},
      icon: CubeIcon,
      side: "left",
      // Rail groups: "board" (default), "connections" or "ai".
      group: "board",
      order: 100,
      workspaces: ["canvas"],
      component: ${Pascal}Panel,
    },
  ],`)
  files["panel.tsx"] = `"use client"

import { useEditor, useValue } from "tldraw"

import { PanelHeader } from "@/sdk"

/** The left panel. Read the board with tldraw's hooks; \`useValue\` keeps it current. */
export function ${Pascal}Panel() {
  const editor = useEditor()
  const selected = useValue(
    "selected shapes",
    () => editor.getSelectedShapeIds().length,
    [editor]
  )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader title=${q(name)} />
      <div className="flex flex-col gap-2 px-3.5 pb-3 text-xs text-muted-foreground">
        <p>{selected ? \`\${selected} selected.\` : "Nothing selected."}</p>
      </div>
    </div>
  )
}
`
}

if (options.shape) {
  imports.push(
    `import { CardSection, hasCardSelected, insertCard } from "./card-section"`
  )
  imports.push(`import { CardShapeUtil } from "./card-shape"`)
  fields.push(`// Shapes are registered even while the plugin is off, so boards that use them load.
  shapeUtils: [CardShapeUtil],
  toolbar: [
    {
      id: ${q(`${id}-insert-card`)},
      group: "insert",
      order: 50,
      label: ${q(`Insert ${name} card`)},
      icon: CubeIcon,
      onSelect: ({ editor }) => insertCard(editor),
    },
  ],
  inspectorSections: [
    {
      id: ${q(`${id}-card`)},
      tab: "design",
      title: ${q(`${name} card`)},
      order: 20,
      when: hasCardSelected,
      component: CardSection,
    },
  ],`)
  files["card-shape.tsx"] = `"use client"

import {
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  ShapeUtil,
  T,
  type TLResizeInfo,
  type TLShape,
} from "tldraw"

import { registerShapeLabel } from "@/sdk"

/**
 * Saved in board files, so it can't change once boards use it. It starts with the
 * plugin's id so it can't clash with another plugin's shapes.
 */
export const CARD_TYPE = ${q(`${id}-card`)}

export interface CardProps {
  w: number
  h: number
  text: string
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [CARD_TYPE]: CardProps
  }
}

export type CardShape = TLShape<typeof CARD_TYPE>

export const isCardShape = (
  shape: TLShape | null | undefined
): shape is CardShape => shape?.type === CARD_TYPE

// How the shape is named in the layers list and elsewhere.
registerShapeLabel(CARD_TYPE, () => ${q(`${name} card`)})

export class CardShapeUtil extends ShapeUtil<CardShape> {
  static override type = CARD_TYPE
  // Checked when a board loads. Adding a prop later needs a migration (tldraw docs:
  // "Shape migrations"); boards saved before it still have the old props.
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    text: T.string,
  }

  getDefaultProps(): CardProps {
    return { w: 240, h: 120, text: ${q(name)} }
  }

  getGeometry(shape: CardShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: CardShape, info: TLResizeInfo<CardShape>) {
    return resizeBox(shape, info, { minWidth: 120, minHeight: 60 })
  }

  component(shape: CardShape) {
    return (
      <HTMLContainer className="flex items-center justify-center rounded-xl border bg-card p-3 text-center text-sm text-card-foreground shadow-sm">
        {shape.props.text}
      </HTMLContainer>
    )
  }

  getIndicatorPath(shape: CardShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
    return path
  }
}
`
  files["card-section.tsx"] = `"use client"

import { createShapeId, useEditor, useValue, type Editor } from "tldraw"

import { Input } from "@/components/ui/input"
import { PropertyRow } from "@/sdk"

import { CARD_TYPE, isCardShape } from "./card-shape"

export const hasCardSelected = (editor: Editor) =>
  editor.getSelectedShapes().some(isCardShape)

/** Adds a card in the middle of the view and selects it (one undo step). */
export function insertCard(editor: Editor) {
  const id = createShapeId()
  const { center } = editor.getViewportPageBounds()
  editor.markHistoryStoppingPoint("insert card")
  editor.createShape({ id, type: CARD_TYPE, x: center.x - 120, y: center.y - 60 })
  editor.select(id)
}

/** The card's properties, in the Design tab while one card is selected. */
export function CardSection() {
  const editor = useEditor()
  const shape = useValue(
    "selected card",
    () => {
      const selected = editor.getSelectedShapes()
      return selected.length === 1 && isCardShape(selected[0]) ? selected[0] : null
    },
    [editor]
  )
  if (!shape) return null
  return (
    <PropertyRow label="Text">
      <Input
        key={\`\${shape.id}:\${shape.props.text}\`}
        aria-label="Text"
        className="h-7 text-xs"
        defaultValue={shape.props.text}
        onBlur={(event) => {
          if (event.target.value === shape.props.text) return
          editor.markHistoryStoppingPoint("change card text")
          editor.updateShape({
            id: shape.id,
            type: CARD_TYPE,
            props: { text: event.target.value },
          })
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </PropertyRow>
  )
}
`
}

if (options.settings) {
  imports.push(`import { ${Pascal}Settings } from "./settings"`)
  fields.push(`settingsSections: [
    {
      id: ${q(id)},
      // The page it's listed under in Settings; use an existing one ("Canvas",
      // "Interface") or your own.
      page: ${q(name)},
      title: ${q(name)},
      description: "What these settings change.",
      order: 10,
      component: ${Pascal}Settings,
    },
  ],`)
  files["settings.tsx"] = `"use client"

import { useValue } from "tldraw"

import { Switch } from "@/components/ui/switch"
import { pluginStorage } from "@/sdk"

const storage = pluginStorage(${q(id)})

/**
 * Kept in this browser (not in the board), under \`lemscape.plugin.${id}.compact\`.
 * Read it anywhere: \`useValue(compact)\` in components, \`compact.get()\` elsewhere.
 */
export const compact = storage.atom(
  "compact",
  false,
  (value): value is boolean => typeof value === "boolean"
)

export function ${Pascal}Settings() {
  const on = useValue(compact)
  return (
    <label className="flex max-w-96 items-center justify-between gap-3 text-xs">
      <span>
        Compact mode
        <span className="block text-[11px] text-muted-foreground">
          An example setting to replace with your own.
        </span>
      </span>
      <Switch checked={on} onCheckedChange={(checked) => compact.set(checked)} />
    </label>
  )
}
`
}

if (options.server) {
  imports.push(`import { sayHello } from "./client"`)
  fields.push(`commands: [
    {
      id: ${q(`${id}-hello`)},
      label: ${q(`Say hello to the ${name} server`)},
      group: ${q(name)},
      order: 10,
      run: () => void sayHello(),
    },
  ],`)
  files["client.ts"] = `"use client"

import { toast } from "sonner"

import { pluginApi } from "@/sdk"

/** This plugin's server routes (server/routes.ts), at /api/plugins/${id}/…. */
export const api = pluginApi(${q(id)})

export async function sayHello() {
  try {
    const { message } = await api.get<{ message: string }>("/hello")
    toast.success(message)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
}
`
  files["server/routes.ts"] = `import "server-only"

import { definePluginRoutes, PluginRouteError } from "@/sdk/server"

// Served at /api/plugins/${id}/… behind the studio's request guard (local addresses,
// same origin, JSON bodies). Connections and credentials stay here; send the browser
// only what it needs.

export default definePluginRoutes({
  "GET /hello": () =>
    Response.json({ message: ${q(`Hello from the ${name} server.`)} }),

  "POST /echo": async ({ json }) => {
    const body = await json<{ text?: unknown }>()
    if (typeof body.text !== "string")
      throw new PluginRouteError(400, "Send { text: string }.")
    return Response.json({ text: body.text })
  },
})
`
}

if (options.ai) {
  imports.push(`import { ${camel}Ai } from "./ai-tools"`)
  fields.push(`ai: ${camel}Ai,`)
  files["ai-tools.ts"] = `"use client"

import type { AiBoardTool, AiContribution } from "@/sdk"

// Tools AI apps call over MCP while this board is open. Names are snake_case and
// unique; descriptions are written for the AI; throw an Error with a sentence the AI
// can act on. Rules for tools that change things: docs/PLUGINS.md → AI tools.

const countShapes: AiBoardTool = {
  name: ${q(`${snake}_count_shapes`)},
  title: "Count shapes",
  access: "read",
  description:
    "Counts the shapes on the person's current page, by shape type. Use it for a quick sense of what's on a page before reading it in full.",
  inputSchema: { type: "object", additionalProperties: false, properties: {} },
  run({ editor }) {
    const counts: Record<string, number> = {}
    for (const shape of editor.getCurrentPageShapes())
      counts[shape.type] = (counts[shape.type] ?? 0) + 1
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
    return { text: \`\${total} shapes on this page.\`, data: counts }
  },
}

export const ${camel}Ai: AiContribution = {
  guide: ${q(`${name} adds … (a few sentences on what this plugin offers and how an AI should use it).`)},
  tools: [countShapes],
}
`
}

files["index.tsx"] = `"use client"

import { CubeIcon } from "@hugeicons/core-free-icons"

import { definePlugin } from "@/sdk"
${imports.length ? `\n${imports.sort(byPath).join("\n")}\n` : ""}
// The plugin: what it is and what it adds. Every option is in docs/PLUGINS.md.
export default definePlugin({
  id: ${q(id)},
  name: ${q(name)},
  version: "0.1.0",
  // The plugin SDK version this was written against (docs/PLUGINS.md → Versions).
  requiresSdk: ${q(sdk)},
  description: ${q(description)},
  category: ${q(category)},
  icon: CubeIcon,${options.author ? `\n  author: ${q(options.author)},` : ""}${options.url ? `\n  url: ${q(options.url)},` : ""}
  // "preview" shows a Preview badge; drop it once it's ready.
  stage: "preview",${fields.length ? `\n  ${fields.join("\n  ")}` : ""}
})
`

// ---- Write ---------------------------------------------------------------------------

const dir = path.join(root, "plugins", id)
for (const [file, raw] of Object.entries(files)) {
  const target = path.join(dir, file)
  mkdirSync(path.dirname(target), { recursive: true })
  const config = (await prettier.resolveConfig(target)) ?? {}
  writeFileSync(
    target,
    await prettier.format(raw, { ...config, filepath: target })
  )
}
execFileSync(process.execPath, [path.join(root, "scripts/plugins.mjs")], {
  stdio: "ignore",
})

const ABOUT = {
  "index.tsx": "the plugin: its name and everything it adds",
  "panel.tsx": "the left panel",
  "card-shape.tsx": "the shape (saved in boards as " + q(`${id}-card`) + ")",
  "card-section.tsx": "its properties and the insert action",
  "settings.tsx": "the Settings section and its saved setting",
  "client.ts": "the browser side of the server routes",
  "server/routes.ts": `server routes, at /api/plugins/${id}/…`,
  "ai-tools.ts": "the AI tool",
}
console.log(`\nMade plugins/${id}/ (registered and on by default):\n`)
for (const file of Object.keys(files).sort((a, b) =>
  a === "index.tsx" ? -1 : b === "index.tsx" ? 1 : a.localeCompare(b)
))
  console.log(`  ${file.padEnd(18)}${ABOUT[file]}`)
console.log(`
Next:
  npm run dev, then find ${q(name)} under Plugins (the puzzle at the bottom of the rail)
  docs/PLUGINS.md has everything a plugin can add, and the rules`)
