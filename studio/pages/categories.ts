// Page categories: every page belongs to one, and its kind decides which tools and
// panels apply there. Pure (no React, no DOM, relative imports only) so `node --test`
// can run it.

/** What a category's pages are for. */
export type PageKind = "ui" | "documents" | "wiresheet"

export const PAGE_KINDS: readonly PageKind[] = ["ui", "documents", "wiresheet"]

export interface PageCategory {
  id: string
  label: string
  kind: PageKind
  order: number
  /** Holds a single page (the generated wire sheet). */
  single?: boolean
  /** Made by someone on this board (stored in the board), not by a plugin. */
  custom?: boolean
}

/** Enough of a tldraw page for grouping. */
export interface PageLike {
  id: string
  name: string
  meta: Readonly<Record<string, unknown>>
}

/** Pages made before categories existed are UI pages. */
export const DEFAULT_CATEGORY = "ui"

const isKind = (value: unknown): value is PageKind =>
  PAGE_KINDS.includes(value as PageKind)

export function categoryIdOf(page: PageLike): string {
  const id = page.meta.category
  return typeof id === "string" && id ? id : DEFAULT_CATEGORY
}

export function kindOf(page: PageLike): PageKind {
  return isKind(page.meta.kind) ? page.meta.kind : "ui"
}

/** Custom categories saved in the board's document settings. */
export function customCategories(
  documentMeta: Readonly<Record<string, unknown>>
): PageCategory[] {
  const list = documentMeta.categories
  if (!Array.isArray(list)) return []
  return list.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return []
    const { id, label, kind } = entry as Record<string, unknown>
    if (typeof id !== "string" || typeof label !== "string" || !isKind(kind))
      return []
    // Custom categories hold documents or UI pages; the wire sheet is generated.
    if (kind === "wiresheet") return []
    return [{ id, label, kind, order: 50 + index / 100, custom: true }]
  })
}

export interface CategoryWithPages<P extends PageLike> extends PageCategory {
  pages: P[]
}

/**
 * Categories in display order, each with its pages (in page order). A page whose
 * category is unknown (its plugin is off, say) still shows, under its own id.
 */
export function groupPages<P extends PageLike>(
  categories: readonly PageCategory[],
  pages: readonly P[]
): CategoryWithPages<P>[] {
  const out = new Map<string, CategoryWithPages<P>>()
  for (const category of [...categories].sort((a, b) => a.order - b.order))
    out.set(category.id, { ...category, pages: [] })
  for (const page of pages) {
    const id = categoryIdOf(page)
    let group = out.get(id)
    if (!group) {
      group = { id, label: id, kind: kindOf(page), order: 1000, pages: [] }
      out.set(id, group)
    }
    group.pages.push(page)
  }
  return [...out.values()]
}

/** A stable id for a new custom category. */
export function newCategoryId(label: string, taken: readonly string[]) {
  const base =
    "custom-" +
    (label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "category")
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

/** "Page 3", or "<Category> 2" in categories that aren't plain pages. */
export function nextPageName(
  label: string,
  kind: PageKind,
  names: readonly string[]
) {
  const base = kind === "ui" ? "Page" : label
  const taken = new Set(names)
  for (let n = 1; ; n++) {
    const name = n === 1 && kind !== "ui" ? base : `${base} ${n}`
    if (!taken.has(name)) return name
  }
}
