"use client"

import type { PDFDocumentProxy } from "pdfjs-dist"

// pdf.js loads only when a PDF is shown, and only the pages you look at are drawn.

let lib: Promise<typeof import("pdfjs-dist")> | null = null

function pdfjs() {
  lib ??= import("pdfjs-dist").then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString()
    return mod
  })
  return lib
}

async function load(bytes: ArrayBuffer) {
  const { getDocument } = await pdfjs()
  return getDocument({ data: new Uint8Array(bytes) }).promise
}

/** Page count and the first page's shape, for sizing a new card. */
export async function pdfInfo(bytes: ArrayBuffer) {
  const { getDocument } = await pdfjs()
  // pdf.js takes ownership of the buffer it's given, so it gets a copy.
  const task = getDocument({ data: new Uint8Array(bytes.slice(0)) })
  try {
    const doc = await task.promise
    const first = await doc.getPage(1)
    const { width, height } = first.getViewport({ scale: 1 })
    return { pages: doc.numPages, aspect: width / height }
  } finally {
    void task.destroy()
  }
}

const docs = new Map<string, Promise<PDFDocumentProxy>>()

function open(key: string, bytes: () => Promise<ArrayBuffer>) {
  let doc = docs.get(key)
  if (!doc) {
    doc = bytes().then(load)
    docs.set(key, doc)
    doc.catch(() => docs.delete(key))
  }
  return doc
}

const images = new Map<string, Promise<string>>()
const MAX_IMAGES = 80

/** One page drawn at `width` pixels, as an image URL (cached). */
export function pageImage(
  key: string,
  bytes: () => Promise<ArrayBuffer>,
  page: number,
  width: number
): Promise<string> {
  const id = `${key}#${page}@${width}`
  const hit = images.get(id)
  if (hit) return hit
  const image = (async () => {
    const doc = await open(key, bytes)
    const pdfPage = await doc.getPage(Math.min(Math.max(1, page), doc.numPages))
    const base = pdfPage.getViewport({ scale: 1 })
    const viewport = pdfPage.getViewport({ scale: width / base.width })
    const canvas = document.createElement("canvas")
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await pdfPage.render({ canvas, viewport }).promise
    return canvas.toDataURL("image/jpeg", 0.88)
  })()
  images.set(id, image)
  image.catch(() => images.delete(id))
  if (images.size > MAX_IMAGES) images.delete(images.keys().next().value!)
  return image
}

/** Part of a page as fractions of its width and height, from the top-left. */
export interface PageRegion {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A region of a page drawn at up to `maxSize` pixels on its longest side, for reading
 * small print on big drawings. Not cached (each region is asked for once).
 */
export async function pageRegionImage(
  key: string,
  bytes: () => Promise<ArrayBuffer>,
  page: number,
  region: PageRegion,
  maxSize = 1600
): Promise<{ url: string; width: number; height: number }> {
  const doc = await open(key, bytes)
  const pdfPage = await doc.getPage(Math.min(Math.max(1, page), doc.numPages))
  const base = pdfPage.getViewport({ scale: 1 })
  const w = Math.max(0.01, Math.min(region.w, 1 - region.x)) * base.width
  const h = Math.max(0.01, Math.min(region.h, 1 - region.y)) * base.height
  const scale = Math.min(maxSize / Math.max(w, h), 10)
  const viewport = pdfPage.getViewport({ scale })
  const canvas = document.createElement("canvas")
  canvas.width = Math.ceil(w * scale)
  canvas.height = Math.ceil(h * scale)
  await pdfPage.render({
    canvas,
    viewport,
    transform: [
      1,
      0,
      0,
      1,
      -region.x * viewport.width,
      -region.y * viewport.height,
    ],
  }).promise
  return {
    url: canvas.toDataURL("image/jpeg", 0.9),
    width: canvas.width,
    height: canvas.height,
  }
}

const texts = new Map<string, Promise<string>>()

/** One page's text (cached). Scanned pages have none; their image is the only record. */
export function pageText(
  key: string,
  bytes: () => Promise<ArrayBuffer>,
  page: number
): Promise<string> {
  const id = `${key}#${page}`
  let text = texts.get(id)
  if (!text) {
    text = (async () => {
      const doc = await open(key, bytes)
      const pdfPage = await doc.getPage(
        Math.min(Math.max(1, page), doc.numPages)
      )
      const content = await pdfPage.getTextContent()
      let out = ""
      for (const item of content.items) {
        if (!("str" in item)) continue
        out += item.str
        out += item.hasEOL ? "\n" : " "
      }
      return out
        .replace(/[ \t]+/g, " ")
        .replace(/ *\n */g, "\n")
        .trim()
    })()
    texts.set(id, text)
    text.catch(() => texts.delete(id))
  }
  return text
}
