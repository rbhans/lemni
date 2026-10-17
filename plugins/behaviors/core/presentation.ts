// Composes a rendered shape's presentation from its own behaviors and its groups'.
// Pure: callers pass a reader for live values and frames for each owner.

import {
  emptyPresentation,
  getEffect,
  type OwnerFrame,
  type Presentation,
} from "./effects.ts"
import {
  evaluateMapping,
  evaluateSwitch,
  resolveNumber,
  type InputValue,
} from "./evaluate.ts"
import type { Behavior, PointRef } from "./model.ts"

export interface OwnerEntry {
  behaviors: Behavior[]
  frame: OwnerFrame
}

export interface Problem {
  behaviorId: string
  message: string
}

export type ReadValue = (
  ref: PointRef,
  behavior: Behavior
) => InputValue | undefined

function conditionsHold(behavior: Behavior, read: ReadValue): boolean | null {
  for (const condition of behavior.conditions) {
    const result = evaluateSwitch(
      condition.mapping,
      read(condition.ref, behavior)
    )
    if (result === null) return null
    if (!result) return false
  }
  return true
}

/**
 * Owners are ordered nearest first (the shape, then its parent group, …). For each
 * channel the nearest owner with a usable value wins; follow transforms from
 * different owners compose (outermost applied first).
 */
export function composePresentation(
  owners: OwnerEntry[],
  read: ReadValue
): { presentation: Presentation; problems: Problem[] } {
  const p = emptyPresentation()
  const problems: Problem[] = []
  const claimed = new Set<string>()
  const transformsByOwner: Presentation["transforms"][] = []
  let transitionMs: number | null = null

  for (const owner of owners) {
    const ownerTransforms: Presentation["transforms"] = []
    // The first bound point's status, whatever its effect (a symbol's status plate).
    if (owner.frame.isSelf) {
      const first = owner.behaviors.find((b) => b.enabled && b.source)
      if (first?.source) p.status = read(first.source, first)?.status ?? null
    }
    for (const behavior of owner.behaviors) {
      if (!behavior.enabled) continue
      const def = getEffect(behavior.effect)
      if (!def?.apply) continue
      if (def.selfOnly && !owner.frame.isSelf) continue
      const channel = def.channel(behavior.params)
      if (channel && claimed.has(channel)) continue

      const holds = conditionsHold(behavior, read)
      if (holds === null) {
        problems.push({
          behaviorId: behavior.id,
          message: "A condition point has no value.",
        })
        continue
      }
      const input = behavior.source
        ? read(behavior.source, behavior)
        : undefined
      if (def.needsSource && !input) {
        problems.push({
          behaviorId: behavior.id,
          message: "No value from the point.",
        })
        continue
      }
      // A failed condition counts as "off": switch effects turn off, others keep their saved look.
      const expects = def.output(behavior.params)
      const out = holds
        ? evaluateMapping(
            behavior.mapping,
            input,
            expects === "number" ? "number" : undefined
          )
        : expects === "boolean"
          ? { kind: "boolean" as const, value: false }
          : null
      if (!out) {
        if (holds)
          problems.push({
            behaviorId: behavior.id,
            message: "The value couldn't be mapped.",
          })
        if (channel) claimed.add(channel)
        continue
      }

      // Each owner collects its own follow transforms so they compose in owner order.
      const shared = p.transforms
      p.transforms = ownerTransforms
      def.apply(
        p,
        out,
        {
          frame: owner.frame,
          status: input?.status,
          num: (name, fallback) =>
            resolveNumber(behavior.params[name], fallback, (bound) =>
              read(bound.bind, behavior)
            ),
        },
        behavior.params
      )
      p.transforms = shared
      if (channel) claimed.add(channel)
      if (owner.frame.isSelf || transitionMs === null)
        transitionMs = behavior.transition.ms
    }
    transformsByOwner.push(ownerTransforms)
  }

  // Outermost owner's transforms apply first.
  p.transforms = transformsByOwner.reverse().flat()
  p.transitionMs = transitionMs ?? 400
  return { presentation: p, problems }
}

/** CSS transform for the composed follow transforms, in shape-local pixels. */
export function transformToCss(transforms: Presentation["transforms"]): string {
  if (!transforms.length) return ""
  return transforms
    .map((op) => {
      switch (op.kind) {
        case "translate":
          return `translate(${op.x}px, ${op.y}px)`
        case "rotate":
          return `translate(${op.origin.x}px, ${op.origin.y}px) rotate(${op.deg}deg) translate(${-op.origin.x}px, ${-op.origin.y}px)`
        case "scale":
          return `translate(${op.origin.x}px, ${op.origin.y}px) scale(${op.factor}) translate(${-op.origin.x}px, ${-op.origin.y}px)`
      }
    })
    .join(" ")
}
