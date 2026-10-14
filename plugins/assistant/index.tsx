"use client"

import { AiMagicIcon } from "@hugeicons/core-free-icons"

import { groupPages } from "@/studio/pages/categories"
import type { AiBoardTool, BoardPlugin } from "@/studio/plugins/types"
import { studioState } from "@/studio/state"

import { AiPanel } from "./ai-panel"
import { AiConnection } from "./connection"
import { AiStatus, TouchedLayer } from "./status"

// No chat in the board: people use the AI app they already have (Claude Code, Claude
// Desktop, Codex) over MCP. This plugin is the connection: it serves the tools other
// plugins contribute, keeps the access level, asks before writes and shows activity.

const ACCESS_NOTES = {
  off: "AI access is off.",
  read: "Read only: you can look at everything but change nothing.",
  edit: "You may change the board (each tool call is one undo step for the person). Station writes are off; the person can allow them in the AI panel.",
  full: "You may change the board and propose station writes. Each write waits for the person's Allow once in the board.",
}

const boardOverview: AiBoardTool = {
  name: "board_overview",
  title: "Look at the board",
  description:
    "Start here. Returns the board's name, its page categories and pages (ids, kinds, shape counts), the page and view the person is looking at, what's selected, your access level, and what each enabled plugin adds and how to use it.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  access: "read",
  run(ctx) {
    const { editor } = ctx
    const groups = groupPages(ctx.categories(), editor.getPages())
    const current = editor.getCurrentPage()
    const view = editor.getViewportPageBounds()
    const selected = editor.getSelectedShapes()
    return {
      text: `Board "${studioState.boardName.get()}". ${ACCESS_NOTES[ctx.access]}`,
      data: {
        categories: groups.map((group) => ({
          id: group.id,
          label: group.label,
          kind: group.kind,
          pages: group.pages.map((page) => ({
            id: page.id,
            name: page.name,
            shapes: editor.getPageShapeIds(page.id).size,
          })),
        })),
        pageKinds: {
          documents:
            "Project files (PDF and Word cards, spreadsheet tables) plus markup.",
          ui: "Operator graphics: library symbols, live widgets, behaviors.",
          wiresheet:
            "Generated from links. Change it with link tools, not drawing.",
        },
        current: {
          pageId: current.id,
          page: current.name,
          view: {
            x: Math.round(view.x),
            y: Math.round(view.y),
            w: Math.round(view.w),
            h: Math.round(view.h),
          },
          presenting: studioState.presenting.get(),
        },
        selection: selected
          .slice(0, 30)
          .map((shape) => ctx.describeShape(shape)),
        plugins: ctx.guides.map(({ name, guide }) => ({ name, guide })),
      },
    }
  },
}

export const assistant: BoardPlugin = {
  id: "assistant",
  name: "AI connection",
  version: "0.2.0",
  description:
    "Use your own AI app (Claude Code, Claude Desktop, Codex) on the board through MCP. You set what it may do; station writes always ask first.",
  category: "ai",
  icon: AiMagicIcon,
  stage: "preview",
  panels: [
    {
      id: "ai",
      title: "AI",
      icon: AiMagicIcon,
      side: "left",
      order: 90,
      workspaces: ["canvas"],
      width: 320,
      component: AiPanel,
    },
  ],
  topbarItems: [{ id: "ai-status", order: 5, component: AiStatus }],
  canvasOverlays: [{ id: "ai-connection", order: 50, component: AiConnection }],
  canvasLayers: [{ id: "ai-touched", order: 50, component: TouchedLayer }],
  ai: {
    guide:
      "Tools come from the board's plugins and run in the open board. Read first (board_overview, read_page, screenshot), then change. Keep related things in frames: frames are what people link and navigate to.",
    tools: [boardOverview],
  },
}
