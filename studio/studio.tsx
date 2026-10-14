"use client"

import { builtinPlugins } from "@/plugins"

import { BoardEditor } from "./editor/board-editor"
import { PluginRuntimeProvider } from "./plugins/runtime"
import { ShellLayout } from "./shell/shell-layout"

export function Studio() {
  return (
    <PluginRuntimeProvider plugins={builtinPlugins}>
      <ShellLayout>{(slots) => <BoardEditor slots={slots} />}</ShellLayout>
    </PluginRuntimeProvider>
  )
}
