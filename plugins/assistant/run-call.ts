"use client"

import { Box, type Editor, type TLShape, type TLShapeId } from "tldraw"

import {
  allows,
  APPROVAL_TIMEOUT_MS,
  errorOutput,
  type AiAccessLevel,
  type AiContent,
  type AiToolOutput,
} from "./protocol"
import { safeBatch } from "@/studio/ai/batch"
import { validateInput } from "@/studio/ai/schema"
import type {
  AiReply,
  AiTool,
  AiToolContext,
  AiWritePlan,
  StudioContext,
} from "@/studio/plugins/types"
import { studioState } from "@/studio/state"

import {
  aiApprovals,
  aiFollow,
  aiTouched,
  logActivity,
  updateActivity,
} from "./state"

// Runs one tool call from an AI app: checks the input and access level, runs the
// tool, and for board edits makes the call one undo step, highlights what changed and
// brings it into view. Writes wait for the person's Allow once.

export interface CallEnv {
  ctx: StudioContext
  tools: readonly (AiTool & { pluginId: string })[]
  access: AiAccessLevel
  extras: Pick<
    AiToolContext,
    "describeShape" | "categories" | "guides" | "libraryCollections"
  >
}

export interface CallRequest {
  callId: string
  tool: string
  input: unknown
  client: string
}

const MAX_JSON = 120_000
const HIGHLIGHT_MS = 2600

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function toOutput(
  reply: AiReply,
  extra?: Record<string, unknown>
): AiToolOutput {
  const content: AiContent[] = []
  if (reply.text) content.push({ type: "text", text: reply.text })
  let data = reply.data
  if (extra)
    data = {
      ...(isRecord(data) ? data : data === undefined ? {} : { result: data }),
      ...extra,
    }
  if (data !== undefined) {
    let json = JSON.stringify(data)
    if (json.length > MAX_JSON) json = `${json.slice(0, MAX_JSON)}… (cut short)`
    content.push({ type: "text", text: json })
  }
  for (const image of reply.images ?? [])
    content.push({ type: "image", ...image })
  if (!content.length) content.push({ type: "text", text: "Done." })
  return { content }
}

function shapeRecords(editor: Editor) {
  const records = new Map<TLShapeId, TLShape>()
  for (const record of editor.store.allRecords())
    if (record.typeName === "shape") records.set(record.id, record)
  return records
}

/**
 * Shapes made, changed and removed while a tool runs, by comparing records before
 * and after (store listeners report a frame later, too late for the reply).
 */
function trackChanges(editor: Editor) {
  const before = shapeRecords(editor)
  return {
    changes() {
      const after = shapeRecords(editor)
      const created: TLShapeId[] = []
      const updated: TLShapeId[] = []
      for (const [id, record] of after) {
        const old = before.get(id)
        if (!old) created.push(id)
        else if (old !== record) updated.push(id)
      }
      const deleted = [...before.keys()].filter((id) => !after.has(id))
      return { created, updated, deleted }
    },
  }
}

let clearTimer: ReturnType<typeof setTimeout> | null = null

function highlight(ids: readonly TLShapeId[]) {
  if (!ids.length) return
  const until = Date.now() + HIGHLIGHT_MS
  aiTouched.update((current) => {
    const next = { ...current }
    for (const id of ids) next[id] = until
    return next
  })
  if (clearTimer) clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    const now = Date.now()
    aiTouched.update((current) =>
      Object.fromEntries(Object.entries(current).filter(([, t]) => t > now))
    )
  }, HIGHLIGHT_MS + 50)
}

/** Shows the changed shapes: their page, and the camera moves only if they're out of view. */
function follow(editor: Editor, ids: readonly TLShapeId[]) {
  if (!aiFollow.get() || !ids.length) return
  const first = ids.find((id) => editor.getShape(id))
  if (!first) return
  const pageId = editor.getAncestorPageId(first)
  if (!pageId) return
  if (pageId !== editor.getCurrentPageId()) editor.setCurrentPage(pageId)
  const boxes = ids.flatMap((id) => {
    if (editor.getAncestorPageId(id) !== pageId) return []
    const bounds = editor.getShapePageBounds(id)
    return bounds ? [bounds] : []
  })
  if (!boxes.length) return
  const bounds = Box.Common(boxes)
  if (Box.Contains(editor.getViewportPageBounds(), bounds)) return
  editor.zoomToBounds(bounds, {
    inset: 96,
    targetZoom: Math.min(1, editor.getZoomLevel()),
    animation: { duration: 320 },
  })
}

type Decision = "allowed" | "denied" | "expired" | "cancelled"

