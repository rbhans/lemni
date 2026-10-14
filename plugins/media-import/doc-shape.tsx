"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  File01Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons"
import {
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  ShapeUtil,
  T,
  useDelaySvgExport,
  useEditor,
  useValue,
  type Editor,
  type TLAssetId,
  type TLResizeInfo,
  type TLShape,
} from "tldraw"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  endLabel,
  getLinks,
  linkMark,
  linkToMark,
  markForLink,
  registerLinkable,
} from "@/studio/links/links"
import { connects, type LinkEnd } from "@/studio/links/model"
import { registerShapeLabel } from "@/studio/lib/shape-labels"
import { Icon } from "@/studio/shell/icon"

import { pageImage } from "./pdf"
import { wordDocument, type WordDocument } from "./word"

export const DOC_TYPE = "bas-doc"

export interface DocShapeProps {
  w: number
  h: number
  /** The original file, kept as a board asset so the board travels as one file. */
  assetId: string
  name: string
  kind: "pdf" | "word"
  pageCount: number
  /** The page (PDF) or section (Word, split at headings) showing. 1-based. */
  page: number
  /** Word section headings, for the page list and link names. */
  sections: string[]
}

declare module "tldraw" {
  export interface TLGlobalShapePropsMap {
    [DOC_TYPE]: DocShapeProps
  }
}

export type DocShape = TLShape<typeof DOC_TYPE>

export const isDocShape = (
  shape: TLShape | undefined | null
): shape is DocShape => shape?.type === DOC_TYPE

export const BAR_H = 32

registerShapeLabel(DOC_TYPE, (shape) =>
  isDocShape(shape) ? shape.props.name : undefined
)

export function pageName(shape: DocShape, page: number) {
  return shape.props.kind === "word"
    ? (shape.props.sections[page - 1] ?? `Section ${page}`)
    : `p. ${page}`
}

/** Shows a page; not an undo step (it's where you're looking, not an edit). */
function showPage(editor: Editor, shape: DocShape, page: number) {
  const next = Math.min(Math.max(1, Math.round(page)), shape.props.pageCount)
  if (next === shape.props.page) return
  editor.run(
    () =>
      editor.updateShape({
        id: shape.id,
        type: DOC_TYPE,
        props: { page: next },
      }),
    { history: "ignore" }
  )
}

registerLinkable(DOC_TYPE, {
  showPage: (editor, shape, page) => {
    if (isDocShape(shape)) showPage(editor, shape, page)
  },
  pageLabel: (shape, page) =>
    isDocShape(shape) ? pageName(shape, page) : `p. ${page}`,
})

export class DocShapeUtil extends ShapeUtil<DocShape> {
  static override type = DOC_TYPE
  static override props = {
    w: T.nonZeroNumber,
    h: T.nonZeroNumber,
    assetId: T.string,
    name: T.string,
    kind: T.literalEnum("pdf", "word"),
    pageCount: T.number,
    page: T.number,
    sections: T.arrayOf(T.string),
  }

  getDefaultProps(): DocShapeProps {
    return {
      w: 420,
      h: 580,
      assetId: "",
      name: "Document",
      kind: "pdf",
      pageCount: 1,
      page: 1,
      sections: [],
    }
  }

  /** Word documents scroll after a double-click; PDFs page with the arrows. */
  override canEdit(shape: DocShape) {
    return shape.props.kind === "word"
  }

