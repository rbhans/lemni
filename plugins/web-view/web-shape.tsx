"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowUpRight01Icon,
  BrowserIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import {
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  ShapeUtil,
  T,
  useEditor,
  useValue,
  type TLResizeInfo,
  type TLShape,
} from "tldraw"

import { cn } from "@/lib/utils"
import { Icon, pluginApiUrl, registerShapeLabel, shell } from "@/sdk"

import { normalizeAddress, siteLabel } from "./model"

export const WEB_TYPE = "bas-web"

export interface WebShapeProps {
  w: number
  h: number
  /** Empty until an address is entered. */
  url: string
  /** Empty: the site's host. */
  title: string
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [WEB_TYPE]: WebShapeProps
  }
}

export type WebShape = TLShape<typeof WEB_TYPE>

export const isWebShape = (
  shape: TLShape | undefined | null
): shape is WebShape => shape?.type === WEB_TYPE

registerShapeLabel(WEB_TYPE, () => "Web view")

const BAR_H = 32

export class WebShapeUtil extends ShapeUtil<WebShape> {
  static override type = WEB_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    url: T.string,
    title: T.string,
  }

  getDefaultProps(): WebShapeProps {
    return { w: 800, h: 520, url: "", title: "" }
  }

  /** Double-click to use the page; click outside to go back to arranging. */
  override canEdit() {
    return true
  }

  getGeometry(shape: WebShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: WebShape, info: TLResizeInfo<WebShape>) {
    return resizeBox(shape, info, { minWidth: 240, minHeight: 160 })
  }

  component(shape: WebShape) {
    return (
      <HTMLContainer>
        <WebView shape={shape} />
      </HTMLContainer>
    )
  }

  getIndicatorPath(shape: WebShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 12)
    return path
  }

  // Another site's page can't be drawn into an export; show what it links to.
  override toSvg(shape: WebShape) {
    const { w, h, url, title } = shape.props
    const label = title.trim() || (url ? siteLabel(url) : "Web view")
    return (
      <g>
        <rect
          width={w}
          height={h}
          rx={12}
          fill="var(--card, #fff)"
          stroke="var(--border, #e5e5e5)"
        />
        <line
          x1={0}
          x2={w}
          y1={BAR_H}
          y2={BAR_H}
          stroke="var(--border, #e5e5e5)"
        />
        <text x={12} y={20} fontSize={12} fill="currentColor">
          {label}
        </text>
        <text
          x={w / 2}
          y={(h + BAR_H) / 2}
          fontSize={12}
          textAnchor="middle"
          fill="#888"
        >
          {url || "No address"}
        </text>
      </g>
    )
  }
}

/** Only these powers are handed to the embedded page; it can't navigate the board away. */
const SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-downloads",
  "allow-storage-access-by-user-activation",
].join(" ")

interface Check {
  url: string
  blocked: boolean
  reason: string | null
}

