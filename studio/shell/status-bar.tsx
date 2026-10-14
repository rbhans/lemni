"use client"

import { PluginBoundary } from "../plugins/plugin-boundary"
import { usePluginRuntime } from "../plugins/runtime"

export function StatusBar() {
  const { contributions } = usePluginRuntime()
  const start = contributions.statusItems.filter(
    (item) => item.align === "start"
  )
  const end = contributions.statusItems.filter((item) => item.align === "end")

  return (
    <footer className="flex h-7 items-center gap-3.5 border-t bg-sidebar px-3 text-[11px] text-muted-foreground">
      {start.map(({ id, pluginId, component: Item }) => (
        <PluginBoundary key={id} pluginId={pluginId} mode="silent">
          <Item />
        </PluginBoundary>
      ))}
      <span className="flex-1" />
      {end.map(({ id, pluginId, component: Item }) => (
        <PluginBoundary key={id} pluginId={pluginId} mode="silent">
          <Item />
        </PluginBoundary>
      ))}
    </footer>
  )
}
