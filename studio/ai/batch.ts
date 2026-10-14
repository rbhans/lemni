"use client"

import type { Editor } from "tldraw"

/**
 * Runs board changes as one batch without letting an error crash the editor: tldraw
 * treats anything thrown inside a batch as fatal. The error is caught inside and thrown
 * again outside; changes made before it stay (the person can undo them). AI tools use
 * this for any change made after an `await`; the AI connection already wraps the
 * synchronous part of every edit tool.
 */
export function safeBatch<T>(editor: Editor, fn: () => T): T {
  let result: { value: T } | null = null
  let failure: unknown = null
  editor.run(() => {
    try {
      result = { value: fn() }
    } catch (error) {
      failure = error
    }
  })
  if (!result) throw failure ?? new Error("The change didn't finish.")
  return (result as { value: T }).value
}
