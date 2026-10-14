#!/usr/bin/env node
// Builds the HVAC symbol library module from the SVG pieces in plugins/hvac-symbols/svg.
//
//   node scripts/build-symbols.mjs                 regenerate from the in-repo copies
//   node scripts/build-symbols.mjs --from <dir>    copy <dir> (e.g. ../symbol-library/svg) in first
//
// Each piece is a standalone SVG with its own <style> (see svg/README.md). Inline SVG
// styles are global, so every piece's CSS is scoped to its own root class and its
// keyframes are renamed. Features (on, ccw, flow, --level, …) are detected from the CSS.
// Anything unexpected (scripts, links, ids, odd viewBoxes) fails the build.

import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const svgDir = join(root, "plugins/hvac-symbols/svg")
const outFile = join(root, "plugins/hvac-symbols/library.generated.ts")

// Pieces that stretch along their run: their geometry is written with a {L} length.
const STRETCH = new Set(["air/duct", "water/pipe"])
const CATEGORIES = ["air", "water", "shared"]

function listSvgs(dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return listSvgs(path)
      return name.endsWith(".svg") ? [path] : []
    })
    .sort()
}

function syncFrom(source) {
  const from = resolve(source)
  if (!statSync(from, { throwIfNoEntry: false })?.isDirectory())
    throw new Error(`No such folder: ${from}`)
  rmSync(svgDir, { recursive: true, force: true })
  for (const file of listSvgs(from)) {
    const target = join(svgDir, relative(from, file))
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(file, target)
  }
  const readme = join(from, "README.md")
  if (statSync(readme, { throwIfNoEntry: false }))
    copyFileSync(readme, join(svgDir, "README.md"))
  console.log(`Copied ${listSvgs(svgDir).length} pieces from ${from}`)
}

function matchingBrace(css, open) {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++
    else if (css[i] === "}" && --depth === 0) return i
  }
  throw new Error("Unbalanced braces in <style>")
}

