"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  defaultHandleExternalFileContent,
  defaultHandleExternalTextContent,
  defaultHandleExternalUrlContent,
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
import type { FileImporterContribution } from "../plugins/types"
import { useStudioHotkeys } from "../shell/use-studio-hotkeys"
import { usePasteHandling } from "./paste"
import { createTextImport, pastedText } from "./text-import"
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

const MEDIA_TYPES = new Set<string>([
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_VIDEO_TYPES,
])

const names = (files: File[]) => files.map((file) => file.name).join(", ")

/** "PDF, DOCX, XLSX, CSV, images and video": the file types plugins open, plus media. */
function openableKinds(importers: readonly FileImporterContribution[]) {
  const extensions = new Set(
    importers.flatMap((importer) =>
      importer.accept
        .filter((type) => type.startsWith("."))
        .map((type) => type.slice(1).toUpperCase())
    )
  )
  return [...extensions, "images and video"].join(", ")
}

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
  // Read at drop time, so the handlers below always see the current plugins.
  const importers = useRef({
    list: contributions.fileImporters,
    text: contributions.textImporters,
    probes: contributions.connectionProbes,
    ctx,
  })
  useEffect(() => {
    importers.current = {
      list: contributions.fileImporters,
      text: contributions.textImporters,
      probes: contributions.connectionProbes,
      ctx,
    }
  }, [
    contributions.fileImporters,
    contributions.textImporters,
    contributions.connectionProbes,
    ctx,
  ])

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
    // handles images and video as before, and anything else gets a clear "no".
    editor.registerExternalContentHandler("files", async ({ files, point }) => {
      const { list, ctx: current } = importers.current
      const media: File[] = []
      const unknown: File[] = []
      const claimed = new Map<string, File[]>()
      for (const file of files) {
        const importer = list.find((candidate) => candidate.accepts(file))
        if (importer)
          claimed.set(importer.id, [...(claimed.get(importer.id) ?? []), file])
        else if (MEDIA_TYPES.has(file.type)) media.push(file)
        else unknown.push(file)
      }
      for (const importer of list) {
        const mine = claimed.get(importer.id)
        if (!mine) continue
        try {
          await importer.import(current, mine, point)
        } catch (error) {
          console.error(`[plugin:${importer.pluginId}] import failed`, error)
          toast.error(`Couldn't open ${names(mine)}`)
        }
      }
      if (unknown.length)
        toast.error(`Can't open ${names(unknown)}`, {
          description: `Lemscape opens ${openableKinds(list)}.`,
        })
      if (media.length)
        await defaultHandleExternalFileContent(
          editor,
          { files: media, point },
          options
        )
    })
    // Links and text: plugins offer what they can become (a web view, a table) next to
    // tldraw's own handling, which stays the default.
    const text = createTextImport(() => ({
      ctx: importers.current.ctx,
      importers: importers.current.text,
      probes: importers.current.probes,
    }))
    editor.registerExternalContentHandler("url", (content) =>
      text.url({
        content: pastedText(content),
        point: content.point,
        fallback: () =>
          defaultHandleExternalUrlContent(editor, content, options),
      })
    )
    editor.registerExternalContentHandler("text", (content) =>
      text.text({
        content: pastedText(content),
        point: content.point,
        fallback: () => defaultHandleExternalTextContent(editor, content),
      })
    )
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
