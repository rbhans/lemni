"use client"

import { Table01Icon } from "@hugeicons/core-free-icons"

import type { BoardPlugin } from "@/studio/plugins/types"

import { tablesAi } from "./ai-tools"
import { createTable, tablePointDrop } from "./table-points"
import { hasTableSelected, TableSection } from "./table-section"
import { TableShapeUtil } from "./table-shape"

function TablePreview() {
  return (
    <svg viewBox="0 0 48 32" className="size-full" aria-hidden>
      <rect
        x="1"
        y="1"
        width="46"
        height="30"
        rx="4"
        className="fill-card stroke-border"
      />
      <path d="M1 10h46M1 17h46M1 24h46" className="stroke-border" />
      {[13.5, 20.5, 27.5].map((y) => (
        <g key={y}>
          <rect
            x="6"
            y={y - 1}
            width="14"
            height="2"
            rx="1"
            className="fill-muted-foreground/50"
          />
          <rect
            x="32"
            y={y - 1}
            width="10"
            height="2"
            rx="1"
            className="fill-foreground/70"
          />
        </g>
      ))}
      <rect
        x="6"
        y="4.5"
        width="10"
        height="2"
        rx="1"
        className="fill-muted-foreground/40"
      />
    </svg>
  )
}

export const tables: BoardPlugin = {
  id: "tables",
  name: "Tables",
  version: "0.1.0",
  description:
    "Live point tables: sortable values and status, by point or by equipment, with CSV export. Drop points from the Station panel onto a table.",
  category: "data",
  icon: Table01Icon,
  ai: tablesAi,
  stage: "preview",
  optionalDependencies: ["niagara-baskstream"],
  shapeUtils: [TableShapeUtil],
  pointDrops: [tablePointDrop],
  libraryCollections: [
    {
      id: "tables",
      tab: { id: "data", label: "Data", order: 30 },
      title: "Tables",
      order: 20,
      items: [
        {
          id: "points-table",
          label: "Point table",
          keywords: ["table", "list", "grid", "values", "equipment"],
          preview: <TablePreview />,
          insert: ({ editor }, point) => createTable(editor, point),
        },
      ],
    },
  ],
  inspectorSections: [
    {
      id: "table",
      tab: "design",
      title: "Table",
      order: 15,
      when: hasTableSelected,
      component: TableSection,
    },
  ],
}
