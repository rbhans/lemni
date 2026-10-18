"use client"

import type { Editor, TLPageId, TLShapeId } from "tldraw"

import {
  createLink,
  deleteLink,
  endLabel,
  endPlace,
  getLinks,
  isLinkable,
  linksOf,
  pickSource,
  pointLabel,
  setLinkComment,
  type AiBoardTool,
  type AiContribution,
  type JsonSchema,
  type LinkEnd,
} from "@/sdk"

// Links for AI apps: what's linked to what and why (the comments are the point: they
// tell an AI how a control drawing, a floor plan and a graphic relate).

interface EndInput {
  shapeId?: string
  page?: number
  pageId?: string
  point?: string
  source?: string
  label?: string
}

const endSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  description:
    "One of: {shapeId} for a frame or document card, {shapeId, page} for one page of a document card, {pageId} for a whole page, {point} (an ord) for a station point or folder.",
  properties: {
    shapeId: { type: "string" },
    page: { type: "integer", minimum: 1 },
    pageId: { type: "string" },
    point: { type: "string", minLength: 3 },
    source: { type: "string" },
    label: { type: "string", maxLength: 200 },
  },
}

function toEnd(editor: Editor, input: EndInput): LinkEnd {
  if (input.point) {
    const source = pickSource(input.source)
    return {
      kind: "point",
      source: source.id,
      point: input.point,
      label: input.label ?? pointLabel(input.point),
    }
  }
  if (input.pageId) {
    if (!editor.getPage(input.pageId as TLPageId))
      throw new Error(`No page ${input.pageId}.`)
    return { kind: "page", pageId: input.pageId }
  }
  if (input.shapeId) {
    const shape = editor.getShape(input.shapeId as TLShapeId)
    if (!shape) throw new Error(`No shape ${input.shapeId}.`)
    if (!isLinkable(shape))
      throw new Error(
        `${input.shapeId} can't be linked: link frames, document cards, pages or station points. Wrap shapes in a frame first (arrange_shapes action 'frame').`
      )
    if (input.page !== undefined) {
      const count = (shape.props as { pageCount?: number }).pageCount
      if (!count) throw new Error(`${input.shapeId} has no pages.`)
      if (input.page > count) throw new Error(`It has ${count} pages.`)
      return { kind: "docPage", shapeId: shape.id, page: input.page }
    }
    return { kind: "shape", shapeId: shape.id }
  }
  throw new Error("Say what to link: shapeId, pageId or point.")
}

function describeEnd(editor: Editor, end: LinkEnd) {
  const base = { label: endLabel(editor, end), place: endPlace(editor, end) }
  switch (end.kind) {
    case "shape":
      return { ...base, shapeId: end.shapeId }
    case "docPage":
      return { ...base, shapeId: end.shapeId, page: end.page }
    case "page":
      return { ...base, pageId: end.pageId }
    case "point":
      return { ...base, point: end.point, source: end.source }
  }
}

const listLinks: AiBoardTool<{ about?: EndInput }> = {
  name: "list_links",
  title: "Read links",
  access: "read",
  description:
    "Every link on the board (or only those touching `about`), with both ends described and the comment that says how they relate. Links have no direction.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: { about: endSchema },
  },
  run({ editor }, input) {
    let links = getLinks(editor)
    if (input.about) links = linksOf(links, toEnd(editor, input.about))
    return {
      text: `${links.length} link(s).`,
      data: links.map((link) => ({
        id: link.id,
        a: describeEnd(editor, link.a),
        b: describeEnd(editor, link.b),
        comment: link.comment || undefined,
      })),
    }
  },
}

const createLinkTool: AiBoardTool<{
  a: EndInput
  b: EndInput
  comment?: string
}> = {
  name: "create_link",
  title: "Link two things",
  access: "edit",
  description:
    "Links two things (frames, document cards or one of their pages, pages, station points) with a comment saying how they relate, e.g. 'Sequence of operation for this graphic'. The wire sheet shows links.",
  inputSchema: {
    type: "object",
    required: ["a", "b"],
    additionalProperties: false,
    properties: {
      a: endSchema,
      b: endSchema,
      comment: { type: "string", maxLength: 2000 },
    },
  },
  run({ editor }, input) {
    const a = toEnd(editor, input.a)
    const b = toEnd(editor, input.b)
    const link = createLink(editor, a, b)
    if (!link)
      throw new Error(
        "Those are already linked, or that would link something to itself."
      )
    if (input.comment) setLinkComment(editor, link.id, input.comment)
    return {
      text: `Linked ${endLabel(editor, a)} and ${endLabel(editor, b)}.`,
      data: { id: link.id },
    }
  },
}

const updateLink: AiBoardTool<{ id: string; comment: string }> = {
  name: "update_link_comment",
  title: "Edit a link's comment",
  access: "edit",
  description: "Replaces a link's comment.",
  inputSchema: {
    type: "object",
    required: ["id", "comment"],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      comment: { type: "string", maxLength: 2000 },
    },
  },
  run({ editor }, input) {
    if (!getLinks(editor).some((l) => l.id === input.id))
      throw new Error(`No link ${input.id}.`)
    setLinkComment(editor, input.id, input.comment)
    return { text: "Comment saved." }
  },
}

const removeLink: AiBoardTool<{ id: string }> = {
  name: "delete_link",
  title: "Remove a link",
  access: "edit",
  description: "Removes a link (the linked things stay).",
  inputSchema: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: { id: { type: "string" } },
  },
  run({ editor }, input) {
    if (!getLinks(editor).some((l) => l.id === input.id))
      throw new Error(`No link ${input.id}.`)
    deleteLink(editor, input.id)
    return { text: "Link removed." }
  },
}

export const linksAi: AiContribution = {
  guide:
    "Links connect frames, document cards (or single pages of them), pages and station points across the board, each with a comment saying how they relate. Read them (list_links) to understand a project; make them (create_link) with a clear comment. Links have no direction.",
  tools: [listLinks, createLinkTool, updateLink, removeLink],
  shapes: {
    "*": (editor, shape) => {
      if (!isLinkable(shape)) return null
      const count = linksOf(getLinks(editor), {
        kind: "shape",
        shapeId: shape.id,
      }).length
      return count ? { links: count } : null
    },
  },
}
