import { atom, react, type Atom } from "tldraw"

import { UNTITLED_BOARD } from "./files/board-file"
import { EMPTY_PREFERENCES, type PluginPreferences } from "./plugins/registry"

/** A signal that restores from and writes back to localStorage. */
export function persistentAtom<T>(
  key: string,
  initial: T,
  isValid: (value: unknown) => value is T
): Atom<T> {
  let start = initial
  try {
    const raw = window.localStorage.getItem(key)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (isValid(parsed)) start = parsed
    }
  } catch {
    // Private mode or blocked storage: fall back to the default for this session.
  }
  const value = atom(key, start)
  react(`persist ${key}`, () => {
    const next = value.get()
    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Ignore; the choice still applies until reload.
    }
  })
  return value
}

const isString = (value: unknown): value is string => typeof value === "string"
const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean"
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString)
const isPanelMap = (value: unknown): value is Record<string, string | null> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every((entry) => entry === null || isString(entry))
const isPluginPreferences = (value: unknown): value is PluginPreferences =>
  typeof value === "object" &&
  value !== null &&
  isStringArray((value as PluginPreferences).enabled) &&
  isStringArray((value as PluginPreferences).disabled)

export const studioState = {
  workspace: persistentAtom("lemscape.workspace.v1", "canvas", isString),
  /** Open left panel per workspace. `null` means collapsed. */
  leftPanels: persistentAtom<Record<string, string | null>>(
    "lemscape.left-panels.v1",
    {},
    isPanelMap
  ),
  rightPanelOpen: persistentAtom("lemscape.right-panel.v1", true, isBoolean),
  /** Settings → Interface: a short name under each panel icon in the rail. */
  railLabels: persistentAtom("lemscape.rail-labels.v1", false, isBoolean),
  pluginPreferences: persistentAtom(
    "lemscape.plugins.v1",
    EMPTY_PREFERENCES,
    isPluginPreferences
  ),
  pluginManagerOpen: atom("plugin-manager-open", false),
  /** Settings dialog: the page to show, "" for the first, `null` when closed. */
  settingsPage: atom<string | null>("settings page", null),
  /** Plugins whose options are left out of the menu for points dropped on the board. */
  pointMenuHidden: persistentAtom<string[]>(
    "lemscape.point-menu-hidden.v1",
    [],
    isStringArray
  ),
  /** Canvas background id from a `canvasBackgrounds` contribution; "none" is the plain fill. */
  canvasBackground: persistentAtom(
    "lemscape.canvas-background.v1",
    "none",
    isString
  ),
  inspectorTab: atom<string | null>("inspector tab", null),
  /** Present mode: chrome hidden, board read-only, click interactions active. */
  presenting: atom("presenting", false),
  /** The open board's name (its file name without the extension). */
  boardName: persistentAtom("lemscape.board-name.v1", UNTITLED_BOARD, isString),
  /** Changed since it was last saved to a file. The working copy itself is always kept. */
  boardDirty: persistentAtom("lemscape.board-dirty.v1", false, isBoolean),
  /** Command palette; "recent" opens it filtered to recent boards. */
  commandPalette: atom<"closed" | "open" | "recent">(
    "command palette",
    "closed"
  ),
  shortcutSheetOpen: atom("shortcut sheet open", false),
}
