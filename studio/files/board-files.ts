"use client"

// Board files: the board you're editing always lives in browser storage (the working
// copy); these operations move it to and from `.lemni` files on disk. Where the
// browser supports the File System Access API, Save writes back to the same file and
// recent boards reopen by handle; elsewhere Save downloads a copy and Open uploads one.

import { toast } from "sonner"
import {
  atom,
  PageRecordType,
  parseTldrawJsonFile,
  serializeTldrawJson,
  type Editor,
} from "tldraw"

import { studioState } from "../state"
import {
  BOARD_EXTENSION,
  boardNameFromFileName,
  fileNameForBoard,
  OPENABLE_EXTENSIONS,
  rememberRecent,
  UNTITLED_BOARD,
  type RecentEntry,
} from "./board-file"
import { idbGet, idbSet } from "./handle-store"

export type RecentBoard = RecentEntry<FileSystemFileHandle>

/** The file the board was last opened from or saved to (null: never saved, or no file access). */
export const currentFile = atom<FileSystemFileHandle | null>(
  "current board file",
  null
)
export const recentBoards = atom<RecentBoard[]>("recent boards", [])

export type UnsavedChoice = "save" | "discard" | "cancel"
/** Set while the "save changes?" dialog is up; the dialog host resolves it. */
export const unsavedPrompt = atom<{
  name: string
  resolve(choice: UnsavedChoice): void
} | null>("unsaved prompt", null)

export const supportsFileAccess = () =>
  typeof window !== "undefined" &&
  typeof window.showSaveFilePicker === "function" &&
  typeof window.showOpenFilePicker === "function"

const OPEN_TYPES: FilePickerAcceptType[] = [
  {
    description: "Lemni board",
    accept: { "application/json": [...OPENABLE_EXTENSIONS] },
  },
]
const SAVE_TYPES: FilePickerAcceptType[] = [
  {
    description: "Lemni board",
    accept: { "application/json": [BOARD_EXTENSION] },
  },
]

const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError"

// ---- Change tracking ----------------------------------------------------------------

let suppressDirty = false

/** True while a whole board is being swapped in (New, Open): not an edit. */
export const isReplacingDocument = () => suppressDirty

/** Marks the board changed on any user edit to the document (not camera or selection). */
export function installBoardFiles(editor: Editor): () => void {
  const stop = editor.store.listen(
    () => {
      if (!suppressDirty && !studioState.boardDirty.get())
        studioState.boardDirty.set(true)
    },
    { source: "user", scope: "document" }
  )
  void (async () => {
    currentFile.set((await idbGet<FileSystemFileHandle>("current")) ?? null)
    recentBoards.set((await idbGet<RecentBoard[]>("recent")) ?? [])
  })()
  return stop
}

/** Swaps the whole document without it counting as an edit. */
async function replaceDocument(editor: Editor, replace: () => void) {
  suppressDirty = true
  try {
    replace()
    // Store listeners flush on the next frame; let them pass before tracking again.
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
  } finally {
    suppressDirty = false
    studioState.boardDirty.set(false)
  }
}

async function setCurrent(handle: FileSystemFileHandle | null, name: string) {
  currentFile.set(handle)
  studioState.boardName.set(name)
  await idbSet("current", handle)
  if (!handle) return
  let id = crypto.randomUUID()
  for (const item of recentBoards.get()) {
    if (await item.handle.isSameEntry(handle).catch(() => false)) id = item.id
  }
  const next = rememberRecent(recentBoards.get(), {
    id,
    name,
    openedAt: Date.now(),
    handle,
  })
  recentBoards.set(next)
  await idbSet("recent", next)
}

async function forgetRecent(id: string) {
  const next = recentBoards.get().filter((item) => item.id !== id)
  recentBoards.set(next)
  await idbSet("recent", next)
}

async function permitted(
  handle: FileSystemFileHandle,
  mode: "read" | "readwrite"
) {
  if (!handle.queryPermission) return true
  if ((await handle.queryPermission({ mode })) === "granted") return true
  return (await handle.requestPermission?.({ mode })) === "granted"
}

// ---- Unsaved changes --------------------------------------------------------------------

function askUnsaved(name: string): Promise<UnsavedChoice> {
  return new Promise((resolve) => {
    unsavedPrompt.set({
      name,
      resolve(choice) {
        unsavedPrompt.set(null)
        resolve(choice)
      },
    })
  })
}

/** Before replacing the board: offer to save it. False means the person cancelled. */
async function okToReplace(editor: Editor): Promise<boolean> {
  if (!studioState.boardDirty.get()) return true
  const choice = await askUnsaved(studioState.boardName.get())
  if (choice === "cancel") return false
  if (choice === "save") return saveBoard(editor)
  return true
}

