"use client"

import { atom } from "tldraw"

import {
  isAccessLevel,
  type AiAccessLevel,
  type AiClientInfo,
} from "./protocol"
import { pluginStorage, type AiWritePlan } from "@/sdk"

// AI connection state for this browser: what AI apps may do, who's connected, what
// they've done, and writes waiting for the person.

const storage = pluginStorage("assistant")

/** How much AI apps may do. Kept per browser, not in the board. */
export const aiAccess = storage.atom<AiAccessLevel>(
  "access",
  "edit",
  isAccessLevel,
  { from: ["lemscape.ai-access.v1"] }
)

/** Bring the AI's changes into view as they happen. */
export const aiFollow = storage.atom(
  "follow",
  true,
  (value): value is boolean => typeof value === "boolean",
  { from: ["lemscape.ai-follow.v1"] }
)

/** The board's line to the server's MCP endpoint. */
export const bridgeState = atom<"connecting" | "open" | "offline">(
  "ai bridge",
  "connecting"
)

export const aiClients = atom<AiClientInfo[]>("ai clients", [])

export type ActivityStatus =
  "running" | "waiting" | "done" | "error" | "denied" | "cancelled"

export interface ActivityEntry {
  id: string
  tool: string
  title: string
  client: string
  at: number
  status: ActivityStatus
  /** What it said back (or why it failed). */
  summary?: string
  /** Shapes it made or changed, to jump to. */
  shapes?: string[]
}

export const aiActivity = atom<ActivityEntry[]>("ai activity", [])

export function logActivity(entry: ActivityEntry) {
  aiActivity.update((list) => [entry, ...list].slice(0, 60))
}

export function updateActivity(id: string, patch: Partial<ActivityEntry>) {
  aiActivity.update((list) =>
    list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
  )
}

export interface PendingApproval {
  id: string
  client: string
  plan: Omit<AiWritePlan, "commit">
  expiresAt: number
  decide(allowed: boolean): void
}

export const aiApprovals = atom<PendingApproval[]>("ai approvals", [])

/** Shapes the AI just made or changed → when to stop highlighting them. */
export const aiTouched = atom<Record<string, number>>("ai touched", {})
