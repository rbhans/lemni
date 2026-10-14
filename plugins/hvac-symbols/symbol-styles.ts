"use client"

import { useInsertionEffect } from "react"

import { SHARED_CSS, type SymbolPiece } from "./library"

const injected = new Set<string>()

function inject(id: string, css: string) {
  if (injected.has(id) || typeof document === "undefined") return
  injected.add(id)
  // Reuse a sheet left by a previous load (dev reloads), refreshing it if the CSS changed.
  const style =
    (document.getElementById(id) as HTMLStyleElement | null) ??
    document.head.appendChild(
      Object.assign(document.createElement("style"), { id })
    )
  if (style.textContent !== css) style.textContent = css
}

/**
 * Each piece's (already scoped) CSS goes into <head> once, however many copies of it
 * are on the board, instead of repeating a <style> inside every instance.
 */
export function useSymbolStyles(piece: SymbolPiece | undefined) {
  useInsertionEffect(() => {
    inject("bas-symbol-shared", SHARED_CSS)
    if (piece) inject(`bas-symbol-${piece.scope}`, piece.css)
  }, [piece])
}
