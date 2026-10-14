import type { Editor, JsonObject } from "tldraw"

/**
 * Writes the board's document-level meta as an undoable change. tldraw's own
 * `updateDocumentSettings` skips history, which would make links and categories
 * impossible to undo.
 */
export function writeDocumentMeta(editor: Editor, meta: JsonObject) {
  editor.run(() => {
    editor.store.put([{ ...editor.getDocumentSettings(), meta }])
  })
}
