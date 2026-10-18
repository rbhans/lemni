"use client"

import { useEffect, useRef } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import { toast } from "sonner"
import {
  BrowserIcon,
  Link01Icon,
  PlugSocketIcon,
  TextIcon,
} from "@hugeicons/core-free-icons"
import {
  atom,
  useEditor,
  useValue,
  type Editor,
  type EmbedShapeUtil,
  type TLExternalContentSource,
  type VecLike,
} from "tldraw"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"

import { currentPageKind } from "../pages/page-categories"
import type {
  ConnectionProbeContribution,
  PastedText,
  StudioContext,
  TextImporterContribution,
} from "../plugins/types"
import { Icon } from "../shell/icon"
import { openConnect } from "../state"

// Text and links pasted or dropped on the board. Plugins' text importers (a web view,
// a table) sit next to the board's own default (a link card, plain text), plus
// Connect… for a link a connection probe recognizes. A single choice runs at once;
// several open a menu where the content lands.

export interface TextImportEnv {
  ctx: StudioContext
  importers: readonly TextImporterContribution[]
  probes: readonly ConnectionProbeContribution[]
}

interface TextOption {
  key: string
  label: string
  icon: IconSvgElement
  run(): void | Promise<void>
}

/** Runs a choice; a plugin that throws gets logged, not a broken paste. */
async function runOption(option: TextOption) {
  try {
    await option.run()
  } catch (error) {
    console.error(`[text import] "${option.label}" failed`, error)
    toast.error(`Couldn't add it as ${option.label.toLowerCase()}.`)
  }
}

interface Pending {
  title: string
  /** Where the menu opens, in window coordinates. */
  client: { x: number; y: number }
  options: TextOption[]
}

const pending = atom<Pending | null>("pending text import", null)

/** The plain text that came with an HTML paste (tldraw hands over the HTML stripped). */
function plainText(sources: TLExternalContentSource[] | undefined) {
  for (const source of sources ?? [])
    if (source.type === "text" && source.subtype === "text") return source.data
  return null
}

function embedTitle(editor: Editor, url: string): string | null {
  try {
    const util = editor.getShapeUtil("embed") as EmbedShapeUtil | undefined
    return util?.getEmbedDefinition(url)?.definition.title ?? null
  } catch {
    return null
  }
}

/** A long link shortened for the menu's heading. */
function shortLink(url: URL) {
  const text = `${url.host}${url.pathname === "/" ? "" : url.pathname}`
  return text.length > 48 ? `${text.slice(0, 47)}…` : text
}

interface Arrival {
  content: PastedText
  point?: VecLike
  /** tldraw's own handling: a link card (or an embed) for a link, a text shape for text. */
  fallback(): void | Promise<void>
}

/**
 * The handlers for tldraw's "url" and "text" external content. Several links pasted at
 * once arrive one after another in the same tick; they get the default (link cards)
 * rather than a menu each.
 */
export function createTextImport(env: () => TextImportEnv) {
  let links: Arrival[] = []
  return {
    url(arrival: Arrival) {
      links.push(arrival)
      if (links.length > 1) return
      queueMicrotask(() => {
        const batch = links
        links = []
        if (batch.length === 1) importText(env(), batch[0])
        else for (const item of batch) void item.fallback()
      })
    },
    text(arrival: Arrival) {
      return importText(env(), arrival)
    },
  }
}

/** Handles one paste or drop: runs the only choice, or offers several. */
function importText(env: TextImportEnv, input: Arrival) {
  const { ctx, importers, probes } = env
  const { editor } = ctx
  if (editor.getIsReadonly()) return
  const { content } = input
  const kind = currentPageKind(editor)
  const at = input.point ?? editor.getViewportPageBounds().center

  // A plugin's check that throws counts as "no".
  const safely = (check: () => boolean | undefined) => {
    try {
      return check() === true
    } catch (error) {
      console.error("[text import] a check failed", error)
      return false
    }
  }
  const fitting = importers.filter(
    (importer) =>
      (importer.pageKinds ?? ["ui", "documents"]).includes(kind) &&
      safely(() => importer.accepts(content))
  )
  const asOption = (importer: TextImporterContribution): TextOption => ({
    key: importer.id,
    label: importer.label,
    icon: importer.icon,
    run: () => importer.import(ctx, content, at),
  })
  const embed = content.url ? embedTitle(editor, content.url.href) : null
  const builtIn: TextOption = {
    key: "default",
    label: content.url ? (embed ? `Embedded ${embed}` : "Link card") : "Text",
    icon: content.url ? (embed ? BrowserIcon : Link01Icon) : TextIcon,
    run: input.fallback,
  }
  const suggested = fitting.filter((importer) =>
    safely(() => importer.suggested?.(content))
  )
  const options = [
    ...suggested.map(asOption),
    builtIn,
    ...fitting
      .filter((importer) => !suggested.includes(importer))
      .map(asOption),
  ]
  const url = content.url
  if (url && probes.some((probe) => safely(() => probe.recognizes?.(url))))
    options.push({
      key: "connect",
      label: `Connect to ${url.host}…`,
      icon: PlugSocketIcon,
      run: () => openConnect(url.href),
    })

  if (options.length === 1) return runOption(builtIn)
  const client = editor.pageToScreen(at)
  pending.set({
    title: url ? shortLink(url) : "Paste as",
    client: { x: client.x, y: client.y },
    options,
  })
}

/** The menu for pastes and drops that could become several things. */
export function TextImportMenu() {
  const editor = useEditor()
  const current = useValue(pending)
  const first = useRef<HTMLDivElement>(null)
  const close = () => {
    pending.set(null)
    editor.focus()
  }

  // The first choice starts highlighted, so ⌘V then Enter takes it.
  useEffect(() => {
    if (!current) return
    const frame = requestAnimationFrame(() => first.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [current])

  return (
    <DropdownMenu
      open={current !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      {current ? (
        <DropdownMenuContent
          anchor={{
            getBoundingClientRect: () =>
              DOMRect.fromRect({ ...current.client, width: 0, height: 0 }),
          }}
          className="w-auto min-w-48"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="max-w-72 truncate">
              {current.title}
            </DropdownMenuLabel>
            {current.options.map((option, index) => (
              <DropdownMenuItem
                key={option.key}
                ref={index === 0 ? first : undefined}
                onClick={() => {
                  close()
                  void runOption(option)
                }}
              >
                <Icon icon={option.icon} className="size-3.5" />
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  )
}

/** The content as importers see it, from tldraw's url or text content. */
export function pastedText(
  input:
    | { type: "url"; url: string }
    | {
        type: "text"
        text: string
        html?: string
        sources?: TLExternalContentSource[]
      }
): PastedText {
  if (input.type === "url") {
    let url: URL | undefined
    try {
      url = new URL(input.url)
    } catch {
      url = undefined
    }
    return { text: input.url, url }
  }
  return { text: plainText(input.sources) ?? input.text, html: input.html }
}
