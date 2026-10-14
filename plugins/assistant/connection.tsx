"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Alert02Icon, Loading03Icon } from "@hugeicons/core-free-icons"
import { useValue, type Editor, type TLShape } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  APPROVAL_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  type AiToolInfo,
  type BridgeEvent,
  type BridgeMessage,
} from "./protocol"
import { customCategories } from "@/studio/pages/categories"
import { usePluginRuntime } from "@/studio/plugins/runtime"
import type { AiShapeDescriber } from "@/studio/plugins/types"
import { Icon } from "@/studio/shell/icon"
import { studioState } from "@/studio/state"
import { useStudioContext } from "@/studio/studio-context"

import { runCall, type CallEnv } from "./run-call"
import {
  aiAccess,
  aiActivity,
  aiApprovals,
  aiClients,
  bridgeState,
  type PendingApproval,
} from "./state"

// The board's side of the AI connection: a server-sent event stream brings tool calls
// from AI apps (through the MCP endpoint), this tab runs them and posts the results.
// It also tells the server which tools the enabled plugins offer.

const TAB_ID = crypto.randomUUID()

async function post(message: BridgeMessage) {
  try {
    await fetch("/api/ai/bridge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    })
  } catch {
    // The stream reconnects and resends what's needed.
  }
}

function describe(
  editor: Editor,
  shape: TLShape,
  describers: Record<string, AiShapeDescriber[]>
) {
  // Every-shape describers first (canvas core's summary), then the shape's own plugin.
  const out: Record<string, unknown> = { id: shape.id, type: shape.type }
  for (const describer of [
    ...(describers["*"] ?? []),
    ...(describers[shape.type] ?? []),
  ]) {
    try {
      const extra = describer(editor, shape)
      if (extra) Object.assign(out, extra)
    } catch {
      // One plugin's describer failing shouldn't hide the shape.
    }
  }
  return out
}

export function AiConnection() {
  return (
    <>
      <Bridge />
      <ApprovalDialog />
      <WorkingChip />
    </>
  )
}

function Bridge() {
  const ctx = useStudioContext()
  const { contributions } = usePluginRuntime()
  const access = useValue(aiAccess)
  const board = useValue(studioState.boardName)
  const [opened, setOpened] = useState(0)

  const env = useMemo<CallEnv>(
    () => ({
      ctx,
      tools: contributions.aiTools,
      access,
      extras: {
        describeShape: (shape) =>
          describe(ctx.editor, shape, contributions.aiShapes),
        categories: () =>
          [
            ...contributions.pageCategories,
            ...customCategories(ctx.editor.getDocumentSettings().meta),
          ].sort((a, b) => a.order - b.order),
        guides: contributions.aiGuides,
        libraryCollections: contributions.libraryCollections,
      },
    }),
    [ctx, contributions, access]
  )
  const latest = useRef(env)
  useEffect(() => {
    latest.current = env
  }, [env])

  useEffect(() => {
    const running = new Map<string, AbortController>()
    const source = new EventSource(
      `/api/ai/bridge?tab=${encodeURIComponent(TAB_ID)}`
    )
    bridgeState.set("connecting")
    source.onopen = () => {
      bridgeState.set("open")
      setOpened((n) => n + 1)
    }
    source.onerror = () =>
      bridgeState.set(
        source.readyState === EventSource.CLOSED ? "offline" : "connecting"
      )
    source.onmessage = (message) => {
      let event: BridgeEvent
      try {
        event = JSON.parse(message.data) as BridgeEvent
      } catch {
        return
      }
      if (event.type === "clients") aiClients.set(event.clients)
      else if (event.type === "cancel") running.get(event.callId)?.abort()
      else if (event.type === "call") {
        const controller = new AbortController()
        running.set(event.callId, controller)
        void runCall(latest.current, event, controller.signal)
          .then((output) =>
            post({ type: "result", tab: TAB_ID, callId: event.callId, output })
          )
          .finally(() => running.delete(event.callId))
      }
    }
    const onFocus = () => void post({ type: "focus", tab: TAB_ID })
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      source.close()
      for (const controller of running.values()) controller.abort()
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
      bridgeState.set("offline")
    }
  }, [])

  const tools = useMemo<AiToolInfo[]>(
    () =>
      contributions.aiTools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        access: tool.access,
        timeoutMs:
          tool.access === "write"
            ? APPROVAL_TIMEOUT_MS + 60_000
            : (tool.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        plugin: tool.pluginId,
      })),
    [contributions.aiTools]
  )

  // Every (re)connect, and whenever tools, access or the board change.
  useEffect(() => {
    if (!opened) return
    void post({ type: "catalog", tab: TAB_ID, access, board, tools })
  }, [opened, access, board, tools])

  return null
}

