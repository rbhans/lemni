const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const SYMBOLS: Record<string, string> = isMac
  ? {
      cmd: "⌘",
      ctrl: "⌃",
      shift: "⇧",
      alt: "⌥",
      del: "⌫",
      backspace: "⌫",
      enter: "↵",
      esc: "Esc",
      comma: ",",
    }
  : {
      cmd: "Ctrl",
      ctrl: "Ctrl",
      shift: "Shift",
      alt: "Alt",
      del: "Del",
      backspace: "⌫",
      enter: "Enter",
      esc: "Esc",
      comma: ",",
    }

/**
 * Formats a tldraw shortcut for display. Accepts both `cmd+shift+z` and the
 * legacy symbols (`$` cmd, `!` shift, `?` alt). Alternatives after a comma are dropped.
 */
export function formatKbd(kbd: string | undefined): string[] {
  if (!kbd) return []
  const first = kbd.split(",")[0]
  const expanded = first
    .replaceAll("$", "cmd+")
    .replaceAll("!", "shift+")
    .replaceAll("?", "alt+")
  return expanded
    .split("+")
    .filter(Boolean)
    .map(
      (part) =>
        SYMBOLS[part.toLowerCase()] ??
        (part.length === 1 ? part.toUpperCase() : part)
    )
}
