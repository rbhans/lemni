// Links between things on a board (frames, document pages, pages, station items),
// each with an optional comment. Links have no direction; any relationship goes in
// the comment. Pure (no React, no DOM, relative imports only) so `node --test` can
// run it.

export type LinkEnd =
  /** A frame (or a document card as a whole). */
  | { kind: "shape"; shapeId: string }
  /** One page of a document card (1-based). */
  | { kind: "docPage"; shapeId: string; page: number }
  /** A whole board page. */
  | { kind: "page"; pageId: string }
  /** A station point or folder. */
  | { kind: "point"; source: string; point: string; label: string }

export interface BoardLink {
  id: string
  a: LinkEnd
  b: LinkEnd
  comment: string
}

export function endKey(end: LinkEnd): string {
  switch (end.kind) {
    case "shape":
      return `shape:${end.shapeId}`
    case "docPage":
      return `doc:${end.shapeId}#${end.page}`
    case "page":
      return `page:${end.pageId}`
    case "point":
      return `point:${end.source}\n${end.point}`
  }
}

export const sameEnd = (a: LinkEnd, b: LinkEnd) => endKey(a) === endKey(b)

/** The shape an end lives on, if any. */
export const shapeOf = (end: LinkEnd): string | null =>
  end.kind === "shape" || end.kind === "docPage" ? end.shapeId : null

function isEnd(value: unknown): value is LinkEnd {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  switch (v.kind) {
    case "shape":
      return typeof v.shapeId === "string"
    case "docPage":
      return typeof v.shapeId === "string" && Number.isInteger(v.page)
    case "page":
      return typeof v.pageId === "string"
    case "point":
      return typeof v.source === "string" && typeof v.point === "string"
    default:
      return false
  }
}

/** Links saved in the board's document settings (bad entries are skipped). */
export function readLinks(
  meta: Readonly<Record<string, unknown>>
): BoardLink[] {
  const list = meta.links
  if (!Array.isArray(list)) return []
  return list.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const { id, a, b, comment } = entry as Record<string, unknown>
    if (typeof id !== "string" || !isEnd(a) || !isEnd(b)) return []
    return [
      {
        id,
        a: {
          ...a,
          ...(a.kind === "point" ? { label: String(a.label ?? a.point) } : {}),
        },
        b: {
          ...b,
          ...(b.kind === "point" ? { label: String(b.label ?? b.point) } : {}),
        },
        comment: typeof comment === "string" ? comment : "",
      },
    ]
  })
}

export const connects = (link: BoardLink, x: LinkEnd, y: LinkEnd) =>
  (sameEnd(link.a, x) && sameEnd(link.b, y)) ||
  (sameEnd(link.a, y) && sameEnd(link.b, x))

/**
 * Which side of a link is "here" for an end: a document card's links to its own pages
 * count from the page's side.
 */
export function sideOf(link: BoardLink, end: LinkEnd): LinkEnd {
  if (end.kind !== "shape") return end
  for (const side of [link.a, link.b])
    if (side.kind === "docPage" && side.shapeId === end.shapeId) return side
  return end
}

/** The end that isn't `end`. */
export const otherEnd = (link: BoardLink, end: LinkEnd) =>
  sameEnd(link.a, end) ? link.b : link.a

/**
 * Links touching an end. A document card's own end also collects the links to its
 * pages, so the card's badge counts everything.
 */
export function linksOf(links: readonly BoardLink[], end: LinkEnd) {
  const key = endKey(end)
  const shape = end.kind === "shape" ? end.shapeId : null
  const touches = (e: LinkEnd) =>
    endKey(e) === key ||
    (shape !== null && e.kind === "docPage" && e.shapeId === shape)
  return links.filter((link) => touches(link.a) || touches(link.b))
}

export type AddResult =
  | { links: BoardLink[]; link: BoardLink }
  | { links: BoardLink[]; error: string }

/** Adds a link unless it would link something to itself or already exists. */
export function withLink(
  links: readonly BoardLink[],
  a: LinkEnd,
  b: LinkEnd,
  id: string
): AddResult {
  if (sameEnd(a, b))
    return { links: [...links], error: "Something can't be linked to itself." }
  if (links.some((link) => connects(link, a, b)))
    return { links: [...links], error: "Those are already linked." }
  const link: BoardLink = { id, a, b, comment: "" }
  return { links: [...links, link], link }
}

export const withoutLink = (links: readonly BoardLink[], id: string) =>
  links.filter((link) => link.id !== id)

export const withComment = (
  links: readonly BoardLink[],
  id: string,
  comment: string
) => links.map((link) => (link.id === id ? { ...link, comment } : link))

/** Drops links to shapes or pages that no longer exist. */
export function prune(
  links: readonly BoardLink[],
  gone: { shapes?: ReadonlySet<string>; pages?: ReadonlySet<string> }
) {
  const dead = (end: LinkEnd) => {
    const shape = shapeOf(end)
    if (shape && gone.shapes?.has(shape)) return true
    return end.kind === "page" && Boolean(gone.pages?.has(end.pageId))
  }
  const kept = links.filter((link) => !dead(link.a) && !dead(link.b))
  return { links: kept, removed: links.length - kept.length }
}

/**
 * Links captured when shapes were copied, re-pointed at the pasted copies. A link
 * between two copied shapes joins the two copies; a link to something that wasn't
 * copied joins the copy to that same thing.
 */
export function remapLinks(
  captured: readonly BoardLink[],
  ids: ReadonlyMap<string, string>,
  newId: () => string
): BoardLink[] {
  const remap = (end: LinkEnd): LinkEnd => {
    const shape = shapeOf(end)
    const next = shape ? ids.get(shape) : undefined
    if (!next) return end
    return end.kind === "docPage"
      ? { ...end, shapeId: next }
      : { kind: "shape", shapeId: next }
  }
  return captured.flatMap((link) => {
    const a = remap(link.a)
    const b = remap(link.b)
    // Nothing was copied on either side: the link already exists as it is.
    if (sameEnd(a, link.a) && sameEnd(b, link.b)) return []
    return [{ id: newId(), a, b, comment: link.comment }]
  })
}