const minutes = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** A write waiting for the person: what changes, from what to what, and why. */
function ApprovalDialog() {
  const approvals = useValue(aiApprovals)
  const current = approvals[0]
  return current ? (
    <ApprovalCard
      key={current.id}
      approval={current}
      waiting={approvals.length - 1}
    />
  ) : null
}

function ApprovalCard({
  approval,
  waiting,
}: {
  approval: PendingApproval
  waiting: number
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  // Allow once asks "are you sure?" before anything is sent. The final button arms
  // after a moment so a double click can't go straight through both steps.
  const [confirming, setConfirming] = useState(false)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setArmed(true), 800)
    return () => clearTimeout(timer)
  }, [confirming])
  const { plan, client } = approval
  const high = plan.risk === "high"

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) approval.decide(false)
      }}
    >
      <DialogContent className="sm:max-w-xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {client} asks to {plan.title.replace(/^\w/, (c) => c.toLowerCase())}
          </DialogTitle>
          <DialogDescription>
            On {plan.target}. Nothing is sent unless you choose Allow once.
          </DialogDescription>
        </DialogHeader>
        {plan.reason ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <p className="mb-0.5 font-medium text-muted-foreground">
              {client}&rsquo;s reason
            </p>
            <p className="whitespace-pre-wrap">{plan.reason}</p>
          </div>
        ) : null}
        <div className="max-h-72 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Now</TableHead>
                <TableHead>Becomes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="max-w-56">
                    <div className="truncate font-medium">{row.label}</div>
                    {row.detail ? (
                      <div className="truncate text-muted-foreground">
                        {row.detail}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {row.from ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">
                    {row.to}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {plan.warnings?.length || high ? (
          <div
            className={cn(
              "flex gap-2 rounded-md border px-3 py-2 text-xs",
              high
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "bg-muted/40"
            )}
          >
            <Icon icon={Alert02Icon} className="mt-0.5 size-3.5 shrink-0" />
            <ul className="flex flex-col gap-0.5">
              {high ? (
                <li>This one is marked high risk. Check it carefully.</li>
              ) : null}
              {plan.warnings?.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {confirming ? (
          <div
            role="alert"
            className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
          >
            <Icon
              icon={Alert02Icon}
              className="mt-0.5 size-3.5 shrink-0 text-amber-500"
            />
            <p>
              <span className="font-medium">Are you sure?</span>{" "}
              {plan.rows.length === 1
                ? `This sends the change above to ${plan.target} now, and it takes effect right away.`
                : `This sends all ${plan.rows.length} changes above to ${plan.target} now, and they take effect right away.`}
            </p>
          </div>
        ) : null}
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Lapses in {minutes(approval.expiresAt - now)}
            {waiting ? ` · ${waiting} more waiting` : ""}
          </p>
          {confirming ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setConfirming(false)
                  setArmed(false)
                }}
              >
                Go back
              </Button>
              <Button
                variant="destructive"
                disabled={!armed}
                onClick={() => approval.decide(true)}
              >
                {plan.confirmLabel ?? "Yes, send it"}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => approval.decide(false)}>
                Deny
              </Button>
              <Button
                variant={high ? "destructive" : "default"}
                onClick={() => setConfirming(true)}
              >
                Allow once
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Claude Code · Adding a trend chart" while a call runs. */
function WorkingChip() {
  const presenting = useValue(studioState.presenting)
  const running = useValue(
    "ai running",
    () => aiActivity.get().filter((entry) => entry.status === "running"),
    []
  )
  if (presenting || !running.length) return null
  const latest = running[0]
  return (
    <div className="pointer-events-none absolute bottom-[76px] left-1/2 z-[400] flex max-w-[min(480px,90%)] -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-3 py-1 text-xs text-popover-foreground shadow-md">
      <Icon
        icon={Loading03Icon}
        className="size-3.5 animate-spin text-primary"
      />
      <span className="truncate">
        <span className="font-medium">{latest.client}</span> · {latest.title}
        {running.length > 1 ? ` (+${running.length - 1})` : ""}
      </span>
    </div>
  )
}
