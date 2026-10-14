import {
  AlignBoxBottomCenterIcon,
  AlignBoxMiddleCenterIcon,
  AlignBoxMiddleLeftIcon,
  AlignBoxMiddleRightIcon,
  AlignBoxTopCenterIcon,
  ArrowAllDirectionIcon,
  ArrowDown02Icon,
  ArrowExpand01Icon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  ArrowUp02Icon,
  DropletIcon,
  EyeIcon,
  FlashIcon,
  FlowIcon,
  Navigation03Icon,
  PaintBucketIcon,
  Rotate01Icon,
  TextFontIcon,
  ToggleOnIcon,
  TransparencyIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import type { Family } from "../core/effects"
import type { ParamValue } from "../core/model"

export const FAMILIES: { id: Family; label: string }[] = [
  { id: "display", label: "Display" },
  { id: "appearance", label: "Appearance" },
  { id: "motion", label: "Motion" },
  { id: "interaction", label: "Interaction" },
]

export const FAMILY_TONE: Record<Family, string> = {
  display: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300",
  appearance: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  motion: "bg-primary/25 text-foreground",
  interaction: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
}

type Params = Record<string, ParamValue>

export type FieldDef =
  | {
      key: string
      label: string
      kind: "segmented"
      options: { value: string; label: string; icon?: IconSvgElement }[]
      showIf?(p: Params): boolean
    }
  | {
      key: string
      label: string
      kind: "number"
      unit?: string
      min?: number
      max?: number
      step?: number
      bindable?: boolean
      showIf?(p: Params): boolean
    }
  | {
      key: string
      label: string
      kind: "color" | "text" | "pivot" | "switch" | "target" | "state"
      showIf?(p: Params): boolean
    }

export interface EffectUi {
  icon: IconSvgElement
  /** The mode switch shown first under DO (e.g. follow vs spin). */
  mode?: { options: { value: string; label: string }[] }
  fields: FieldDef[]
  /** Unit for the output side of a range mapping. */
  outputUnit?(p: Params): string
  /** Helps the person read the mapping, e.g. "Spins while". */
  whenLabel?(p: Params): string
}

const isMode = (mode: string) => (p: Params) => p.mode === mode

export const EFFECT_UI: Record<string, EffectUi> = {
  state: {
    icon: ToggleOnIcon,
    outputUnit: (p) => (p.stateKind === "number" ? "%" : ""),
    whenLabel: (p) =>
      p.stateKind === "number"
        ? "When"
        : `${typeof p.stateLabel === "string" && p.stateLabel ? p.stateLabel : "On"} while`,
    fields: [{ key: "state", label: "State", kind: "state" }],
  },
  label: {
    icon: TextFontIcon,
    fields: [
      { key: "caption", label: "Caption", kind: "text" },
      {
        key: "placement",
        label: "Place",
        kind: "segmented",
        options: [
          { value: "top", label: "Above", icon: AlignBoxTopCenterIcon },
          { value: "bottom", label: "Below", icon: AlignBoxBottomCenterIcon },
          { value: "left", label: "Left", icon: AlignBoxMiddleLeftIcon },
          { value: "right", label: "Right", icon: AlignBoxMiddleRightIcon },
          { value: "center", label: "Center", icon: AlignBoxMiddleCenterIcon },
        ],
      },
      {
        key: "size",
        label: "Size",
        kind: "segmented",
        options: [
          { value: "s", label: "S" },
          { value: "m", label: "M" },
          { value: "l", label: "L" },
        ],
      },
      {
        key: "colorMode",
        label: "Color",
        kind: "segmented",
        options: [
          { value: "status", label: "By status" },
          { value: "fixed", label: "Fixed" },
        ],
      },
      {
        key: "color",
        label: "Text color",
        kind: "color",
        showIf: (p) => p.colorMode === "fixed",
      },
      { key: "background", label: "Background", kind: "switch" },
    ],
  },
  color: {
    icon: PaintBucketIcon,
    fields: [
      {
        key: "target",
        label: "Apply to",
        kind: "segmented",
        options: [
          { value: "fill", label: "Fill" },
          { value: "stroke", label: "Lines" },
          { value: "both", label: "Both" },
        ],
      },
      {
        key: "statusOverride",
        label: "Alarm and fault colors win",
        kind: "switch",
      },
    ],
  },
  level: {
    icon: DropletIcon,
    outputUnit: () => "%",
    fields: [
      {
        key: "direction",
        label: "Fill",
        kind: "segmented",
        options: [
          { value: "up", label: "From bottom", icon: ArrowUp02Icon },
          { value: "down", label: "From top", icon: ArrowDown02Icon },
          { value: "left", label: "From left", icon: ArrowRight02Icon },
          { value: "right", label: "From right", icon: ArrowLeft02Icon },
        ],
      },
      { key: "color", label: "Color", kind: "color" },
    ],
  },
  visibility: { icon: EyeIcon, fields: [], whenLabel: () => "Show while" },
  opacity: { icon: TransparencyIcon, fields: [], outputUnit: () => "%" },
  blink: {
    icon: FlashIcon,
    whenLabel: () => "Blink while",
    fields: [
      {
        key: "seconds",
        label: "Every",
        kind: "number",
        unit: "s",
        min: 0.2,
        max: 10,
        step: 0.1,
        bindable: true,
      },
      {
        key: "style",
        label: "Style",
        kind: "segmented",
        options: [
          { value: "fade", label: "Fade" },
          { value: "hide", label: "On/off" },
        ],
      },
    ],
  },
  rotate: {
    icon: Rotate01Icon,
    mode: {
      options: [
        { value: "follow", label: "Follow value" },
        { value: "spin", label: "Spin while true" },
      ],
    },
    outputUnit: () => "°",
    whenLabel: (p) => (p.mode === "spin" ? "Spin while" : "When"),
    fields: [
      {
        key: "secondsPerTurn",
        label: "Speed",
        kind: "number",
        unit: "s/turn",
        min: 0.1,
        max: 60,
        step: 0.1,
        bindable: true,
        showIf: isMode("spin"),
      },
      {
        key: "direction",
        label: "Turn",
        kind: "segmented",
        options: [
          { value: "cw", label: "Clockwise" },
          { value: "ccw", label: "Counter" },
        ],
      },
      { key: "pivot", label: "Pivot", kind: "pivot" },
    ],
  },
  move: {
    icon: ArrowAllDirectionIcon,
    mode: {
      options: [
        { value: "follow", label: "Follow value" },
        { value: "travel", label: "Travel while true" },
      ],
    },
    outputUnit: () => "px",
    whenLabel: (p) => (p.mode === "travel" ? "Travel while" : "When"),
    fields: [
      {
        key: "axis",
        label: "Axis",
        kind: "segmented",
        options: [
          { value: "x", label: "Horizontal" },
          { value: "y", label: "Vertical" },
        ],
      },
      {
        key: "distance",
        label: "Distance",
        kind: "number",
        unit: "px",
        min: -2000,
        max: 2000,
        step: 1,
        bindable: true,
        showIf: isMode("travel"),
      },
      {
        key: "seconds",
        label: "Cycle",
        kind: "number",
        unit: "s",
        min: 0.2,
        max: 120,
        step: 0.1,
        bindable: true,
        showIf: isMode("travel"),
      },
    ],
  },
  scale: { icon: ArrowExpand01Icon, fields: [], outputUnit: () => "%" },
  flow: {
    icon: FlowIcon,
    whenLabel: () => "Flow while",
    fields: [
      {
        key: "seconds",
        label: "Speed",
        kind: "number",
        unit: "s/cycle",
        min: 0.1,
        max: 10,
        step: 0.1,
        bindable: true,
      },
      { key: "reverse", label: "Reverse direction", kind: "switch" },
    ],
  },
  navigate: {
    icon: Navigation03Icon,
    fields: [
      { key: "target", label: "Go to", kind: "target" },
      {
        key: "framing",
        label: "Framing",
        kind: "segmented",
        options: [
          { value: "fit", label: "Fit" },
          { value: "center", label: "Center" },
        ],
      },
    ],
  },
}