  getGeometry(shape: DocShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override onResize(shape: DocShape, info: TLResizeInfo<DocShape>) {
    return resizeBox(shape, info, { minWidth: 200, minHeight: 160 })
  }

  component(shape: DocShape) {
    return (
      <HTMLContainer>
        <DocCard shape={shape} />
      </HTMLContainer>
    )
  }

  getIndicatorPath(shape: DocShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
    return path
  }

  override toSvg(shape: DocShape) {
    return (
      <foreignObject
        x={0}
        y={0}
        width={shape.props.w}
        height={shape.props.h}
        className="tl-export-embed-styles"
      >
        <DocCard shape={shape} />
      </foreignObject>
    )
  }
}

/** The file's bytes, read back from its asset. */
function useBytes(assetId: string) {
  const editor = useEditor()
  const src = useValue(
    "document source",
    () => {
      const asset = editor.getAsset(assetId as TLAssetId)
      const value = asset ? (asset.props as { src?: unknown }).src : null
      return typeof value === "string" ? value : null
    },
    [editor, assetId]
  )
  const bytes = useCallback(
    () => fetch(src ?? "").then((response) => response.arrayBuffer()),
    [src]
  )
  return { ready: Boolean(src), bytes }
}

function DocCard({ shape }: { shape: DocShape }) {
  const editor = useEditor()
  const { assetId, kind, page, pageCount, w } = shape.props
  const { ready, bytes } = useBytes(assetId)
  const editing = useValue(
    "document scrolling",
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id]
  )

  return (
    <div
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs",
        editing && "ring-2 ring-primary/60"
      )}
      style={{ pointerEvents: "all" }}
    >
      <div
        className="flex shrink-0 items-center gap-1 border-b pr-1 pl-2"
        style={{ height: BAR_H }}
        // The bar's buttons work without selecting or dragging the card.
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Icon icon={File01Icon} className="size-3.5 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {shape.props.name}
        </span>
        <BarButton
          label="Previous page"
          icon={ArrowLeft01Icon}
          disabled={page <= 1}
          onClick={() => showPage(editor, shape, page - 1)}
        />
        <PageMenu shape={shape} />
        <BarButton
          label="Next page"
          icon={ArrowRight01Icon}
          disabled={page >= pageCount}
          onClick={() => showPage(editor, shape, page + 1)}
        />
        <LinkMenu shape={shape} />
      </div>
      <div className="relative min-h-0 flex-1 bg-white text-neutral-900">
        {!ready ? (
          <p className="p-4 text-xs text-neutral-500">
            The file for this document is missing.
          </p>
        ) : kind === "pdf" ? (
          <PdfPage assetId={assetId} bytes={bytes} page={page} width={w} />
        ) : (
          <WordView
            assetId={assetId}
            bytes={bytes}
            page={page}
            editing={editing}
          />
        )}
      </div>
    </div>
  )
}

function BarButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string
  icon: Parameters<typeof Icon>[0]["icon"]
  disabled?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
    >
      <Icon icon={icon} className="size-3.5" />
    </button>
  )
}

