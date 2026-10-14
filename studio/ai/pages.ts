"use client"

import type { Editor, TLPage, TLPageId } from "tldraw"

import { kindOf, type PageKind } from "../pages/categories"
import type { JsonSchema } from "./schema"

export const pageIdSchema: JsonSchema = {
  type: "string",
  description:
    "The page to put it on (default: the person's page). board_overview lists pages.",
}

/**
 * The page an AI tool should add things to: the one named, else the person's. It must
 * be a kind the thing belongs on (widgets go on UI pages); the view switches to it.
 */
export function pageForInsert(
  editor: Editor,
  pageId: string | undefined,
  kinds: readonly PageKind[],
  what: string
): TLPage {
  const page = pageId
    ? editor.getPage(pageId as TLPageId)
    : editor.getCurrentPage()
  if (!page) throw new Error(`No page ${pageId}. board_overview lists them.`)
  if (!kinds.includes(kindOf(page)))
    throw new Error(
      `${what} go on ${kinds.join(" or ")} pages, and "${page.name}" is a ${kindOf(page)} page. Pass the pageId of a ${kinds[0]} page (board_overview lists them).`
    )
  if (page.id !== editor.getCurrentPageId()) editor.setCurrentPage(page.id)
  return page
}
