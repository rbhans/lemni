"use client"

import { DashboardSquare01Icon } from "@hugeicons/core-free-icons"

import { definePlugin, type LibraryItem } from "@/sdk"

import { uiElementsAi } from "./ai-tools"
import {
  createElement,
  createPanel,
  elementPointDrop,
  panelPointDrop,
} from "./insert"
import { newElement, type UiKind } from "./model"
import {
  ElementSection,
  hasElementSelected,
  hasPanelSelected,
  PanelSection,
} from "./sections"
import { UiElementShapeUtil, UiPanelShapeUtil } from "./shapes"
import { WriteConfirm } from "./writes"

/** Library tiles: 48×32 drawings in the components' own colors, like the chart tiles. */
function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 48 32" className="size-full" aria-hidden>
      {children}
    </svg>
  )
}

const card = (
  <rect
    x="1"
    y="5"
    width="46"
    height="22"
    rx="4"
    className="fill-card stroke-border"
  />
)
const text = (x: number, y: number, w: number, strong = false) => (
  <rect
    x={x}
    y={y}
    width={w}
    height="2.4"
    rx="1.2"
    className={strong ? "fill-foreground/80" : "fill-muted-foreground/50"}
  />
)

const PREVIEWS: Record<UiKind | "panel", React.ReactNode> = {
  menu: (
    <Svg>
      <rect
        x="6"
        y="3"
        width="36"
        height="10"
        rx="3"
        className="fill-primary"
      />
      <rect
        x="10"
        y="7"
        width="16"
        height="2.2"
        rx="1.1"
        className="fill-primary-foreground"
      />
      <path
        d="M34 7l2 2 2-2"
        fill="none"
        strokeWidth="1.2"
        className="stroke-primary-foreground"
      />
      <rect
        x="6"
        y="15"
        width="36"
        height="15"
        rx="3"
        className="fill-popover stroke-border"
      />
      {text(10, 19, 18, true)}
      {text(10, 24.5, 14)}
    </Svg>
  ),
  nav: (
    <Svg>
      <rect
        x="1"
        y="10"
        width="46"
        height="12"
        rx="3.5"
        className="fill-card stroke-border"
      />
      <rect
        x="3"
        y="12"
        width="13"
        height="8"
        rx="2.5"
        className="fill-primary"
      />
      <rect
        x="6"
        y="14.9"
        width="7"
        height="2.2"
        rx="1.1"
        className="fill-primary-foreground"
      />
      {text(20, 14.9, 8)}
      {text(34, 14.9, 8)}
    </Svg>
  ),
  button: (
    <Svg>
      <rect
        x="6"
        y="9"
        width="36"
        height="14"
        rx="3.5"
        className="fill-primary"
      />
      <rect
        x="14"
        y="14.8"
        width="20"
        height="2.4"
        rx="1.2"
        className="fill-primary-foreground"
      />
    </Svg>
  ),
  switch: (
    <Svg>
      {card}
      {text(6, 14.8, 14)}
      <rect
        x="29"
        y="11.5"
        width="13"
        height="9"
        rx="4.5"
        className="fill-primary"
      />
      <circle cx="37.5" cy="16" r="3.3" className="fill-background" />
    </Svg>
  ),
  slider: (
    <Svg>
      {card}
      {text(6, 10, 14)}
      <rect x="6" y="19" width="36" height="2" rx="1" className="fill-muted" />
      <rect
        x="6"
        y="19"
        width="22"
        height="2"
        rx="1"
        className="fill-primary"
      />
      <rect
        x="25.5"
        y="16.5"
        width="6"
        height="7"
        rx="1.5"
        className="fill-background stroke-ring"
      />
    </Svg>
  ),
  setpoint: (
    <Svg>
      {card}
      <rect
        x="6"
        y="11"
        width="10"
        height="10"
        rx="2"
        className="fill-none stroke-border"
      />
      <path d="M8.5 16h5" className="stroke-foreground/70" strokeWidth="1.2" />
      {text(19, 14.8, 10, true)}
      <rect
        x="32"
        y="11"
        width="10"
        height="10"
        rx="2"
        className="fill-none stroke-border"
      />
      <path
        d="M34.5 16h5M37 13.5v5"
        className="stroke-foreground/70"
        strokeWidth="1.2"
      />
    </Svg>
  ),
  select: (
    <Svg>
      <rect
        x="4"
        y="9"
        width="40"
        height="14"
        rx="3"
        className="fill-card stroke-input"
      />
      {text(8, 14.8, 18, true)}
      <path
        d="M35 14l2.5-2 2.5 2M35 18l2.5 2 2.5-2"
        fill="none"
        className="stroke-muted-foreground"
        strokeWidth="1"
      />
    </Svg>
  ),
  badge: (
    <Svg>
      <rect
        x="8"
        y="10"
        width="32"
        height="12"
        rx="6"
        className="fill-primary"
      />
      <rect
        x="14"
        y="14.8"
        width="20"
        height="2.4"
        rx="1.2"
        className="fill-primary-foreground"
      />
    </Svg>
  ),
  progress: (
    <Svg>
      {card}
      {text(6, 10, 16)}
      <rect
        x="6"
        y="18.5"
        width="36"
        height="3"
        rx="1.5"
        className="fill-muted"
      />
      <rect
        x="6"
        y="18.5"
        width="24"
        height="3"
        rx="1.5"
        className="fill-primary"
      />
    </Svg>
  ),
  value: (
    <Svg>
      {card}
      {text(6, 14.8, 12)}
      {text(28, 14.3, 14, true)}
    </Svg>
  ),
  panel: (
    <Svg>
      <rect
        x="1"
        y="1"
        width="46"
        height="30"
        rx="4"
        className="fill-card stroke-border"
      />
      <path d="M1 9h46" className="stroke-border" />
      {text(5, 4, 12, true)}
      {text(5, 13, 10)}
      {text(32, 13, 10, true)}
      <path d="M5 19h38" className="stroke-border/60" />
      {text(5, 23, 10)}
      <rect
        x="32"
        y="21"
        width="10"
        height="6"
        rx="3"
        className="fill-primary"
      />
      <circle cx="39" cy="24" r="2.2" className="fill-background" />
    </Svg>
  ),
}