function requestApproval(
  id: string,
  client: string,
  plan: AiWritePlan,
  signal: AbortSignal
): Promise<Decision> {
  return new Promise((resolve) => {
    const done = (decision: Decision) => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
      aiApprovals.update((list) => list.filter((a) => a.id !== id))
      resolve(decision)
    }
    const timer = setTimeout(() => done("expired"), APPROVAL_TIMEOUT_MS)
    const onAbort = () => done("cancelled")
    signal.addEventListener("abort", onAbort, { once: true })
    const shown: Omit<AiWritePlan, "commit"> = {
      title: plan.title,
      target: plan.target,
      rows: plan.rows,
      risk: plan.risk,
      reason: plan.reason,
      warnings: plan.warnings,
      confirmLabel: plan.confirmLabel,
    }
    aiApprovals.update((list) => [
      ...list,
      {
        id,
        client,
        plan: shown,
        expiresAt: Date.now() + APPROVAL_TIMEOUT_MS,
        decide: (allowed) => done(allowed ? "allowed" : "denied"),
      },
    ])
  })
}

const DECLINED: Record<Exclude<Decision, "allowed">, string> = {
  denied:
    "The person chose Deny. Nothing was sent. Don't try again unless they ask.",
  expired:
    "Nobody approved the request in time, so nothing was sent. Ask the person before trying again.",
  cancelled:
    "The request was cancelled before it was approved. Nothing was sent.",
}

function changeSummary(changes: {
  created: unknown[]
  updated: unknown[]
  deleted: unknown[]
}) {
  const parts = [
    changes.created.length && `added ${changes.created.length}`,
    changes.updated.length && `changed ${changes.updated.length}`,
    changes.deleted.length && `removed ${changes.deleted.length}`,
  ].filter(Boolean)
  return parts.length ? `${parts.join(", ")} shape(s)` : "No shapes changed"
}

export async function runCall(
  env: CallEnv,
  call: CallRequest,
  signal: AbortSignal
): Promise<AiToolOutput> {
  const { editor } = env.ctx
  const tool = env.tools.find((t) => t.name === call.tool)
  if (!tool)
    return errorOutput(
      `${call.tool} isn't available: the plugin that brings it is turned off.`
    )
  if (!allows(env.access, tool.access))
    return errorOutput(
      "The person's AI access setting doesn't allow this. They can change it in Lemscape's AI panel."
    )
  const input = isRecord(call.input) ? call.input : {}
  const problems = validateInput(tool.inputSchema, input)
  if (problems.length)
    return errorOutput(
      `The input isn't right:\n- ${problems.join("\n- ")}\nCheck the tool's input schema and try again.`
    )

  logActivity({
    id: call.callId,
    tool: tool.name,
    title: tool.title,
    client: call.client,
    at: Date.now(),
    status: "running",
  })
  const ctx: AiToolContext = {
    ...env.ctx,
    ...env.extras,
    client: call.client,
    access: env.access,
    signal,
  }

  try {
    if (tool.access === "write") {
      const plan = await tool.prepare(ctx, input as never)
      updateActivity(call.callId, { status: "waiting", summary: plan.title })
      const decision = await requestApproval(
        call.callId,
        call.client,
        plan,
        signal
      )
      if (decision !== "allowed") {
        updateActivity(call.callId, {
          status: decision === "denied" ? "denied" : "cancelled",
          summary: decision === "denied" ? "Denied" : DECLINED[decision],
        })
        return errorOutput(DECLINED[decision])
      }
      const reply = await plan.commit()
      updateActivity(call.callId, {
        status: "done",
        summary: reply.text ?? plan.title,
      })
      return toOutput(reply)
    }

    // The synchronous part of a tool runs as one batch, guarded so an error can't
    // crash the editor (see safeBatch). Async tools guard what they change later.
    const start = () => safeBatch(editor, () => tool.run(ctx, input as never))

    if (tool.access === "read") {
      const reply = await start()
      updateActivity(call.callId, { status: "done", summary: reply.text })
      return toOutput(reply)
    }

    if (studioState.presenting.get() || editor.getIsReadonly())
      throw new Error(
        "The board is in Present mode, which is read only. Ask the person to leave Present mode first."
      )
    editor.markHistoryStoppingPoint(`ai ${tool.name}`)
    const tracker = trackChanges(editor)
    let reply: AiReply
    try {
      reply = await start()
    } catch (error) {
      const changes = tracker.changes()
      highlight([...changes.created, ...changes.updated])
      const made =
        changes.created.length + changes.updated.length + changes.deleted.length
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(
        made
          ? `${message} (Some changes were made before this: ${changeSummary(changes)}. The person can undo them.)`
          : message
      )
    }

    const changes = tracker.changes()
    const touched = [...changes.created, ...changes.updated]
    highlight(touched)
    follow(editor, touched)
    updateActivity(call.callId, {
      status: "done",
      summary: reply.text ?? changeSummary(changes),
      shapes: touched.slice(0, 200),
    })
    const any = touched.length + changes.deleted.length > 0
    return toOutput(
      reply,
      any
        ? {
            changes: {
              created: changes.created.slice(0, 100),
              updated: changes.updated.slice(0, 100),
              deleted: changes.deleted.slice(0, 100),
            },
          }
        : undefined
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    updateActivity(call.callId, {
      status: signal.aborted ? "cancelled" : "error",
      summary: message,
    })
    return errorOutput(message)
  }
}
