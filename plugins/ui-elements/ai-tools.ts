"use client"

import type { TLShapeId } from "tldraw"

import {
  pickSource,
  pointIdSchema,
  pointLabel,
  sourceSchema,
} from "@/studio/ai/points"
import { pageForInsert, pageIdSchema } from "@/studio/ai/pages"
import type { AiBoardTool, AiContribution } from "@/studio/plugins/types"

import {
  createElement,
  createPanel,
  setPanelRows,
  updateElement,
} from "./insert"
import {
  BUTTON_VARIANTS,
  elementLabel,
  newElement,
  normalizeElement,
  UI_KINDS,
  type UiElement,
  type UiKind,
} from "./model"
import {
  ELEMENT_TYPE,
  elementOf,
  isElementShape,
  isPanelShape,
  PANEL_TYPE,
  rowsOf,
} from "./shapes"

// AI apps can lay out controls and panels, but never press them: a control's writes
// happen only when a person uses it in Present mode and confirms. (AI writes go through
// the connection's own write tool and its approval.)

interface ElementInput {
  kind: UiKind
  label?: string
  point?: string
  source?: string
  onClick?: "go" | "write"
  writeValue?: string
  target?: string
  variant?: string
  min?: number
  max?: number
  step?: number
  onText?: string
  offText?: string
  options?: string[]
  writeMode?: "set" | "override"
  overrideSec?: number
  releasable?: boolean
  color?: string
  icon?: string
  iconPosition?: "start" | "end" | "only"
  links?: { label?: string; target?: string; icon?: string }[]
  layout?: "row" | "column"
}

const elementSchema = {
  type: "object",
  required: ["kind"],
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: [...UI_KINDS],
      description:
        "button (go to a target, or write a fixed value), switch (on/off point), slider and setpoint (numeric point; setpoint steps then Sets), select (multistate point), badge (status or on/off), progress (0–100 bar), value (label + live value), menu (a dropdown of links), nav (a bar of links that highlights the current page).",
    },
    label: { type: "string", maxLength: 120 },
    point: {
      ...pointIdSchema,
      description: "The point it shows or writes (from find_points).",
    },
    source: sourceSchema,
    onClick: { type: "string", enum: ["go", "write"] },
    writeValue: {
      type: "string",
      maxLength: 200,
      description: "Button with onClick 'write': the value it writes.",
    },
    target: {
      type: "string",
      maxLength: 2000,
      description:
        "Button with onClick 'go': a page id, a shape id, 'doc:<shapeId>#<page>', 'url:https://…', or 'point:<source>\\n<ord>\\n<label>'.",
    },
    variant: { type: "string", enum: [...BUTTON_VARIANTS] },
    min: { type: "number" },
    max: { type: "number" },
    step: { type: "number", exclusiveMinimum: 0 },
    onText: { type: "string", maxLength: 40 },
    offText: { type: "string", maxLength: 40 },
    options: {
      type: "array",
      maxItems: 50,
      items: { type: "string", maxLength: 200 },
    },
    writeMode: { type: "string", enum: ["set", "override"] },
    overrideSec: { type: "integer", minimum: 0, maximum: 604800 },
    releasable: {
      type: "boolean",
      description: "Show an Auto button to release an override.",
    },
    color: {
      type: "string",
      maxLength: 7,
      description:
        "Accent color as #rrggbb (button fill, switch track, slider, progress, badge, nav highlight). Omit for the theme color.",
    },
    icon: {
      type: "string",
      maxLength: 64,
      description:
        "Button or menu: a Hugeicons icon export name, e.g. 'Home01Icon', 'Fan01Icon', 'ThermometerIcon'.",
    },
    iconPosition: { type: "string", enum: ["start", "end", "only"] },
    links: {
      type: "array",
      maxItems: 20,
      description:
        "Menu and nav: the entries, each with a label, a target (same forms as a button's target) and an optional icon.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string", maxLength: 120 },
          target: { type: "string", maxLength: 2000 },
          icon: { type: "string", maxLength: 64 },
        },
      },
    },
    layout: {
      type: "string",
      enum: ["row", "column"],
      description: "Nav: links side by side (row) or stacked (column).",
    },
  },
} as const

function toElement(input: ElementInput): UiElement {
  const { point, source, ...rest } = input
  const fields = point
    ? { source: pickSource(source).id, point, pointLabel: pointLabel(point) }
    : {}
  return newElement(input.kind, { ...(rest as Partial<UiElement>), ...fields })
}

