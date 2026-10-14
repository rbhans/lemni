import { DEFAULT_THEME, type TLTheme } from "tldraw"

// The canvas draws selection, brush and snap lines itself (2D canvas), so the
// preset's accent has to be set on tldraw's theme object, not only in CSS.
// Values mirror app/globals.css: stone neutrals, lime accent.
export const boardTheme: TLTheme = {
  ...DEFAULT_THEME,
  colors: {
    light: {
      ...DEFAULT_THEME.colors.light,
      background: "#fafaf9",
      selectionStroke: "#5ea500",
      selectionFill: "rgba(154, 230, 0, 0.16)",
      brushStroke: "rgba(94, 165, 0, 0.55)",
      brushFill: "rgba(154, 230, 0, 0.10)",
    },
    dark: {
      ...DEFAULT_THEME.colors.dark,
      background: "#0c0a09",
      selectionStroke: "#7ccf00",
      selectionFill: "rgba(124, 207, 0, 0.14)",
      brushStroke: "rgba(124, 207, 0, 0.55)",
      brushFill: "rgba(124, 207, 0, 0.10)",
    },
  },
}

export const boardThemes = { default: boardTheme }
