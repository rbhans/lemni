"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  PuzzleIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useEditor, useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { parseAddress } from "../lib/address"
import { usePluginRuntime } from "../plugins/runtime"
import type {
  ConnectionMatch,
  ConnectionProbeContribution,
} from "../plugins/types"
import { studioState } from "../state"
import { useStudioContext } from "../studio-context"
import { Icon } from "./icon"

// Connect…: one address, checked by every connection plugin's probe. When exactly one
// recognizes it, its form opens filled in; otherwise the person picks.

type Probe = ConnectionProbeContribution & { pluginId: string }

type ProbeState =
  | { status: "checking" }
  | { status: "found"; match: ConnectionMatch }
  | { status: "none" }
  | { status: "failed"; message: string }

interface Check {
  /** The address as typed. */
  address: string
  states: Record<string, ProbeState>
}

/** Longest a probe gets before it counts as not having found anything. */
const PROBE_TIMEOUT_MS = 20_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("It took too long to answer.")),
      ms
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export function ConnectDialog() {
  const editor = useEditor()
  const request = useValue(studioState.connect)
  const probes = usePluginRuntime().contributions.connectionProbes

  /** `refocus`: hand the keyboard back to the canvas (not when a form just opened). */
  const close = (refocus = true) => {
    studioState.connect.set(null)
    if (refocus) requestAnimationFrame(() => editor.focus())
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(next) => (next ? null : close())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Connect</DialogTitle>
          <DialogDescription>
            Type the address of a station or server. Lemscape checks what
            answers there and opens the right connection, filled in.
          </DialogDescription>
        </DialogHeader>
        {request && probes.length ? (
          <ConnectBody
            key={request.key}
            initial={request.address}
            probes={probes}
            onClose={close}
          />
        ) : request ? (
          <NoProbes onClose={close} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ConnectBody({
  initial,
  probes,
  onClose,
}: {
  initial: string
  probes: readonly Probe[]
  onClose(refocus?: boolean): void
}) {
  const ctx = useStudioContext()
  const [address, setAddress] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState<Check | null>(null)
  const running = useRef<AbortController | null>(null)

  useEffect(() => () => running.current?.abort(), [])

  const open = (probe: Probe, typed: string, match: ConnectionMatch | null) => {
    running.current?.abort()
    onClose(false)
    try {
      probe.open(ctx, typed, match)
    } catch (error) {
      console.error(`[plugin:${probe.pluginId}] Connect… couldn't open`, error)
      toast.error(`Couldn't open the ${probe.label} connection.`)
    }
  }

  const start = (text: string) => {
    const parsed = parseAddress(text)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    running.current?.abort()
    const abort = new AbortController()
    running.current = abort
    const typed = text.trim()
    setCheck({
      address: typed,
      states: Object.fromEntries(
        probes.map((probe) => [probe.id, { status: "checking" }])
      ),
    })
    void Promise.all(
      probes.map(async (probe): Promise<ProbeState> => {
        let state: ProbeState
        try {
          const match = await withTimeout(
            probe.probe(typed, abort.signal),
            PROBE_TIMEOUT_MS
          )
          state = match ? { status: "found", match } : { status: "none" }
        } catch (reason) {
          state = {
            status: "failed",
            message:
              reason instanceof Error ? reason.message : "Couldn't check.",
          }
        }
        if (!abort.signal.aborted)
          setCheck((current) =>
            current?.address === typed
              ? { ...current, states: { ...current.states, [probe.id]: state } }
              : current
          )
        return state
      })
    ).then((states) => {
      if (abort.signal.aborted) return
      const found = probes.flatMap((probe, i) => {
        const state = states[i]
        return state.status === "found" ? [{ probe, match: state.match }] : []
      })
      // One thing answered: go straight to its form.
      if (found.length === 1) open(found[0].probe, typed, found[0].match)
    })
  }

  // An address handed over (a pasted link) is checked straight away.
  useEffect(() => {
    if (!initial.trim()) return
    const timer = setTimeout(() => start(initial), 0)
    return () => clearTimeout(timer)
    // Only for the address this dialog opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    start(address)
  }

  const states = check ? probes.map((probe) => check.states[probe.id]) : []
  const done = check !== null && states.every((s) => s.status !== "checking")
  const found = states.filter((s) => s.status === "found").length
  const failure = states.find(
    (s): s is Extract<ProbeState, { status: "failed" }> => s.status === "failed"
  )

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          autoFocus
          aria-label="Address"
          aria-invalid={error ? true : undefined}
          placeholder="10.0.0.20 or https://station.example.com"
          spellCheck={false}
          autoComplete="off"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          className="h-8 font-mono"
        />
        <Button type="submit" size="lg">
          Check
        </Button>
      </div>
      {error ? (
        <p role="alert" className="-mt-1 text-[11.5px] text-destructive">
          {error}
        </p>
      ) : null}

      {check ? (
        <ul aria-live="polite" className="flex flex-col gap-1.5">
          {probes.map((probe) => (
            <ProbeRow
              key={probe.id}
              probe={probe}
              state={check.states[probe.id]}
              primary={found === 1}
              onConnect={(match) => open(probe, check.address, match)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[11.5px] text-muted-foreground">
          Recognizes: {probes.map((probe) => probe.label).join(", ")}. Only a
          plain request is sent, never a login.
        </p>
      )}

      {done && !found ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="text-xs font-medium">
            {failure
              ? `Couldn't reach ${check.address}.`
              : `Nothing Lemscape recognizes answered at ${check.address}.`}
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            Open a connection form with this address anyway:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {probes.map((probe) => (
              <Button
                key={probe.id}
                type="button"
                variant="outline"
                onClick={() => open(probe, check.address, null)}
              >
                <Icon icon={probe.icon} className="size-3.5" />
                {probe.label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  )
}

function ProbeRow({
  probe,
  state,
  primary,
  onConnect,
}: {
  probe: Probe
  state: ProbeState
  primary: boolean
  onConnect(match: ConnectionMatch): void
}) {
  const found = state.status === "found"
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-2.5 py-2",
        found ? "border-ring bg-primary/10" : "bg-muted/30"
      )}
    >
      <Icon
        icon={probe.icon}
        className={cn("size-4", !found && "text-muted-foreground")}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium">
          {found ? state.match.title : probe.label}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {state.status === "checking"
            ? "Checking…"
            : state.status === "found"
              ? [state.match.detail, state.match.address]
                  .filter(Boolean)
                  .join(" · ")
              : state.status === "failed"
                ? state.message
                : "Not found at this address"}
        </span>
      </div>
      {state.status === "checking" ? (
        <Icon
          icon={Loading03Icon}
          className="size-3.5 animate-spin text-muted-foreground"
        />
      ) : state.status === "found" ? (
        <Button
          type="button"
          size="sm"
          variant={primary ? "default" : "outline"}
          onClick={() => onConnect(state.match)}
        >
          <Icon icon={CheckmarkCircle02Icon} className="size-3" />
          Connect
        </Button>
      ) : state.status === "failed" ? (
        <Icon icon={Alert02Icon} className="size-3.5 text-muted-foreground" />
      ) : null}
    </li>
  )
}

function NoProbes({ onClose }: { onClose(refocus?: boolean): void }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-xs text-muted-foreground">
        Connecting needs a connection plugin, like Niagara · baskStream. Turn
        one on in Plugins, under Connections.
      </p>
      <Button
        variant="outline"
        onClick={() => {
          onClose(false)
          studioState.pluginManagerOpen.set(true)
        }}
      >
        <Icon icon={PuzzleIcon} className="size-3.5" />
        Open Plugins
      </Button>
    </div>
  )
}