const createUiElements: AiBoardTool<{
  elements: (ElementInput & { x?: number; y?: number })[]
  pageId?: string
}> = {
  name: "create_ui_elements",
  title: "Add UI controls",
  access: "edit",
  description:
    "Adds single UI elements (shadcn controls and readouts) to a UI page, each centered at its x/y (default: stacked in the middle of the view). Controls work in Present mode and every write they make asks the person to confirm. Returns their ids.",
  inputSchema: {
    type: "object",
    required: ["elements"],
    additionalProperties: false,
    properties: {
      elements: {
        type: "array",
        minItems: 1,
        maxItems: 40,
        items: {
          ...elementSchema,
          properties: {
            ...elementSchema.properties,
            x: { type: "number" },
            y: { type: "number" },
          },
        },
      },
      pageId: pageIdSchema,
    },
  },
  run({ editor }, input) {
    pageForInsert(editor, input.pageId, ["ui"], "UI elements")
    const center = editor.getViewportPageBounds().center
    const ids = input.elements.map(({ x, y, ...el }, i) =>
      createElement(
        editor,
        el.kind,
        { x: x ?? center.x, y: y ?? center.y + i * 64 },
        toElement(el)
      )
    )
    return { text: `Added ${ids.length} element(s).`, data: { ids } }
  },
}

const createUiPanel: AiBoardTool<{
  title?: string
  rows: ElementInput[]
  x?: number
  y?: number
  pageId?: string
}> = {
  name: "create_ui_panel",
  title: "Add a control panel",
  access: "edit",
  description:
    "Adds a panel: a card with a title and rows of UI elements (value readouts, switches, setpoints, selects, buttons…), e.g. an AHU's key points and commands. Returns its id.",
  inputSchema: {
    type: "object",
    required: ["rows"],
    additionalProperties: false,
    properties: {
      title: { type: "string", maxLength: 120 },
      rows: { type: "array", minItems: 1, maxItems: 40, items: elementSchema },
      x: { type: "number" },
      y: { type: "number" },
      pageId: pageIdSchema,
    },
  },
  run({ editor }, input) {
    pageForInsert(editor, input.pageId, ["ui"], "Panels")
    const center = editor.getViewportPageBounds().center
    const id = createPanel(
      editor,
      { x: input.x ?? center.x, y: input.y ?? center.y },
      input.rows.map(toElement),
      input.title ?? "Panel"
    )
    return { text: "Added a panel.", data: { id } }
  },
}

const updateUiElement: AiBoardTool<{
  id: string
  row?: number
  changes: Omit<ElementInput, "kind"> & { kind?: UiKind }
}> = {
  name: "update_ui_element",
  title: "Change a UI element",
  access: "edit",
  description:
    "Changes a UI element, or one row of a panel (row: 0-based index). Only the fields given change.",
  inputSchema: {
    type: "object",
    required: ["id", "changes"],
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      row: { type: "integer", minimum: 0 },
      changes: { ...elementSchema, required: [] },
    },
  },
  run({ editor }, input) {
    const shape = editor.getShape(input.id as TLShapeId)
    const { point, source, ...rest } = input.changes
    const patch: Partial<UiElement> = {
      ...(rest as Partial<UiElement>),
      ...(point
        ? {
            source: pickSource(source).id,
            point,
            pointLabel: pointLabel(point),
          }
        : {}),
    }
    if (isElementShape(shape)) {
      updateElement(editor, shape, patch)
      return { text: `Changed ${elementLabel(elementOf(shape))}.` }
    }
    if (isPanelShape(shape)) {
      const rows = rowsOf(shape)
      if (input.row === undefined || !rows[input.row])
        throw new Error(`Give a row from 0 to ${rows.length - 1}.`)
      rows[input.row] = normalizeElement({ ...rows[input.row], ...patch })
      setPanelRows(editor, shape, rows)
      return { text: `Changed row ${input.row}.` }
    }
    throw new Error(`${input.id} isn't a UI element or panel.`)
  },
}

const describe = (el: UiElement) => ({
  kind: el.kind,
  label: elementLabel(el),
  point: el.point || undefined,
  ...(el.kind === "button"
    ? el.onClick === "go"
      ? { goesTo: el.target || undefined }
      : { writes: el.writeValue }
    : {}),
  ...(el.kind === "menu" || el.kind === "nav"
    ? {
        links: el.links.map((l) => ({
          label: l.label,
          goesTo: l.target || undefined,
        })),
      }
    : {}),
  ...(el.color ? { color: el.color } : {}),
  ...(el.icon ? { icon: el.icon } : {}),
})

export const uiElementsAi: AiContribution = {
  guide:
    "create_ui_elements and create_ui_panel build operator UIs from the app's own components: value readouts, switches, setpoints, selects, badges, progress bars, buttons that go somewhere or write a fixed value, and dropdowns and nav bars of links for moving between pages. Any element can take an accent color; buttons and dropdowns can carry a Hugeicons icon. They're live in Present mode; every write a person makes with them is confirmed first. You can't press them.",
  tools: [
    createUiElements,
    createUiPanel,
    updateUiElement,
  ] as AiContribution["tools"],
  shapes: {
    [ELEMENT_TYPE]: (_editor, shape) =>
      isElementShape(shape)
        ? { widget: "UI element", ...describe(elementOf(shape)) }
        : null,
    [PANEL_TYPE]: (_editor, shape) =>
      isPanelShape(shape)
        ? {
            widget: "UI panel",
            title: shape.props.title || undefined,
            rows: rowsOf(shape).map(describe),
          }
        : null,
  },
}
