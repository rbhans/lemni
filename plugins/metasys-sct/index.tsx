"use client"

import { definePlugin } from "@/sdk"

import { detach, restore, SCT_ICON, sctRailIcon } from "./client/store"
import "./client/tree-state"
import { ArchivePanel } from "./components/archive-panel"

export default definePlugin({
  id: "metasys-sct",
  name: "Metasys · SCT archive",
  version: "0.1.0",
  description:
    "Open an offline SCT archive restored to SQL Server: the network tree of engines, trunks, controllers and points, with each point's type and stored value. Read only.",
  category: "connections",
  icon: SCT_ICON,
  stage: "preview",
  panels: [
    {
      id: "sct-archive",
      title: "Metasys archive",
      railLabel: "Metasys",
      group: "connections",
      icon: SCT_ICON,
      currentIcon: sctRailIcon,
      side: "left",
      order: 35,
      workspaces: ["canvas"],
      width: 300,
      component: ArchivePanel,
    },
  ],
  onEditorMount() {
    void restore()
    // The server keeps the archive open, so turning the plugin back on picks it up.
    return () => void detach()
  },
})
