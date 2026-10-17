import { persistentAtom } from "@/studio/state"

const isIntensity = (value: unknown): value is number =>
  typeof value === "number" && value >= 0 && value <= 3

const isColor = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))

const isColors = (value: unknown): value is BackgroundColors =>
  typeof value === "object" &&
  value !== null &&
  isColor((value as BackgroundColors).primary) &&
  isColor((value as BackgroundColors).secondary)

/** How strongly the animated backgrounds are drawn; 1 is the default. */
export const backgroundIntensity = persistentAtom(
  "lemscape.canvas-background-intensity.v1",
  1,
  isIntensity
)

/** Hex colors the backgrounds blend between; `null` follows the theme. */
export interface BackgroundColors {
  primary: string | null
  secondary: string | null
}

export const backgroundColors = persistentAtom<BackgroundColors>(
  "lemscape.canvas-background-colors.v1",
  { primary: null, secondary: null },
  isColors
)

/** The theme tokens each color falls back to. */
export const THEME_COLOR_TOKENS = {
  primary: "--primary",
  secondary: "--chart-2",
} as const
