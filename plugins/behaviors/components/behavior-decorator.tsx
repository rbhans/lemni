"use client"

import "../runtime.css"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react"
import {
  Group2d,
  useEditor,
  useImageOrVideoAsset,
  useValue,
  type TLAssetId,
  type TLShape,
} from "tldraw"

import {
  getDataSource,
  ShapeStateContext,
  ShapeStatusContext,
  useDataSources,
} from "@/sdk"
import { cn } from "@/lib/utils"

import type { Presentation } from "../core/effects"
import { pointsUsedBy, refKey, type PointRef } from "../core/model"
import { composePresentation, transformToCss } from "../core/presentation"
import { collectOwners, readValue } from "../runtime/shapes"
import { liveEffects } from "../runtime/state"

/** Keeps live values flowing for every point a shape's behaviors read. */
function useWatchPoints(refs: PointRef[]) {
  const sources = useDataSources()
  const key = refs.map(refKey).sort().join("\n")
  useEffect(() => {
    const releases = refs.flatMap((ref) => {
      const source = getDataSource(ref.source)
      return source ? [source.watch(ref.point)] : []
    })
    return () => releases.forEach((release) => release())
    // `key` captures refs by value; sources re-run this when a station (re)connects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sources])
}

/** Shape decorator: renders behavior effects without changing the saved shape. */
export function BehaviorDecorator({
  shape,
  isBackground,
  children,
}: {
  shape: TLShape
  isBackground: boolean
  children: ReactNode
}) {
  const editor = useEditor()
  const id = shape.id
  const owners = useValue("behavior owners", () => collectOwners(editor, id), [
    editor,
    id,
  ])
  const refs = owners.flatMap((owner) =>
    owner.behaviors.filter((b) => b.enabled).flatMap(pointsUsedBy)
  )
  useWatchPoints(refs)

  const presentation = useValue(
    "behavior presentation",
    () =>
      liveEffects.get() && owners.length
        ? composePresentation(collectOwners(editor, id), readValue).presentation
        : null,
    [editor, id, owners.length]
  )

  // No behaviors anywhere up the chain: render the shape exactly as tldraw does.
  if (!owners.length) return children
  return (
    <RuntimeLayer
      shape={shape}
      isBackground={isBackground}
      presentation={presentation}
    >
      {children}
    </RuntimeLayer>
  )
}

const EASE = "cubic-bezier(0.45, 0, 0.55, 1)"

/**
 * A fixed tree of layers (so the shape is never remounted when an effect starts):
 * follow transforms → spin → travel → blink → content with tint/flow, plus fills.
 */
function RuntimeLayer({
  shape,
  isBackground,
  presentation: p,
  children,
}: {
  shape: TLShape
  isBackground: boolean
  presentation: Presentation | null
  children: ReactNode
}) {
  const ms = p?.transitionMs ?? 0
  const outer: CSSProperties = {
    transformOrigin: "0 0",
    transform: p ? transformToCss(p.transforms) || "none" : "none",
    opacity: p ? (p.hidden ? 0 : p.opacity) : 1,
    transition: `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}`,
  }
  const content: CSSProperties & Record<string, string | number | undefined> = {
    "--bb-stroke": p?.color?.stroke ?? undefined,
    "--bb-fill": p?.color?.fill ?? undefined,
    "--bb-flow-duration": p?.flow ? `${p.flow.seconds}s` : undefined,
  }

  return (
    <div className="bb-layer" style={outer}>
      <SpinLayer spin={p?.spin ?? null} rampMs={Math.max(ms, 300)}>
        <TravelLayer travel={p?.travel ?? null} ms={Math.max(ms, 300)}>
          <BlinkLayer blink={p?.blink ?? null}>
            <div
              className={cn(
                "bb-layer",
                p?.color?.stroke && "bb-tint-stroke",
                p?.color?.fill && shape.type !== "image" && "bb-tint-fill",
                p?.flow && "bb-flow",
                p?.flow?.reverse && "bb-flow-reverse"
              )}
              style={content}
            >
              {/* Shapes with states (symbols) read these instead of their saved values. */}
              <ShapeStateContext.Provider
                value={p && Object.keys(p.state).length ? p.state : null}
              >
                <ShapeStatusContext.Provider value={p?.status ?? null}>
                  {children}
                </ShapeStatusContext.Provider>
              </ShapeStateContext.Provider>
            </div>
            {!isBackground && p?.color && shape.type === "image" ? (
              <ImageTint
                shape={shape}
                color={p.color.fill ?? p.color.stroke!}
              />
            ) : null}
            {!isBackground && p?.level ? (
              <LevelFill shape={shape} level={p.level} ms={ms} />
            ) : null}
          </BlinkLayer>
        </TravelLayer>
      </SpinLayer>
    </div>
  )
}

function useReducedMotion() {
  const editor = useEditor()
  return useValue(
    "reduced motion",
    () => editor.user.getAnimationSpeed() === 0,
    [editor]
  )
}

/** Continuous rotation with spin-up and spin-down instead of snapping. */
function SpinLayer({
  spin,
  rampMs,
  children,
}: {
  spin: Presentation["spin"]
  rampMs: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation | null>(null)
  const rate = useRef(0)
  const frame = useRef(0)
  const reduced = useReducedMotion()
  const target = spin && !reduced ? spin.dir / spin.secondsPerTurn : 0
  const originX = spin?.origin.x
  const originY = spin?.origin.y

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (originX !== undefined && originY !== undefined)
      el.style.transformOrigin = `${originX}px ${originY}px`
    if (!animation.current) {
      if (target === 0) return
      animation.current = el.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 1000, iterations: Infinity }
      )
      animation.current.playbackRate = 0
    }
    const anim = animation.current
    const from = rate.current
    const start = performance.now()
    cancelAnimationFrame(frame.current)
    if (anim.playState !== "running" && target !== 0) anim.play()
    const step = (now: number) => {
      const t = rampMs ? Math.min(1, (now - start) / rampMs) : 1
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      rate.current = from + (target - from) * eased
      anim.playbackRate = rate.current
      if (t < 1) frame.current = requestAnimationFrame(step)
      else if (target === 0) anim.pause()
    }
    frame.current = requestAnimationFrame(step)
  }, [target, rampMs, originX, originY])

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      animation.current?.cancel()
      // Strict Mode remounts reuse this component, so forget the cancelled animation.
      animation.current = null
      rate.current = 0
    },
    []
  )

  return (
    <div ref={ref} className="bb-layer">
      {children}
    </div>
  )
}

