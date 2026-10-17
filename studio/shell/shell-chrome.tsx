"use client"

import { createPortal } from "react-dom"

import { CommandPalette } from "./command-palette"
import { LeftDock, RightDock } from "./docks"
import { PanelRail } from "./panel-rail"
import { PluginManagerDialog } from "./plugin-manager"
import { SettingsDialog } from "./settings-dialog"
import { ShortcutSheet } from "./shortcut-sheet"
import type { ShellSlots } from "./shell-layout"
import { StatusBar } from "./status-bar"
import { TopBar } from "./top-bar"
import { UnsavedChangesDialog } from "./unsaved-dialog"

export function ShellChrome({ slots }: { slots: ShellSlots }) {
  return (
    <>
      {createPortal(<TopBar />, slots.top)}
      {createPortal(<PanelRail />, slots.rail)}
      {createPortal(<LeftDock />, slots.left)}
      {createPortal(<RightDock />, slots.right)}
      {createPortal(<StatusBar />, slots.status)}
      <PluginManagerDialog />
      <SettingsDialog />
      <CommandPalette />
      <ShortcutSheet />
      <UnsavedChangesDialog />
    </>
  )
}
