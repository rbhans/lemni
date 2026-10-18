"use client"

import { createShapeId, type TLParentId } from "tldraw"

import {
  pageForInsert,
  pageIdSchema,
  type AiBoardTool,
  type AiContribution,
} from "@/sdk"

import { normalizeAddress } from "./model"
import { isWebShape, WEB_TYPE } from "./web-shape"

const createWebViewTool: AiBoardTool<{
  url: string
  title?: string
  x?: number
  y?: number
  w?: number
  h?: number
  pageId?: string
}> = {
  name: "create_web_view",
  title: "Add a web page",
  access: "edit",
  description:
    "Adds a live web page window to the person's page (left/top at x/y, default near the middle of the view). Some sites refuse to be shown inside other pages; the window then says so.",
  inputSchema: {
    type: "object",
    required: ["url"],
    additionalProperties: false,
    properties: {
      url: { type: "string", minLength: 3, maxLength: 2000 },
      title: { type: "string", maxLength: 120 },
      x: { type: "number" },
      y: { type: "number" },
      w: { type: "number", minimum: 200, maximum: 4000 },
      h: { type: "number", minimum: 150, maximum: 4000 },
      pageId: pageIdSchema,
    },
  },
  run({ editor }, input) {
    pageForInsert(editor, input.pageId, ["ui", "documents"], "Web views")
    const address = normalizeAddress(input.url, window.location.origin)
    if ("error" in address) throw new Error(address.error)
    const w = input.w ?? 800
    const h = input.h ?? 520
    const center = editor.getViewportPageBounds().center
    const id = createShapeId()
    editor.createShape({
      id,
      type: WEB_TYPE,
      parentId: editor.getCurrentPageId() as TLParentId,
      x: input.x ?? center.x - w / 2,
      y: input.y ?? center.y - h / 2,
      props: { w, h, url: address.url, title: input.title ?? "" },
    })
    return { text: `Added a web view of ${address.url}.`, data: { id } }
  },
}

export const webViewAi: AiContribution = {
  tools: [createWebViewTool],
  shapes: {
    [WEB_TYPE]: (_editor, shape) =>
      isWebShape(shape)
        ? {
            webPage: shape.props.url || "(no address yet)",
            title: shape.props.title || undefined,
          }
        : null,
  },
}
