"use client"

import { atom, react } from "tldraw"

import { shell } from "@/sdk"

import type { SctNode } from "../shared"
import { sctApi } from "./api"
import { onReveal, sctConnection } from "./store"

export interface Branch {
  children?: SctNode[]
  loading?: boolean
  error?: string
}

/** The archive's top level, keyed like any other branch. */
export const ROOT = "root"

/** Loaded branches of the network tree, keyed by item id. Kept while the panel is closed. */
export const branches = atom<Record<string, Branch>>("sct branches", {})
export const expanded = atom<Record<string, boolean>>("sct expanded", {})
export const selectedFqr = atom<string | null>("sct selected point", null)

let lastConnection: string | null = null
react("reset sct tree", () => {
  const id = sctConnection.get()?.id ?? null
  if (id === lastConnection) return
  lastConnection = id
  branches.set({})
  expanded.set({})
  selectedFqr.set(null)
})

export async function loadBranch(key: string, force = false) {
  const info = sctConnection.get()
  if (!info) return
  const current = branches.get()[key]
  if (!force && (current?.children || current?.loading)) return
  branches.update((all) => ({
    ...all,
    [key]: { ...all[key], loading: true, error: undefined },
  }))
  try {
    const { nodes } = await sctApi.children(
      info.id,
      key === ROOT ? null : Number(key)
    )
    branches.update((all) => ({ ...all, [key]: { children: nodes } }))
  } catch (error) {
    branches.update((all) => ({
      ...all,
      [key]: {
        error: error instanceof Error ? error.message : "Couldn't load.",
      },
    }))
  }
}

export function toggleBranch(key: string) {
  const open = !expanded.get()[key]
  expanded.update((all) => ({ ...all, [key]: open }))
  if (open) void loadBranch(key)
}

/** Opens the Archive panel on a point, expanding the tree down to it. */
export async function revealFqr(fqr: string) {
  selectedFqr.set(fqr)
  shell.showPanel("sct-archive")
  const info = sctConnection.get()
  if (!info) return
  try {
    const { point } = await sctApi.describe(info.id, fqr)
    if (!point) return
    // The path runs from the top level down; the first entry is the archive's child.
    const keys = point.path.map((p) => String(p.id))
    expanded.update((all) => ({
      ...all,
      ...Object.fromEntries(keys.map((k) => [k, true])),
    }))
    await loadBranch(ROOT)
    for (const key of keys) await loadBranch(key)
  } catch {
    // The point is still selected; the inspector says what went wrong.
  }
}

onReveal((fqr) => void revealFqr(fqr))
