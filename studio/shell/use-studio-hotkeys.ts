"use client"

import { useEffect } from "react"
import { useEditor } from "tldraw"

import { hasModifier, isTypingTarget, matchesKbd } from "../lib/hotkeys"
import { usePluginRuntime } from "../plugins/runtime"
import { useStudioContext } from "../studio-context"

/**
 * Binds the shortcuts tldraw doesn't own: menu items and commands that carry a `kbd`
 * and their own handler. (Menu items that point at a tldraw action are bound by tldraw.)
 * Plain-key shortcuts stay quiet while typing; ⌘/Ctrl chords work everywhere.
 */
export function useStudioHotkeys() {
  const editor = useEditor()
  const ctx = useStudioContext()
  const { contributions } = usePluginRuntime()

  useEffect(() => {
    const bindings = [
      ...contributions.menuItems
        .filter((item) => item.kbd && item.onSelect && !item.action)
        .map((item) => ({
          kbd: item.kbd!,
          run: () => item.onSelect!(ctx),
          enabled: () => !(item.disabled?.(editor) ?? false),
        })),
      ...contributions.commands
        .filter((command) => command.kbd)
        .map((command) => ({
          kbd: command.kbd!,
          run: () => command.run(ctx),
          enabled: () => command.when?.(editor) ?? true,
        })),
    ]

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return
      const binding = bindings.find((b) => matchesKbd(event, b.kbd))
      if (!binding) return
      const typing =
        isTypingTarget(event.target) || editor.getEditingShapeId() !== null
      if (typing && !hasModifier(binding.kbd)) return
      // Claim the chord even when disabled, so ⌘S never falls through to "Save page".
      event.preventDefault()
      event.stopPropagation()
      if (binding.enabled()) binding.run()
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [contributions.menuItems, contributions.commands, ctx, editor])
}
