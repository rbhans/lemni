// Board file naming and the recent-boards list. Pure module (no DOM, no tldraw).

export const BOARD_EXTENSION = ".lemscape"
/** Boards saved under the product's earlier names (Lemni, then BAS Board before it). */
export const LEGACY_EXTENSIONS = [".lemni", ".basboard"] as const
/** What Open accepts: our boards (old and new), plus plain tldraw files. */
export const OPENABLE_EXTENSIONS = [
  BOARD_EXTENSION,
  ...LEGACY_EXTENSIONS,
  ".tldr",
  ".json",
] as const
export const UNTITLED_BOARD = "Untitled board"

/** "AHU-1 graphics.lemscape" → "AHU-1 graphics". */
export function boardNameFromFileName(fileName: string): string {
  let name = fileName.trim()
  for (const ext of OPENABLE_EXTENSIONS) {
    if (name.toLowerCase().endsWith(ext)) {
      name = name.slice(0, -ext.length)
      break
    }
  }
  return name.trim() || UNTITLED_BOARD
}

/** A safe file name for a board: no path or reserved characters, one extension. */
export function fileNameForBoard(name: string): string {
  const base = boardNameFromFileName(name)
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 120)
  return `${base || UNTITLED_BOARD}${BOARD_EXTENSION}`
}

export interface RecentEntry<H = unknown> {
  id: string
  name: string
  openedAt: number
  handle: H
}

/** Puts `entry` first (replacing an older entry with the same id) and keeps the list short. */
export function rememberRecent<H>(
  list: readonly RecentEntry<H>[],
  entry: RecentEntry<H>,
  max = 8
): RecentEntry<H>[] {
  return [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, max)
}
