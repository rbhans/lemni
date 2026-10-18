// The studio around the canvas: the context handed to plugin callbacks, shared UI
// pieces (icons, tooltips, property-panel fields) and the shell's state and actions.

import type { Atom, Signal } from "tldraw"

import { openConnect, studioState } from "@/studio/state"

export { useStudioContext } from "@/studio/studio-context"

/** Hugeicons with the studio's size and stroke defaults (`size-4`, stroke 1.6). */
export { Icon } from "@/studio/shell/icon"

/** A tooltip with an optional shortcut, e.g. `<Tip label="Grid" kbd="cmd+'">`. */
export { Tip } from "@/studio/shell/tip"

/**
 * Property-panel building blocks, so sections look like the rest of the app: a labelled
 * row, number, color and select fields, a segmented control, and a dock panel header.
 */
export {
  ColorField,
  NumberField,
  PanelHeader,
  PropertyRow,
  Segmented,
  SelectField,
  type SegmentedOption,
} from "@/studio/shell/fields"

/** Click-to-rename text, as in the Layers panel. */
export { InlineName, useInlineEditing } from "@/studio/shell/inline-name"

/** A connection's rail icon: a letter badge, dashed while it isn't connected. */
export {
  sourceIcon,
  type SourceBadge,
  type SourceLetter,
} from "@/studio/shell/source-icon"

/**
 * The shell's state and actions. Read the atoms reactively with tldraw's `useValue`
 * (`useValue(shell.presenting)`), or with `.get()` outside React.
 */
export const shell = {
  /** Present mode: chrome hidden, the board read-only, controls live. Set it to enter or leave. */
  presenting: studioState.presenting as Atom<boolean>,
  /** The open board's name (its file name without the extension). */
  boardName: studioState.boardName as Signal<string>,
  /** Whether the right-hand properties panel is open. */
  rightPanelOpen: studioState.rightPanelOpen as Atom<boolean>,
  /** Settings → Interface: names under the rail icons. */
  railLabels: studioState.railLabels as Atom<boolean>,
  /** The canvas background's id (a `canvasBackgrounds` contribution); "none" is plain. */
  canvasBackground: studioState.canvasBackground as Atom<string>,

  /** Opens a left panel in the current workspace (outside React; in callbacks use ctx.openPanel). */
  showPanel(panelId: string) {
    const workspace = studioState.workspace.get()
    studioState.leftPanels.update((panels) => ({
      ...panels,
      [workspace]: panelId,
    }))
  },
  /** Opens Settings, at a page when given (a `settingsSections` page name). */
  openSettings(page = "") {
    studioState.settingsPage.set(page)
  },
  /** Opens the command palette; "recent" lists recent boards. */
  openCommandPalette(mode: "open" | "recent" = "open") {
    studioState.commandPalette.set(mode)
  },
  openShortcuts() {
    studioState.shortcutSheetOpen.set(true)
  },
  openPlugins() {
    studioState.pluginManagerOpen.set(true)
  },
  /**
   * Opens Connect…: every enabled connection probe checks the address and the
   * matching connection's form opens filled in. Checks straight away when given one.
   */
  openConnect(address = "") {
    openConnect(address)
  },
}
