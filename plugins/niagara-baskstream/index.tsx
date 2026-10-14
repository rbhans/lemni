"use client"

import { ServerStack01Icon } from "@hugeicons/core-free-icons"

import type { BoardPlugin } from "@/studio/plugins/types"

import { niagaraAi } from "./client/ai-tools"
import { disconnectLocal, restore } from "./client/lifecycle"
import { ConnectionPill, LivePointsStatus } from "./components/connection-pill"
import { StationPanel } from "./components/station-panel"

export const niagaraBaskstream: BoardPlugin = {
  id: "niagara-baskstream",
  name: "Niagara · baskStream",
  version: "0.1.0",
  description:
    "Station tree, search, live values, history and alarms through the baskStream SDK. AI apps can propose point writes and alarm acknowledgements, each approved by you.",
  category: "connections",
  icon: ServerStack01Icon,
  stage: "preview",
  optionalDependencies: ["behaviors"],
  ai: niagaraAi,
  panels: [
    {
      id: "station",
      title: "Station",
      icon: ServerStack01Icon,
      side: "left",
      order: 30,
      workspaces: ["canvas"],
      width: 300,
      component: StationPanel,
    },
  ],
  topbarItems: [{ id: "connection", order: 10, component: ConnectionPill }],
  statusItems: [
    { id: "live-points", align: "end", order: 5, component: LivePointsStatus },
  ],
  onEditorMount() {
    void restore()
    // Turning the plugin off stops live values in this tab; the server keeps the
    // connection so turning it back on (or reloading) picks it up again.
    return () => disconnectLocal()
  },
}
