"use client"

import { useEffect, useState } from "react"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { atom, useEditor, useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getDataSource, Icon, kindOfValue, type WriteCapability } from "@/sdk"

import {
  actionLabel,
  buildWrite,
  elementLabel,
  formatValue,
  releaseWrite,
  type UiElement,
  type WriteRequest,
} from "./model"

// Every write from a control is confirmed: the dialog says exactly what will change,
// and nothing is sent until the person says yes. The source writes once (no retries)
// and records who asked in its audit log.

interface PendingWrite {
  source: string
  control: string
  write: WriteRequest
  pointLabel: string
  now: string
  becomes: string
  /** Called once the dialog closes, written or not (controls drop their drafts). */
  onSettled?(written: boolean): void
}

const pending = atom<PendingWrite | null>("pending ui write", null)

/** Asks to write a value (or release the override) through the element. */
export function requestWrite(
  el: UiElement,
  value: boolean | number | string | "auto",
  onSettled?: (written: boolean) => void
) {
  const source = getDataSource(el.source)
  if (!source) {
    toast.info("Connect to the station to use this control.")
    onSettled?.(false)
    return
  }
  if (!source.write) {
    toast.info("This connection can't write points.")
    onSettled?.(false)
    return
  }
  const live = source.value(el.point).get()
  const write = value === "auto" ? releaseWrite(el) : buildWrite(el, value)
  pending.set({
    source: el.source,
    control: elementLabel(el),
    write,
    pointLabel: el.pointLabel || el.point.split("/").pop() || el.point,
    now: live?.display ?? "—",
    becomes:
      value === "auto"
        ? "Its normal value"
        : formatValue(
            el,
            value,
            kindOfValue(live) === "number" ? (live?.units ?? "") : ""
          ),
    onSettled,
  })
}

/** The confirmation for a control's write. */
export function WriteConfirm() {
  const editor = useEditor()
  const request = useValue(pending)
  // The station's answer for this request: can the point take this write?
  const [checked, setChecked] = useState<{
    for: PendingWrite
    capability: WriteCapability | "error"
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const source = request ? getDataSource(request.source) : undefined
  const capability: WriteCapability | "error" | null = !request
    ? null
    : !source?.describeWrite
      ? // Nothing to check against; the source's own write still decides.
        {
          point: request.write.point,
          writable: true,
          actions: [request.write.action],
          enumOptions: [],
          supportsDuration: true,
        }
      : checked?.for === request
        ? checked.capability
        : null

  // Ask up front, so a no is a no before anyone confirms.
  useEffect(() => {
    if (!request || !source?.describeWrite) return
    let live = true
    source
      .describeWrite([request.write.point])
      .then(
        ([info]) =>
          live && setChecked({ for: request, capability: info ?? "error" })
      )
      .catch(() => live && setChecked({ for: request, capability: "error" }))
    return () => {
      live = false
    }
  }, [request, source])

  const close = (written: boolean) => {
    request?.onSettled?.(written)
    pending.set(null)
    setBusy(false)
    editor.focus()
  }

  const problem =
    capability === "error"
      ? "Couldn't check this point with the station."
      : capability && !capability.writable
        ? "The station says this point can't be written."
        : capability && !capability.actions.includes(request!.write.action)
          ? `This point doesn't accept "${actionLabel(request!.write).toLowerCase()}".`
          : null

  const send = async () => {
    if (!request) return
    if (!source?.write) return close(false)
    setBusy(true)
    const page = editor.getCurrentPage().name
    try {
      const [result] = await source.write([request.write], {
        requestedBy: `Lemscape control "${request.control}" (confirmed in Lemscape)`,
        reason: `${actionLabel(request.write)} ${request.pointLabel} from the "${request.control}" control on ${page}.`,
      })
      if (result?.ok)
        toast.success(
          `${request.pointLabel} is now ${result.after?.display ?? request.becomes}`
        )
      else
        toast.error(`Couldn't write ${request.pointLabel}`, {
          description: result?.error,
        })
      close(Boolean(result?.ok))
    } catch (error) {
      toast.error(`Couldn't write ${request.pointLabel}`, {
        description: error instanceof Error ? error.message : undefined,
      })
      close(false)
    }
  }

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !busy) close(false)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Write to the station?</DialogTitle>
          <DialogDescription>
            From the “{request?.control}” control. Nothing is sent unless you
            say yes.
          </DialogDescription>
        </DialogHeader>
        {request ? (
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border p-3 text-xs">
            <span className="text-muted-foreground">Point</span>
            <span className="font-mono">{request.pointLabel}</span>
            <span className="text-muted-foreground">Now</span>
            <span className="font-mono">{request.now}</span>
            <span className="text-muted-foreground">Becomes</span>
            <span className="font-mono font-semibold">{request.becomes}</span>
            <span className="text-muted-foreground">How</span>
            <span>{actionLabel(request.write)}</span>
          </div>
        ) : null}
        {problem ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <Icon icon={Alert02Icon} className="size-3.5" />
            {problem}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => close(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={busy || capability === null || Boolean(problem)}
            onClick={() => void send()}
          >
            {busy
              ? "Writing…"
              : capability === null
                ? "Checking…"
                : "Yes, write"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
