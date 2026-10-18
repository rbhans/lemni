"use client"

import { atom, react } from "tldraw"

import type { StationNode } from "../shared"
import { stationApi } from "./api"
import { shell } from "@/sdk"

import { connection, onReveal } from "./store"

export interface Branch {
  children?: StationNode[]
  loading?: boolean
  error?: string
}

/** Loaded branches of the station tree, keyed by ORD. Kept while the panel is closed. */
export const branches = atom<Record<string, Branch>>("station branches", {})
export const expanded = atom<Record<string, boolean>>("station expanded", {
  "slot:/": true,
})
export const selectedOrd = atom<string | null>("station selected point", null)

// A different connection means a different tree.
let lastConnection: string | null = null
react("reset station tree", () => {
  const id = connection.get()?.id ?? null
  if (id === lastConnection) return
  lastConnection = id
  branches.set({})
  expanded.set({ "slot:/": true })
  selectedOrd.set(null)
})

export async function loadBranch(ord: string, force = false) {
  const info = connection.get()
  if (!info) return
  const current = branches.get()[ord]
  if (!force && (current?.children || current?.loading)) return
  branches.update((all) => ({
    ...all,
    [ord]: { ...all[ord], loading: true, error: undefined },
  }))
  try {
    const { children } = await stationApi.browse(info.id, ord)
    branches.update((all) => ({ ...all, [ord]: { children } }))
  } catch (error) {
    branches.update((all) => ({
      ...all,
      [ord]: {
        error: error instanceof Error ? error.message : "Couldn't load.",
      },
    }))
  }
}

export function toggleBranch(ord: string) {
  const open = !expanded.get()[ord]
  expanded.update((all) => ({ ...all, [ord]: open }))
  if (open) void loadBranch(ord)
}

/** Opens every ancestor of an ORD and selects it (used by search and alarms). */
export async function reveal(ord: string) {
  selectedOrd.set(ord)
  const segments = ord
    .replace(/^slot:\//, "")
    .split("/")
    .filter(Boolean)
  let path = "slot:/"
  for (const segment of segments.slice(0, -1)) {
    path = path === "slot:/" ? `slot:/${segment}` : `${path}/${segment}`
    expanded.update((all) => ({ ...all, [path]: true }))
    await loadBranch(path)
  }
}

/** Opens the Station panel on a point or folder, expanding the tree down to it. */
export function revealOrd(ord: string) {
  const parts = ord
    .replace(/^slot:\/?/, "")
    .split("/")
    .filter(Boolean)
  const parents: string[] = []
  let path = "slot:"
  for (const part of parts.slice(0, -1)) {
    path += `/${part}`
    parents.push(path)
  }
  expanded.update((all) => ({
    ...all,
    ...Object.fromEntries(parents.map((p) => [p, true])),
  }))
  for (const p of ["slot:/", ...parents]) void loadBranch(p)
  selectedOrd.set(ord)
  shell.showPanel("station")
}

onReveal(revealOrd)
