// Where a click can take you: a page, any shape, one page of a document card, a
// station point, or a web address. Stored as one string so it fits anywhere a setting
// does (behavior params, shape props). Plain page and shape ids are targets as they
// are, so targets saved before this module still work. Pure (relative imports only)
// so `node --test` can run it.

export type NavTarget =
  | { kind: "page"; pageId: string }
  | { kind: "shape"; shapeId: string }
  | { kind: "docPage"; shapeId: string; page: number }
  | { kind: "point"; source: string; point: string; label: string }
  | { kind: "url"; href: string }

export function serializeTarget(target: NavTarget): string {
  switch (target.kind) {
    case "page":
      return target.pageId
    case "shape":
      return target.shapeId
    case "docPage":
      return `doc:${target.shapeId}#${target.page}`
    case "point":
      return `point:${target.source}\n${target.point}\n${target.label}`
    case "url":
      return `url:${target.href}`
  }
}

/** Reads a stored target; null for empty or unknown strings. */
export function parseTarget(value: unknown): NavTarget | null {
  if (typeof value !== "string" || !value) return null
  if (value.startsWith("page:")) return { kind: "page", pageId: value }
  if (value.startsWith("shape:")) return { kind: "shape", shapeId: value }
  if (value.startsWith("doc:")) {
    const hash = value.lastIndexOf("#")
    const page = Number(value.slice(hash + 1))
    if (hash < 0 || !Number.isInteger(page) || page < 1) return null
    const shapeId = value.slice(4, hash)
    return shapeId.startsWith("shape:")
      ? { kind: "docPage", shapeId, page }
      : null
  }
  if (value.startsWith("point:")) {
    const [source, point, label] = value.slice(6).split("\n")
    if (!source || !point) return null
    return {
      kind: "point",
      source,
      point,
      label: label || point.split("/").pop() || point,
    }
  }
  if (value.startsWith("url:")) {
    const href = safeUrl(value.slice(4))
    return href ? { kind: "url", href } : null
  }
  return null
}

/** An http(s) address, with https:// added when the scheme is missing; else null. */
export function safeUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text)
    ? text
    : `https://${text}`
  try {
    const url = new URL(withScheme)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}
