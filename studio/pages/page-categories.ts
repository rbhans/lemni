"use client"

import { useMemo } from "react"
import {
  PageRecordType,
  useEditor,
  useValue,
  type Editor,
  type TLPage,
  type TLPageId,
} from "tldraw"

import { writeDocumentMeta } from "../lib/document-meta"
import { usePluginRuntime } from "../plugins/runtime"
import {
  customCategories,
  groupPages,
  kindOf,
  newCategoryId,
  nextPageName,
  type PageCategory,
  type PageKind,
} from "./categories"

/** The current page's kind. Reactive inside `useValue` / `when` callbacks. */
export function currentPageKind(editor: Editor): PageKind {
  return kindOf(editor.getCurrentPage())
}

export function pageKindOf(editor: Editor, pageId: TLPageId): PageKind {
  const page = editor.getPage(pageId)
  return page ? kindOf(page) : "ui"
}

/** Plugin categories plus the board's own, in display order. */
export function useCategories(): PageCategory[] {
  const editor = useEditor()
  const { contributions } = usePluginRuntime()
  const custom = useValue(
    "custom categories",
    () => customCategories(editor.getDocumentSettings().meta),
    [editor]
  )
  return useMemo(
    () =>
      [...contributions.pageCategories, ...custom].sort(
        (a, b) => a.order - b.order
      ),
    [contributions.pageCategories, custom]
  )
}

/** Every category with its pages. */
export function usePageGroups() {
  const editor = useEditor()
  const categories = useCategories()
  const pages = useValue("pages", () => editor.getPages(), [editor])
  return useMemo(() => groupPages(categories, pages), [categories, pages])
}

/** Adds a page to a category and opens it. */
export function createPageIn(editor: Editor, category: PageCategory): TLPageId {
  const id = PageRecordType.createId()
  editor.markHistoryStoppingPoint("add page")
  editor.run(() => {
    editor.createPage({
      id,
      name: nextPageName(
        category.label,
        category.kind,
        editor.getPages().map((page) => page.name)
      ),
      meta: { category: category.id, kind: category.kind },
    })
    editor.setCurrentPage(id)
  })
  return id
}

export function setPageCategory(
  editor: Editor,
  page: TLPage,
  category: PageCategory
) {
  editor.markHistoryStoppingPoint("move page to category")
  editor.updatePage({
    id: page.id,
    meta: { ...page.meta, category: category.id, kind: category.kind },
  })
}

type StoredCategory = { id: string; label: string; kind: PageKind }

function storedCategories(editor: Editor): StoredCategory[] {
  return customCategories(editor.getDocumentSettings().meta).map(
    ({ id, label, kind }) => ({ id, label, kind })
  )
}

function saveCategories(editor: Editor, categories: StoredCategory[]) {
  writeDocumentMeta(editor, {
    ...editor.getDocumentSettings().meta,
    categories,
  })
}

/** Adds a category to this board. Custom categories hold documents or UI pages. */
export function addCustomCategory(
  editor: Editor,
  label: string,
  kind: "ui" | "documents",
  takenIds: readonly string[]
): PageCategory {
  const id = newCategoryId(label, takenIds)
  editor.markHistoryStoppingPoint("add category")
  saveCategories(editor, [
    ...storedCategories(editor),
    { id, label: label.trim(), kind },
  ])
  return { id, label: label.trim(), kind, order: 50, custom: true }
}

export function renameCustomCategory(
  editor: Editor,
  id: string,
  label: string
) {
  editor.markHistoryStoppingPoint("rename category")
  saveCategories(
    editor,
    storedCategories(editor).map((c) =>
      c.id === id ? { ...c, label: label.trim() } : c
    )
  )
}

/** Removes a custom category; its pages move to the built-in category of their kind. */
export function removeCustomCategory(editor: Editor, category: PageCategory) {
  editor.markHistoryStoppingPoint("remove category")
  editor.run(() => {
    for (const page of editor.getPages()) {
      if (page.meta.category !== category.id) continue
      editor.updatePage({
        id: page.id,
        meta: {
          ...page.meta,
          category: category.kind === "documents" ? "documents" : "ui",
          kind: category.kind,
        },
      })
    }
    saveCategories(
      editor,
      storedCategories(editor).filter((c) => c.id !== category.id)
    )
  })
}