/** Every page, with how many links each has; pick one to show it. */
function PageMenu({ shape }: { shape: DocShape }) {
  const editor = useEditor()
  const { page, pageCount } = shape.props
  const counts = useValue(
    "page link counts",
    () => {
      const out: Record<number, number> = {}
      for (const link of getLinks(editor))
        for (const end of [link.a, link.b])
          if (end.kind === "docPage" && end.shapeId === shape.id)
            out[end.page] = (out[end.page] ?? 0) + 1
      return out
    },
    [editor, shape.id]
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="h-6 rounded-md px-1.5 text-[11px] text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground"
          />
        }
      >
        {page} / {pageCount}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {shape.props.kind === "word" ? "Sections" : "Pages"}
          </DropdownMenuLabel>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <DropdownMenuItem
              key={n}
              onClick={() => showPage(editor, shape, n)}
              className={cn(n === page && "font-semibold")}
            >
              <span className="min-w-0 flex-1 truncate">
                {shape.props.kind === "word"
                  ? `${n}. ${pageName(shape, n)}`
                  : `Page ${n}`}
              </span>
              {counts[n] ? (
                <span className="flex shrink-0 items-center gap-0.5 text-[10.5px] text-muted-foreground">
                  <Icon icon={Link01Icon} className="size-3" />
                  {counts[n]}
                </span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Link Mark / Link for the page showing, or the whole document. */
function LinkMenu({ shape }: { shape: DocShape }) {
  const editor = useEditor()
  const mark = useValue(linkMark)
  const pageEnd: LinkEnd = {
    kind: "docPage",
    shapeId: shape.id,
    page: shape.props.page,
  }
  const docEnd: LinkEnd = { kind: "shape", shapeId: shape.id }
  const label = pageName(shape, shape.props.page)
  const linked = (end: LinkEnd) =>
    Boolean(mark && getLinks(editor).some((l) => connects(l, mark, end)))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Link this page"
            title="Link this page"
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
              mark && "text-primary"
            )}
          />
        }
      >
        <Icon icon={Link01Icon} className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => markForLink(pageEnd)}>
            Link mark this page
          </DropdownMenuItem>
          {mark && !linked(pageEnd) ? (
            <DropdownMenuItem onClick={() => linkToMark(editor, pageEnd)}>
              <span className="truncate">
                Link this page to {endLabel(editor, mark)}
              </span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Whole document</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => markForLink(docEnd)}>
            Link mark the document
          </DropdownMenuItem>
          {mark && !linked(docEnd) ? (
            <DropdownMenuItem onClick={() => linkToMark(editor, docEnd)}>
              <span className="truncate">
                Link the document to {endLabel(editor, mark)}
              </span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PdfPage({
  assetId,
  bytes,
  page,
  width,
}: {
  assetId: string
  bytes: () => Promise<ArrayBuffer>
  page: number
  width: number
}) {
  // Drawn at twice the card's width so it stays sharp when zoomed in a little.
  const px = Math.round(width * 2)
  const id = `${assetId}#${page}@${px}`
  const [image, setImage] = useState<{ id: string; url: string } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const exportReady = useDelaySvgExport()

  useEffect(() => {
    let cancelled = false
    pageImage(assetId, bytes, page, px)
      .then((url) => {
        if (!cancelled) setImage({ id, url })
      })
      .catch(() => {
        if (!cancelled) setFailed(id)
      })
    return () => {
      cancelled = true
    }
  }, [assetId, bytes, page, px, id])

  useEffect(() => {
    if (image?.id === id || failed === id) exportReady()
  }, [image, failed, id, exportReady])

  if (failed === id)
    return (
      <p className="p-4 text-xs text-neutral-500">
        This page couldn&apos;t be drawn.
      </p>
    )
  // The previous page stays up (dimmed) until the next one is ready.
  return image ? (
    // A page drawn in the browser (a data URL); next/image has nothing to optimize.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.url}
      alt=""
      draggable={false}
      className={cn(
        "size-full object-contain transition-opacity",
        image.id !== id && "opacity-50"
      )}
    />
  ) : (
    <p className="p-4 text-xs text-neutral-500">Loading page…</p>
  )
}

function WordView({
  assetId,
  bytes,
  page,
  editing,
}: {
  assetId: string
  bytes: () => Promise<ArrayBuffer>
  page: number
  editing: boolean
}) {
  const [doc, setDoc] = useState<WordDocument | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const exportReady = useDelaySvgExport()

  useEffect(() => {
    let cancelled = false
    wordDocument(assetId, bytes)
      .then((result) => {
        if (!cancelled) setDoc(result)
      })
      .catch(() => undefined)
      .finally(() => exportReady())
    return () => {
      cancelled = true
    }
  }, [assetId, bytes, exportReady])

  // Bring the current section to the top.
  useEffect(() => {
    const el = scroller.current
    if (!doc || !el) return
    const heading = el.querySelector<HTMLElement>(`[data-section="${page}"]`)
    el.scrollTop = page <= 1 || !heading ? 0 : heading.offsetTop - 12
  }, [doc, page])

  if (!doc)
    return <p className="p-4 text-xs text-neutral-500">Loading document…</p>
  return (
    <div
      ref={scroller}
      className={cn(
        "size-full px-6 py-4 text-[12px] leading-relaxed",
        "[&_a]:text-blue-700 [&_a]:underline [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:max-w-full [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-1.5 [&_table]:my-2 [&_table]:border-collapse [&_td]:border [&_td]:border-neutral-300 [&_td]:px-1.5 [&_td]:py-0.5 [&_ul]:list-disc",
        editing ? "overflow-auto" : "overflow-hidden"
      )}
      // While scrolling the document, the wheel scrolls it instead of the board.
      onWheelCapture={editing ? (event) => event.stopPropagation() : undefined}
      dangerouslySetInnerHTML={{ __html: doc.html }}
    />
  )
}
