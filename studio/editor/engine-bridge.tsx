"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  defaultHandleExternalFileContent,
  registerDefaultExternalContentHandlers,
  registerDefaultSideEffects,
  useEditor,
  useKeyboardShortcuts,
  useNativeClipboardEvents,
  useToasts,
  useTranslation,
  useValue,
} from "tldraw"

import { installBoardFiles } from "../files/board-files"
import { usePluginRuntime } from "../plugins/runtime"
import { useStudioHotkeys } from "../shell/use-studio-hotkeys"
import { usePasteHandling } from "./paste"
import { useStudioContext } from "../studio-context"

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
] as const
export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const

/**
 * Everything `<Tldraw>` normally wires up besides its visual UI: shortcuts,
 * clipboard, dropped/pasted content, store side effects, toasts and theme.
 */
export function EngineBridge() {
  const editor = useEditor()
  const toasts = useToasts()
  const msg = useTranslation()

  useKeyboardShortcuts()
  useNativeClipboardEvents()

  const ctx = useStudioContext()
  const { contributions } = usePluginRuntime()
  // Read at drop time, so the handler below always sees the current plugins.
  const importers = useRef({ list: contributions.fileImporters, ctx })
  useEffect(() => {
    importers.current = { list: contributions.fileImporters, ctx }
  }, [contributions.fileImporters, ctx])

  useEffect(() => {
    const options = {
      maxImageDimension: 5000,
      maxAssetSize: 25 * 1024 * 1024,
      acceptedImageMimeTypes: ACCEPTED_IMAGE_TYPES,
      acceptedVideoMimeTypes: ACCEPTED_VIDEO_TYPES,
      toasts,
      msg,
    }
    registerDefaultExternalContentHandlers(editor, options)
    // Plugins open the files they understand (PDFs, spreadsheets, ...); tldraw
    // handles the rest (images, video) as before.
    editor.registerExternalContentHandler("files", async ({ files, point }) => {
      const { list, ctx: current } = importers.current
      const rest: File[] = []
      const claimed = new Map<string, File[]>()
      for (const file of files) {
        const importer = list.find((candidate) => candidate.accepts(file))
        if (importer)
          claimed.set(importer.id, [...(claimed.get(importer.id) ?? []), file])
        else rest.push(file)
      }
      for (const importer of list) {
        const mine = claimed.get(importer.id)
        if (mine) await importer.import(current, mine, point)
      }
      if (rest.length)
        await defaultHandleExternalFileContent(
          editor,
          { files: rest, point },
          options
        )
    })
    return registerDefaultSideEffects(editor)
  }, [editor, toasts, msg])

  // Board files: change tracking, the current file and recent boards.
  useEffect(() => installBoardFiles(editor), [editor])

  useThemeSync()
  useToastBridge()
  usePasteHandling()
  usePluginMountHooks()
  useStudioHotkeys()

  return null
}

/** next-themes owns light/dark; the canvas follows it. */
function useThemeSync() {
  const editor = useEditor()
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    editor.user.updateUserPreferences({
      colorScheme: resolvedTheme === "dark" ? "dark" : "light",
    })
  }, [editor, resolvedTheme])
}

/** tldraw raises toasts (e.g. "file too large"); show them with sonner. */
function useToastBridge() {
  const toasts = useToasts()
  const pending = useValue("pending toasts", () => toasts.toasts.get(), [
    toasts,
  ])
  useEffect(() => {
    for (const item of pending) {
      const show =
        item.severity === "error"
          ? toast.error
          : item.severity === "warning"
            ? toast.warning
            : item.severity === "success"
              ? toast.success
              : toast.info
      show(item.title ?? item.description ?? "", {
        id: item.id,
        description: item.title ? item.description : undefined,
        duration: item.keepOpen ? Infinity : 5000,
      })
      toasts.removeToast(item.id)
    }
  }, [pending, toasts])
}

/** Runs each enabled plugin's `onEditorMount`, and cleans up when it is turned off. */
function usePluginMountHooks() {
  const { active } = usePluginRuntime()
  const ctx = useStudioContext()
  const cleanups = useRef(new Map<string, () => void>())

  useEffect(() => {
    const running = cleanups.current
    const activeIds = new Set(active.map((plugin) => plugin.id))
    for (const [id, cleanup] of running) {
      if (!activeIds.has(id)) {
        cleanup()
        running.delete(id)
      }
    }
    for (const plugin of active) {
      if (running.has(plugin.id) || !plugin.onEditorMount) continue
      try {
        running.set(plugin.id, plugin.onEditorMount(ctx) ?? (() => {}))
      } catch (error) {
        console.error(`[plugin:${plugin.id}] onEditorMount failed`, error)
      }
    }
  }, [active, ctx])

  useEffect(() => {
    const running = cleanups.current
    return () => {
      for (const cleanup of running.values()) cleanup()
      running.clear()
    }
  }, [])
}