/** Puts every selector under `.scope` (rules that already start there are kept). */
function scopeRules(css, scope, where) {
  let out = ""
  let i = 0
  while (i < css.length) {
    const open = css.indexOf("{", i)
    if (open === -1) {
      if (css.slice(i).trim())
        throw new Error(`${where}: stray CSS "${css.slice(i).trim()}"`)
      break
    }
    const prelude = css.slice(i, open).trim()
    const close = matchingBrace(css, open)
    const inner = css.slice(open + 1, close)
    if (prelude.startsWith("@keyframes")) out += `${prelude}{${inner.trim()}}`
    else if (prelude.startsWith("@media"))
      out += `${prelude}{${scopeRules(inner, scope, where)}}`
    else if (prelude.startsWith("@"))
      throw new Error(`${where}: unsupported at-rule ${prelude}`)
    else {
      if (prelude.includes("("))
        throw new Error(
          `${where}: selector functions aren't supported: ${prelude}`
        )
      const selectors = prelude.split(",").map((s) => {
        const sel = s.trim()
        // Already scoped: ".scope", ".scope.on …", ".scope .part", ".scope:hover".
        const scoped =
          sel === `.${scope}` ||
          (sel.startsWith(`.${scope}`) &&
            /^[.:\s]/.test(sel.slice(scope.length + 1)))
        return scoped ? sel : `.${scope} ${sel}`
      })
      out += `${selectors.join(",")}{${inner.trim()}}`
    }
    i = close + 1
  }
  return out
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildPiece(file) {
  const id = relative(svgDir, file)
    .replace(/\\/g, "/")
    .replace(/\.svg$/, "")
  const [category] = id.split("/")
  if (!CATEGORIES.includes(category))
    throw new Error(`${id}: unknown category "${category}"`)
  const slug = id.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
  const scope = `nx-${slug}`
  const source = readFileSync(file, "utf8")

  for (const banned of [
    /<script/i,
    /\son\w+\s*=/i,
    /href\s*=/i,
    /<foreignObject/i,
    /<image/i,
    /\sid\s*=/i,
    /url\(/i,
  ]) {
    if (banned.test(source))
      throw new Error(
        `${id}: contains ${banned}, which the library doesn't allow`
      )
  }

  const rootTag = source.match(/<svg\b[^>]*>/)?.[0]
  if (!rootTag) throw new Error(`${id}: no <svg> root`)
  const viewBox = rootTag
    .match(/viewBox="([^"]+)"/)?.[1]
    ?.split(/\s+/)
    .map(Number)
  if (
    !viewBox ||
    viewBox.length !== 4 ||
    viewBox[0] !== 0 ||
    viewBox[1] !== 0 ||
    viewBox.some((n) => !Number.isFinite(n))
  )
    throw new Error(`${id}: viewBox must be "0 0 W H"`)
  if (!/class="nx"/.test(rootTag))
    throw new Error(`${id}: the root <svg> must have class="nx"`)
  const [, , width, height] = viewBox

  const title = decodeXml(
    source.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? ""
  )
  if (!title) throw new Error(`${id}: missing <title>`)

  const styleMatch = source.match(/<style>([\s\S]*?)<\/style>/)
  if (!styleMatch) throw new Error(`${id}: missing <style>`)
  let css = styleMatch[1].replace(/\/\*[\s\S]*?\*\//g, "")

  const features = []
  const has = (re) => re.test(css)
  if (has(/\.nx\.on\b/)) features.push("on")
  if (has(/\.nx\.ccw\b/)) features.push("ccw")
  if (has(/\.nx\.flow\b/)) features.push("flow")
  if (has(/\.nx\.parallel\b/)) features.push("parallel")
  if (has(/\.nx\.loaded\b/)) features.push("loaded")
  if (has(/var\(--blade\b/)) features.push("position")
  if (has(/var\(--level\b/)) features.push("level")
  if (has(/var\(--sash\b/)) features.push("sash")

  for (const name of new Set(
    [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])
  )) {
    css = css.replace(
      new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, "g"),
      `${name}--${slug}`
    )
  }
  css = css.replace(/\.nx(?![\w-])/g, `.${scope}`)
  css = scopeRules(css, scope, id)
  if (/\.nx(?![\w-])/.test(css))
    throw new Error(`${id}: unscoped .nx left after scoping`)

  const afterStyle = source.slice(
    source.indexOf("</style>") + "</style>".length
  )
  let body = afterStyle.slice(0, afterStyle.lastIndexOf("</svg>")).trim()
  if (!body.startsWith("<g"))
    throw new Error(`${id}: expected the drawing to start with a <g>`)
  if (/<style|<title/.test(body))
    throw new Error(`${id}: <style> and <title> must come before the drawing`)

  let text
  const label = body.match(
    /(<g class="label">[\s\S]*?<text\b[^>]*>)([^<]*)(<\/text>)/
  )
  if (label) {
    text = label[2]
    body = body.replace(label[0], `${label[1]}{TEXT}${label[3]}`)
    features.push("text")
  }

  let stretch
  if (STRETCH.has(id)) {
    if (width !== 100)
      throw new Error(`${id}: stretchable pieces are drawn 100 long`)
    const before = body
    body = body
      .replace(/width="100"/g, 'width="{L}"')
      .replace(/H100\b/g, "H{L}")
    if (body === before || /\b100\b/.test(body))
      throw new Error(`${id}: couldn't find the run length to stretch`)
    stretch = "x"
  }

  return {
    id,
    category,
    title,
    width,
    height,
    scope,
    css,
    body,
    features,
    ...(text !== undefined && { text }),
    ...(stretch && { stretch }),
  }
}

const fromIndex = process.argv.indexOf("--from")
if (fromIndex !== -1) syncFrom(process.argv[fromIndex + 1] ?? "")

const pieces = listSvgs(svgDir).map(buildPiece)
const ids = new Set()
for (const piece of pieces) {
  if (ids.has(piece.id)) throw new Error(`Duplicate symbol ${piece.id}`)
  ids.add(piece.id)
}

const header = `// Generated by scripts/build-symbols.mjs from plugins/hvac-symbols/svg. Do not edit.
// Run \`npm run symbols:build\` (or \`npm run symbols:sync\` to pull from ../symbol-library).

import type { SymbolPiece } from "./library-types.ts"

export const PIECES: readonly SymbolPiece[] = `
writeFileSync(outFile, `${header}${JSON.stringify(pieces, null, 2)}\n`)
console.log(
  `Wrote ${pieces.length} symbols to ${relative(root, outFile)} (${basename(svgDir)}/: ${CATEGORIES.map((c) => `${c} ${pieces.filter((p) => p.category === c).length}`).join(", ")})`
)
