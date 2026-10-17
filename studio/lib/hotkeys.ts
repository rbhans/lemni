// Keyboard shortcuts written the way menus show them ("cmd+shift+s", "shift+/"), matched
// against key events. "cmd" is ⌘ on a Mac and Ctrl elsewhere. Pure module.

export interface Chord {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
}

export interface KeyLike {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** "cmd+shift+s" → one chord per comma-separated alternative ("comma" names the key). Legacy `$`/`!` work too. */
export function parseKbd(kbd: string): Chord[] {
  return kbd
    .split(",")
    .map((alt) => alt.trim())
    .filter(Boolean)
    .map((alt) => {
      // Legacy prefixes stack: `$` cmd, `!` shift, `?` alt ("$!z" = cmd+shift+z).
      let expanded = alt
      const legacy: Record<string, string> = {
        $: "cmd+",
        "!": "shift+",
        "?": "alt+",
      }
      let prefix = ""
      while (expanded.length > 1 && legacy[expanded[0]]) {
        prefix += legacy[expanded[0]]
        expanded = expanded.slice(1)
      }
      expanded = prefix + expanded
      const parts = expanded.split("+").map((p) => p.trim().toLowerCase())
      // "shift++" style keys: the key itself may be "+".
      const last = expanded.endsWith("++") ? "+" : (parts.pop() ?? "")
      // "," separates alternatives, so a comma key is spelled "comma".
      const key = last === "comma" ? "," : last
      return {
        key,
        mod: parts.some((p) => p === "cmd" || p === "ctrl" || p === "mod"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt") || parts.includes("option"),
      }
    })
}

const CODE_FOR: Record<string, string> = {
  "/": "Slash",
  ".": "Period",
  ",": "Comma",
  "[": "BracketLeft",
  "]": "BracketRight",
  "-": "Minus",
  "=": "Equal",
}

/** The physical key a chord names, so shifted punctuation ("?" is shift+/) still matches. */
function codeFor(key: string): string | null {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return CODE_FOR[key] ?? null
}

/** The character shift+key types on a US layout; other layouts reach it on other keys. */
const SHIFTED: Record<string, string> = {
  "/": "?",
  "1": "!",
  "2": "@",
  "=": "+",
  "-": "_",
}

export function matchesChord(e: KeyLike, chord: Chord, mac = IS_MAC): boolean {
  // "shift+/" means "?": accept the typed character whatever key produced it.
  if (
    chord.shift &&
    !chord.mod &&
    !chord.alt &&
    SHIFTED[chord.key] === e.key &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  )
    return true
  const mod = mac ? e.metaKey : e.ctrlKey
  const stray = mac ? e.ctrlKey : e.metaKey
  if (
    mod !== chord.mod ||
    stray ||
    e.shiftKey !== chord.shift ||
    e.altKey !== chord.alt
  )
    return false
  const code = codeFor(chord.key)
  if (code && e.code) return e.code === code
  return e.key.toLowerCase() === chord.key
}

export function matchesKbd(e: KeyLike, kbd: string, mac = IS_MAC): boolean {
  return parseKbd(kbd).some((chord) => matchesChord(e, chord, mac))
}

/** Plain-key shortcuts must not fire while someone is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).closest !== "function")
    return false
  const el = target as HTMLElement
  return Boolean(
    el.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true']"
    )
  )
}

/** True when the chord uses ⌘/Ctrl or Alt, so it is safe to run even inside a text field. */
export function hasModifier(kbd: string): boolean {
  return parseKbd(kbd).every((chord) => chord.mod || chord.alt)
}