const ITEMS: { kind: UiKind; label: string; keywords: string[] }[] = [
  {
    kind: "button",
    label: "Button",
    keywords: ["button", "command", "go", "link", "navigate"],
  },
  {
    kind: "switch",
    label: "Switch",
    keywords: ["switch", "toggle", "on", "off", "start", "stop", "command"],
  },
  {
    kind: "setpoint",
    label: "Setpoint",
    keywords: ["setpoint", "stepper", "adjust", "temperature"],
  },
  {
    kind: "slider",
    label: "Slider",
    keywords: ["slider", "range", "speed", "position"],
  },
  {
    kind: "select",
    label: "Select",
    keywords: ["select", "dropdown", "mode", "multistate", "enum", "occupancy"],
  },
  {
    kind: "badge",
    label: "Badge",
    keywords: ["badge", "status", "state", "pill"],
  },
  {
    kind: "progress",
    label: "Progress",
    keywords: ["progress", "bar", "percent", "valve", "damper"],
  },
  {
    kind: "value",
    label: "Value",
    keywords: ["value", "readout", "label", "point"],
  },
  {
    kind: "menu",
    label: "Dropdown",
    keywords: ["dropdown", "menu", "navigation", "nav", "go to", "links"],
  },
  {
    kind: "nav",
    label: "Nav bar",
    keywords: ["nav", "navigation", "tabs", "menu bar", "pages", "links"],
  },
]

const items: LibraryItem[] = [
  ...ITEMS.map(({ kind, label, keywords }) => ({
    id: kind,
    label,
    keywords,
    preview: PREVIEWS[kind],
    insert: (
      { editor }: { editor: Parameters<typeof createElement>[0] },
      point: { x: number; y: number }
    ) => {
      createElement(editor, kind, point, newElement(kind))
    },
  })),
  {
    id: "panel",
    label: "Panel",
    keywords: ["panel", "card", "group", "faceplate", "rows"],
    preview: PREVIEWS.panel,
    insert: ({ editor }, point) => {
      createPanel(editor, point, [], "Panel")
    },
  },
]

export default definePlugin({
  id: "ui-elements",
  name: "UI elements",
  version: "0.1.0",
  description:
    "Buttons, switches, setpoints, sliders, selects, badges, progress bars, value readouts, dropdowns, nav bars and panels, made from the app's own shadcn components and bound to live points. Each can take its own color; buttons and dropdowns can carry an icon. Live in Present mode; every write is confirmed first.",
  category: "libraries",
  icon: DashboardSquare01Icon,
  stage: "preview",
  optionalDependencies: ["niagara-baskstream"],
  ai: uiElementsAi,
  shapeUtils: [UiElementShapeUtil, UiPanelShapeUtil],
  pointDrops: [elementPointDrop, panelPointDrop],
  canvasOverlays: [
    { id: "ui-write-confirm", order: 30, component: WriteConfirm },
  ],
  libraryCollections: [
    {
      id: "ui-elements",
      tab: { id: "ui", label: "UI", order: 40 },
      title: "Controls & readouts",
      order: 10,
      items,
    },
  ],
  inspectorSections: [
    {
      id: "ui-element",
      tab: "design",
      title: "UI element",
      order: 15,
      when: hasElementSelected,
      component: ElementSection,
    },
    {
      id: "ui-panel",
      tab: "design",
      title: "Panel",
      order: 15,
      when: hasPanelSelected,
      component: PanelSection,
    },
  ],
})