/** Asks the board's server whether the site allows being shown in a frame. */
function useFramingCheck(url: string) {
  const [check, setCheck] = useState<Check | null>(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(pluginApiUrl("web-view", `/check?url=${encodeURIComponent(url)}`))
      .then((response) => response.json())
      .then(
        (result: { checked: boolean; allowed?: boolean; reason?: string }) => {
          if (cancelled) return
          setCheck({
            url,
            blocked: result.checked && result.allowed === false,
            reason: result.reason ?? null,
          })
        }
      )
      // If the check itself fails, just try showing the page.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [url])
  return check?.url === url ? check : null
}

function WebView({ shape }: { shape: WebShape }) {
  const editor = useEditor()
  const { url, title } = shape.props
  const check = useFramingCheck(url)
  // While arranging the board the page is inert, so clicks select and move the
  // shape; double-clicking (or presenting) hands the pointer to the page.
  const editing = useValue(
    "web view editing",
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id]
  )
  const presenting = useValue(shell.presenting)
  const live = editing || presenting
  const [reloads, setReloads] = useState(0)

  return (
    <div
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground",
        editing && "ring-2 ring-primary/60"
      )}
      style={{ pointerEvents: "all" }}
    >
      <div
        className="flex shrink-0 items-center gap-1.5 border-b px-2"
        style={{ height: BAR_H }}
        // While live, the bar's controls take the pointer instead of the canvas.
        onPointerDown={live ? (event) => event.stopPropagation() : undefined}
      >
        <Icon icon={BrowserIcon} className="size-3.5 text-muted-foreground" />
        {editing ? (
          <AddressBar shape={shape} />
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs">
            {title.trim() || (url ? siteLabel(url) : "Web view")}
          </span>
        )}
        {url && live ? (
          <>
            <BarButton
              label="Reload"
              icon={RefreshIcon}
              onClick={() => setReloads((n) => n + 1)}
            />
            <BarButton
              label="Open in a new tab"
              icon={ArrowUpRight01Icon}
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            />
          </>
        ) : null}
      </div>
      {url && check?.blocked ? (
        <div className="pointer-events-none m-3 flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-6 text-center">
          <Icon icon={BrowserIcon} className="size-5 text-muted-foreground" />
          <p className="text-xs font-medium">
            {siteLabel(url)} doesn&apos;t allow being shown inside another page
          </p>
          <p className="text-[11px] text-muted-foreground">
            Its own settings decide this
            {check.reason ? ` (it sends ${check.reason})` : ""}. Open it in a
            new tab instead, or change the site&apos;s setting to allow it.
          </p>
          <button
            type="button"
            className="pointer-events-auto mt-1 inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          >
            <Icon icon={ArrowUpRight01Icon} className="size-3.5" />
            Open in a new tab
          </button>
        </div>
      ) : url ? (
        <div className="relative min-h-0 flex-1 bg-background">
          <iframe
            key={`${url}#${reloads}`}
            src={url}
            title={title.trim() || siteLabel(url)}
            className="size-full border-0"
            style={{ pointerEvents: live ? "auto" : "none" }}
            sandbox={SANDBOX}
            referrerPolicy="no-referrer"
            allow="fullscreen; clipboard-read; clipboard-write"
          />
          {!live ? (
            <span className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-background/90 px-1.5 py-0.5 text-[10.5px] text-muted-foreground shadow-sm ring-1 ring-foreground/10">
              Double-click to use
            </span>
          ) : null}
        </div>
      ) : (
        <div className="pointer-events-none m-3 flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center">
          <Icon icon={BrowserIcon} className="size-5 text-muted-foreground" />
          <p className="text-xs font-medium">No address yet</p>
          <p className="px-4 text-[11px] text-muted-foreground">
            Double-click, then type an address in the bar above.
          </p>
        </div>
      )}
    </div>
  )
}

function AddressBar({ shape }: { shape: WebShape }) {
  const editor = useEditor()
  const input = useRef<HTMLInputElement>(null)

  // A new web view opens straight into its address bar.
  useEffect(() => {
    if (!shape.props.url) input.current?.focus()
  }, [shape.props.url])

  const commit = (text: string) => {
    if (text.trim() === shape.props.url) return
    const result = normalizeAddress(text, window.location.origin)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    editor.markHistoryStoppingPoint("change web view address")
    editor.updateShape({
      id: shape.id,
      type: WEB_TYPE,
      props: { url: result.url },
    })
  }

  return (
    <input
      ref={input}
      key={shape.props.url}
      aria-label="Address"
      defaultValue={shape.props.url}
      placeholder="Address, e.g. https://10.0.0.20"
      spellCheck={false}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === "Enter") commit(event.currentTarget.value)
        if (event.key === "Escape") {
          event.currentTarget.value = shape.props.url
          editor.setEditingShape(null)
          editor.focus()
        }
      }}
      className="h-6 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-[11.5px] outline-none focus:border-ring"
    />
  )
}

function BarButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: Parameters<typeof Icon>[0]["icon"]
  onClick(): void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon icon={icon} className="size-3.5" />
    </button>
  )
}
