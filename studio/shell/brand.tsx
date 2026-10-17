"use client"

import { useRef } from "react"

import { cn } from "@/lib/utils"

import {
  MARK_LOOP,
  MARK_ORBIT,
  MARK_POINT,
  MARK_POINT_RADIUS,
  MARK_POINT_RING,
  MARK_VIEWBOX,
} from "./brand-mark"

export const PRODUCT_NAME = "Lemscape"
export const PRODUCT_TAGLINE = "The endless canvas for buildings"

/** One trip round the loop. A brand moment, not routine UI, so it can take its time. */
const ORBIT_MS = 900

/**
 * The Lemscape mark: an endless loop laid on the ground with a live point travelling
 * it. The loop takes the text color; the point is lime (darker in light mode), ringed in
 * the background color so it sits on top of the line. Hovering sends the point once
 * round the loop (mouse only, and never under Reduce motion).
 */
export function BrandMark({
  className,
  still = false,
}: {
  className?: string
  /** Reduce motion: the point stays put. */
  still?: boolean
}) {
  const orbit = useRef<SVGElement>(null)
  const running = useRef(false)

  const travel = () => {
    // Touch fires a hover on tap; a trip already under way finishes rather than restarting.
    if (still || running.current) return
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    running.current = true
    ;(orbit.current as SVGAnimationElement | null)?.beginElement()
    window.setTimeout(() => (running.current = false), ORBIT_MS)
  }

  return (
    <span
      className={cn("flex items-center justify-center", className)}
      onPointerEnter={travel}
    >
      <svg
        viewBox={MARK_VIEWBOX}
        role="img"
        aria-label={PRODUCT_NAME}
        className="h-auto w-[26px] overflow-visible"
      >
        {MARK_LOOP.map(({ width, d }) => (
          <path
            key={width}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={width}
            strokeLinecap="round"
          />
        ))}
        <g>
          <circle
            {...MARK_POINT}
            r={MARK_POINT_RING}
            className="fill-background"
          />
          <circle
            {...MARK_POINT}
            r={MARK_POINT_RADIUS}
            className="fill-sidebar-primary"
          />
          {/* Strong ease-in-out: on-screen movement that starts and ends at rest. */}
          <animateMotion
            ref={orbit}
            path={MARK_ORBIT}
            dur={`${ORBIT_MS}ms`}
            begin="indefinite"
            fill="remove"
            calcMode="spline"
            keyPoints="0;1"
            keyTimes="0;1"
            keySplines="0.77 0 0.175 1"
          />
        </g>
      </svg>
    </span>
  )
}