/** Out-and-back travel; returns smoothly to rest when it stops. */
function TravelLayer({
  travel,
  ms,
  children,
}: {
  travel: Presentation["travel"]
  ms: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation | null>(null)
  const reduced = useReducedMotion()
  const active = travel && !reduced ? travel : null
  const key = active ? `${active.dx},${active.dy},${active.seconds}` : ""

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const current = animation.current
    if (current) {
      const now = getComputedStyle(el).transform
      current.cancel()
      animation.current = null
      if (!active && now && now !== "none")
        el.animate([{ transform: now }, { transform: "none" }], {
          duration: ms,
          easing: EASE,
        })
    }
    if (active) {
      animation.current = el.animate(
        [
          { transform: "translate(0, 0)" },
          { transform: `translate(${active.dx}px, ${active.dy}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          duration: active.seconds * 1000,
          iterations: Infinity,
          easing: "ease-in-out",
        }
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms])

  useEffect(
    () => () => {
      animation.current?.cancel()
      animation.current = null
    },
    []
  )

  return (
    <div ref={ref} className="bb-layer">
      {children}
    </div>
  )
}

function BlinkLayer({
  blink,
  children,
}: {
  blink: Presentation["blink"]
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const animation = useRef<Animation | null>(null)
  const reduced = useReducedMotion()
  const key = blink && !reduced ? `${blink.seconds}:${blink.style}` : ""

  useLayoutEffect(() => {
    animation.current?.cancel()
    animation.current = null
    const el = ref.current
    if (!el || !key || !blink) return
    animation.current =
      blink.style === "hide"
        ? el.animate(
            [
              { opacity: 1 },
              { opacity: 1, offset: 0.5 },
              { opacity: 0, offset: 0.5 },
              { opacity: 0 },
            ],
            { duration: blink.seconds * 1000, iterations: Infinity }
          )
        : el.animate([{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }], {
            duration: blink.seconds * 1000,
            iterations: Infinity,
            easing: "ease-in-out",
          })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => () => animation.current?.cancel(), [])

  return (
    <div ref={ref} className="bb-layer">
      {children}
    </div>
  )
}

/**
 * A loadable URL for an image shape's artwork. Asset `src`s can be store-internal
 * (`asset:…`), so they go through tldraw's resolver like the image itself does.
 */
function useImageSrc(shape: TLShape): string | null {
  const isImage = shape.type === "image"
  const props = shape.props as { assetId?: TLAssetId | null; w?: number }
  const { url } = useImageOrVideoAsset({
    shapeId: shape.id,
    assetId: isImage ? (props.assetId ?? null) : null,
    width: props.w ?? 0,
  })
  return isImage ? url : null
}

/** Image symbols are recolored by masking a color with the image's own alpha. */
function ImageTint({ shape, color }: { shape: TLShape; color: string }) {
  const src = useImageSrc(shape)
  if (!src) return null
  const mask = `url("${src}") center / 100% 100% no-repeat`
  return (
    <div
      className="bb-layer pointer-events-none"
      style={{
        background: color,
        mask,
        WebkitMask: mask,
        transition: "background-color 0.3s ease",
      }}
    />
  )
}

/** Fills the shape from one side, clipped to its outline (or its artwork, for images). */
function LevelFill({
  shape,
  level,
  ms,
}: {
  shape: TLShape
  level: NonNullable<Presentation["level"]>
  ms: number
}) {
  const editor = useEditor()
  const src = useImageSrc(shape)
  const clip = useValue(
    "level clip",
    () => {
      if (shape.type === "image")
        return src
          ? { mask: `url("${src}") center / 100% 100% no-repeat` }
          : null
      const geometry = editor.getShapeGeometry(shape.id)
      const outline =
        geometry instanceof Group2d
          ? (geometry.children.find((child) => !child.isLabel) ?? geometry)
          : geometry
      if (!outline.isClosed) return null
      return { clipPath: `path("${outline.toSimpleSvgPath()}")` }
    },
    [editor, shape, src]
  )
  if (!clip) return null

  const pct = `${level.pct}%`
  const bar: CSSProperties =
    level.direction === "up"
      ? { left: 0, right: 0, bottom: 0, height: pct }
      : level.direction === "down"
        ? { left: 0, right: 0, top: 0, height: pct }
        : level.direction === "left"
          ? { top: 0, bottom: 0, left: 0, width: pct }
          : { top: 0, bottom: 0, right: 0, width: pct }

  return (
    <div
      className="bb-layer pointer-events-none"
      style={{ ...clip, WebkitMask: clip.mask }}
    >
      <div
        style={{
          position: "absolute",
          ...bar,
          background: level.color,
          opacity: 0.55,
          transition: `height ${ms}ms ${EASE}, width ${ms}ms ${EASE}, background-color 0.3s ease`,
        }}
      />
    </div>
  )
}
