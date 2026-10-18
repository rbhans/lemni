// The board as a file: new, open, save, and Paste special. The core plugin puts these
// in the File and Edit menus; other plugins can call them too.

export {
  newBoard,
  openBoard,
  openRecent,
  saveBoard,
  supportsFileAccess,
} from "@/studio/files/board-files"

/** Opens the Paste special dialog. */
export { pasteSpecialOpen } from "@/studio/editor/paste"