// ---- Operations -------------------------------------------------------------------------

export async function newBoard(editor: Editor) {
  if (!(await okToReplace(editor))) return
  await replaceDocument(editor, () => {
    const id = PageRecordType.createId()
    editor.run(() => {
      editor.createPage({ id })
      editor.setCurrentPage(id)
      for (const page of editor.getPages())
        if (page.id !== id) editor.deletePage(page.id)
      // Named last: tldraw keeps page names unique, so "Page 1" is only free once the old pages are gone.
      editor.updatePage({ id, name: "Page 1" })
      editor.deleteAssets(editor.getAssets().map((asset) => asset.id))
    })
    editor.clearHistory()
    editor.setCamera({ x: 0, y: 0, z: 1 }, { immediate: true })
  })
  await setCurrent(null, UNTITLED_BOARD)
}

async function loadFile(editor: Editor, file: File): Promise<boolean> {
  const parsed = parseTldrawJsonFile({
    json: await file.text(),
    schema: editor.store.schema,
  })
  if (!parsed.ok) {
    const reason =
      parsed.error.type === "fileFormatVersionTooNew"
        ? "It was saved by a newer version."
        : parsed.error.type === "notATldrawFile"
          ? "It isn't a board file."
          : "The file looks damaged."
    toast.error(`Couldn't open ${file.name}`, { description: reason })
    return false
  }
  await replaceDocument(editor, () => {
    editor.loadSnapshot(parsed.value.getStoreSnapshot())
    editor.clearHistory()
    const bounds = editor.getCurrentPageBounds()
    if (bounds) editor.zoomToBounds(bounds, { targetZoom: 1, immediate: true })
  })
  return true
}

/** Fallback for browsers without file pickers. */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = OPENABLE_EXTENSIONS.join(",")
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export async function openBoard(editor: Editor) {
  if (!(await okToReplace(editor))) return
  try {
    if (supportsFileAccess()) {
      const [handle] = await window.showOpenFilePicker!({
        id: "boards",
        types: OPEN_TYPES,
      })
      const file = await handle.getFile()
      if (await loadFile(editor, file))
        await setCurrent(handle, boardNameFromFileName(file.name))
    } else {
      const file = await pickFile()
      if (file && (await loadFile(editor, file)))
        await setCurrent(null, boardNameFromFileName(file.name))
    }
  } catch (error) {
    if (!isAbort(error))
      toast.error("Couldn't open the board", { description: String(error) })
  }
}

export async function openRecent(editor: Editor, entry: RecentBoard) {
  if (!(await okToReplace(editor))) return
  try {
    if (!(await permitted(entry.handle, "read"))) return
    const file = await entry.handle.getFile()
    if (await loadFile(editor, file))
      await setCurrent(entry.handle, boardNameFromFileName(file.name))
  } catch (error) {
    if (isAbort(error)) return
    if (error instanceof DOMException && error.name === "NotFoundError") {
      toast.error(`${entry.name} was moved or deleted`, {
        description: "Removed it from recent boards.",
      })
      await forgetRecent(entry.id)
      return
    }
    toast.error(`Couldn't open ${entry.name}`, { description: String(error) })
  }
}

function download(json: string, fileName: string) {
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" })
  )
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: fileName,
  })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Save to the board's file (or ask where, the first time). Returns false if cancelled or failed. */
export async function saveBoard(
  editor: Editor,
  opts: { as?: boolean } = {}
): Promise<boolean> {
  try {
    let handle = opts.as ? null : currentFile.get()
    if (handle && !(await permitted(handle, "readwrite"))) handle = null
    if (!handle && supportsFileAccess()) {
      handle = await window.showSaveFilePicker!({
        id: "boards",
        suggestedName: fileNameForBoard(studioState.boardName.get()),
        types: SAVE_TYPES,
      })
    }
    // Images are written into the file, so a board travels as one file.
    const json = await serializeTldrawJson(editor)
    if (handle) {
      const writable = await handle.createWritable()
      await writable.write(json)
      await writable.close()
      await setCurrent(handle, boardNameFromFileName(handle.name))
    } else {
      download(json, fileNameForBoard(studioState.boardName.get()))
    }
    studioState.boardDirty.set(false)
    toast.success(`Saved ${studioState.boardName.get()}`)
    return true
  } catch (error) {
    if (!isAbort(error))
      toast.error("Couldn't save the board", { description: String(error) })
    return false
  }
}
