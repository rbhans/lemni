"use client"

import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import {
  createShapeId,
  useEditor,
  useValue,
  type Editor,
  type VecLike,
} from "tldraw"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PropertyRow } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"

import { normalizeAddress, siteLabel } from "./model"
import { isWebShape, WEB_TYPE, type WebShapeProps } from "./web-shape"

export const hasWebSelected = (editor: Editor) =>
  editor.getSelectedShapes().some(isWebShape)

/** Adds a web view and opens its address bar. */
export function createWebView(editor: Editor, at: VecLike) {
  const w = 800
  const h = 520
  const id = createShapeId()
  editor.markHistoryStoppingPoint("insert web view")
  editor.createShape({
    id,
    type: WEB_TYPE,
    x: at.x - w / 2,
    y: at.y - h / 2,
    props: { w, h },
  })
  editor.select(id)
  editor.setEditingShape(id)
}

export function WebSection() {
  const editor = useEditor()
  const shape = useValue(
    "selected web view",
    () => {
      const selected = editor.getSelectedShapes()
      return selected.length === 1 && isWebShape(selected[0])
        ? selected[0]
        : null
    },
    [editor]
  )
  if (!shape) return null
  const update = (props: Partial<WebShapeProps>) => {
    editor.markHistoryStoppingPoint("change web view")
    editor.updateShape({ id: shape.id, type: WEB_TYPE, props })
  }
  const { url, title } = shape.props

  return (
    <div className="flex flex-col gap-2">
      <PropertyRow label="Address">
        <Input
          key={`${shape.id}:${url}`}
          aria-label="Address"
          className="h-7 font-mono text-xs"
          defaultValue={url}
          placeholder="https://10.0.0.20"
          spellCheck={false}
          onBlur={(event) => {
            const text = event.target.value.trim()
            if (!text || text === url) return
            const result = normalizeAddress(text, window.location.origin)
            if ("error" in result) {
              toast.error(result.error)
              event.target.value = url
              return
            }
            update({ url: result.url })
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
      </PropertyRow>
      <PropertyRow label="Title">
        <Input
          key={`${shape.id}:title`}
          aria-label="Title"
          className="h-7 text-xs"
          defaultValue={title}
          placeholder={url ? siteLabel(url) : "Web view"}
          onBlur={(event) => {
            if (event.target.value !== title)
              update({ title: event.target.value })
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
      </PropertyRow>
      {url ? (
        <Button
          variant="outline"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        >
          <Icon icon={ArrowUpRight01Icon} className="size-3.5" />
          Open in a new tab
        </Button>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Double-click the web view to use the page; click outside it to move it
        again. In Present mode it&apos;s always live.
      </p>
      <p className="text-[11px] text-muted-foreground">
        Blank page or &quot;refused to connect&quot;? Some sites don&apos;t
        allow being shown inside another page. A site with a self-signed
        certificate has to be opened in a tab and accepted once first.
      </p>
    </div>
  )
}
