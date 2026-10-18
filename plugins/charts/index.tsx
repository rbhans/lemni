"use client"

import { ChartLineData01Icon } from "@hugeicons/core-free-icons"

import { definePlugin } from "@/sdk"

import { chartsAi } from "./ai-tools"
import { chartPointDrop, createChart } from "./chart-points"
import { ChartSection, hasChartSelected } from "./chart-section"
import { ChartShapeUtil } from "./chart-shape"
import { GaugeShapeUtil } from "./gauge-shape"
import { StatShapeUtil } from "./stat-shape"
import {
  createGauge,
  createStat,
  gaugePointDrop,
  statPointDrop,
} from "./value-points"
import {
  GaugeSection,
  hasGaugeSelected,
  hasStatSelected,
  StatSection,
} from "./value-sections"

function StatPreview() {
  return (
    <svg viewBox="0 0 48 32" className="bas-chart size-full" aria-hidden>
      <rect
        x="1"
        y="1"
        width="46"
        height="30"
        rx="4"
        className="fill-card stroke-border"
      />
      <rect
        x="6"
        y="6"
        width="16"
        height="2"
        rx="1"
        className="fill-muted-foreground/50"
      />
      <rect
        x="6"
        y="11"
        width="20"
        height="6"
        rx="1.5"
        className="fill-foreground/80"
      />
      <path
        d="M6 26l6-3 5 2 6-4 5 1 6-3"
        fill="none"
        className="stroke-muted-foreground/50"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M34 19l7-2"
        fill="none"
        stroke="var(--series-0)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DialPreview() {
  return (
    <svg viewBox="0 0 48 32" className="bas-chart size-full" aria-hidden>
      <rect
        x="1"
        y="1"
        width="46"
        height="30"
        rx="4"
        className="fill-card stroke-border"
      />
      <path
        d="M15.3 24.5A10 10 0 1 1 32.7 24.5"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M15.3 24.5A10 10 0 0 1 28 11.3"
        fill="none"
        stroke="var(--series-0)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BarPreview() {
  return (
    <svg viewBox="0 0 48 32" className="bas-chart size-full" aria-hidden>
      <rect
        x="1"
        y="1"
        width="46"
        height="30"
        rx="4"
        className="fill-card stroke-border"
      />
      <rect
        x="6"
        y="8"
        width="14"
        height="5"
        rx="1.5"
        className="fill-foreground/80"
      />
      <rect
        x="6"
        y="18"
        width="36"
        height="3.5"
        rx="1.75"
        fill="var(--muted)"
      />
      <rect
        x="6"
        y="18"
        width="22"
        height="3.5"
        rx="1.75"
        fill="var(--series-0)"
      />
    </svg>
  )
}

function TrendPreview() {
  return (
    <svg viewBox="0 0 48 32" className="bas-chart size-full" aria-hidden>
      <rect
        x="1"
        y="1"
        width="46"
        height="30"
        rx="4"
        className="fill-card stroke-border"
      />
      <path d="M6 22h36" className="stroke-border" strokeWidth="1" />
      <path
        d="M6 20l7-5 6 3 7-9 6 4 10-5"
        fill="none"
        stroke="var(--series-0)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="6" y="25" width="14" height="3" rx="1" fill="var(--series-1)" />
      <rect x="26" y="25" width="16" height="3" rx="1" className="fill-muted" />
    </svg>
  )
}

export default definePlugin({
  id: "charts",
  name: "Charts",
  version: "0.1.0",
  description:
    "Trend charts, stat tiles and gauges with history rollups and live values. Drop points (or whole equipment folders) from the Station panel onto a widget, or onto the board to start one.",
  category: "data",
  icon: ChartLineData01Icon,
  ai: chartsAi,
  stage: "preview",
  optionalDependencies: ["niagara-baskstream"],
  shapeUtils: [ChartShapeUtil, StatShapeUtil, GaugeShapeUtil],
  pointDrops: [chartPointDrop, statPointDrop, gaugePointDrop],
  libraryCollections: [
    {
      id: "charts",
      tab: { id: "data", label: "Data", order: 30 },
      title: "Charts",
      order: 10,
      items: [
        {
          id: "trend",
          label: "Trend chart",
          keywords: ["chart", "trend", "history", "graph", "line"],
          preview: <TrendPreview />,
          insert: ({ editor }, point) => createChart(editor, point),
        },
        {
          id: "stat",
          label: "Stat tile",
          keywords: ["stat", "kpi", "value", "number", "tile", "sparkline"],
          preview: <StatPreview />,
          insert: ({ editor }, point) => createStat(editor, point),
        },
        {
          id: "gauge-dial",
          label: "Gauge",
          keywords: ["gauge", "dial", "meter", "speedometer"],
          preview: <DialPreview />,
          insert: ({ editor }, point) => createGauge(editor, point, "dial"),
        },
        {
          id: "gauge-bar",
          label: "Bar gauge",
          keywords: ["gauge", "bar", "meter", "level", "progress"],
          preview: <BarPreview />,
          insert: ({ editor }, point) => createGauge(editor, point, "bar"),
        },
      ],
    },
  ],
  inspectorSections: [
    {
      id: "chart",
      tab: "design",
      title: "Chart",
      order: 15,
      when: hasChartSelected,
      component: ChartSection,
    },
    {
      id: "stat",
      tab: "design",
      title: "Stat tile",
      order: 15,
      when: hasStatSelected,
      component: StatSection,
    },
    {
      id: "gauge",
      tab: "design",
      title: "Gauge",
      order: 15,
      when: hasGaugeSelected,
      component: GaugeSection,
    },
  ],
})
