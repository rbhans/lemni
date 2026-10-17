"use client"

import { useEffect, useState } from "react"
import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
  Loading03Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useEditor, useValue, type TLShapeId } from "tldraw"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { ACCESS_LEVELS } from "./protocol"
import { PanelHeader } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"

import {
  aiAccess,
  aiActivity,
  aiClients,
  aiFollow,
  bridgeState,
  type ActivityEntry,
  type ActivityStatus,
} from "./state"

/** Re-renders every so often so "2 min ago" stays true. */
function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(timer)
  }, [every])
  return now
}

export function ago(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

function Section({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn("flex flex-col gap-2 border-t px-3.5 py-3", className)}
    >
      <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Left panel: who's connected, what they may do, how to connect, what they did. */
export function AiPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader title="AI" />
      <ScrollArea className="min-h-0 flex-1">
        <Connection />
        <Access />
        <Connect />
        <Activity />
      </ScrollArea>
    </div>
  )
}

function Connection() {
  const bridge = useValue(bridgeState)
  const clients = useValue(aiClients)
  const now = useNow()
  return (
    <section className="flex flex-col gap-2 px-3.5 pb-3 text-xs">
      <p className="text-muted-foreground">
        Use the AI app you already have (Claude Code, Claude Desktop, Codex) on
        this board. It works through tools the plugins provide; you watch it
        happen here.
      </p>
      {bridge !== "open" ? (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Icon icon={Loading03Icon} className="size-3.5 animate-spin" />
          {bridge === "offline"
            ? "Can't reach the Lemscape server. Reload the page."
            : "Connecting the board…"}
        </p>
      ) : clients.length ? (
        <ul className="flex flex-col gap-1">
          {clients.slice(0, 4).map((client) => (
            <li key={client.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  now - client.lastSeen < 10 * 60_000
                    ? "bg-primary"
                    : "bg-muted-foreground/40"
                )}
              />
              <span className="truncate font-medium">{client.name}</span>
              {client.version ? (
                <span className="text-muted-foreground">{client.version}</span>
              ) : null}
              <span className="ml-auto shrink-0 text-muted-foreground">
                {ago(client.lastSeen, now)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          No AI app has connected yet. Connect one below.
        </p>
      )}
    </section>
  )
}

function Access() {
  const access = useValue(aiAccess)
  const follow = useValue(aiFollow)
  return (
    <Section title="What AI apps may do">
      <div
        role="radiogroup"
        aria-label="AI access"
        className="flex flex-col gap-1"
      >
        {ACCESS_LEVELS.map((level) => (
          <button
            key={level.id}
            type="button"
            role="radio"
            aria-checked={access === level.id}
            onClick={() => aiAccess.set(level.id)}
            className={cn(
              "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-muted",
              access === level.id && "border-primary/60 bg-primary/5"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                access === level.id &&
                  "border-primary bg-primary text-primary-foreground"
              )}
            >
              {access === level.id ? (
                <Icon icon={Tick02Icon} className="size-2.5" />
              ) : null}
            </span>
            <span className="flex flex-col">
              <span className="font-medium">{level.label}</span>
              <span className="text-muted-foreground">{level.description}</span>
            </span>
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 pt-1 text-xs">
        <span>
          Follow its changes
          <span className="block text-muted-foreground">
            Switch pages and pan to what it changes.
          </span>
        </span>
        <Switch checked={follow} onCheckedChange={(on) => aiFollow.set(on)} />
      </label>
    </Section>
  )
}

interface Setup {
  url: string
  token: string
  fromEnv: boolean
}

const MASK = "••••••••"

function commandsFor(setup: Setup, token: string) {
  return {
    claude: `claude mcp add --transport http --scope user lemscape ${setup.url} --header "Authorization: Bearer ${token}"`,
    desktop: JSON.stringify(
      {
        mcpServers: {
          lemscape: {
            command: "npx",
            args: [
              "-y",
              "mcp-remote@0.14.3",
              setup.url,
              "--allow-http",
              "--header",
              "Authorization:${LEMSCAPE_AUTH}",
            ],
            env: { LEMSCAPE_AUTH: `Bearer ${token}` },
          },
        },
      },
      null,
      2
    ),
    codex: `[mcp_servers.lemscape]\nurl = "${setup.url}"\nhttp_headers = { "Authorization" = "Bearer ${token}" }`,
  }
}

function Connect() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let live = true
    fetch("/api/ai/setup")
      .then(async (response) => {
        const data = (await response.json()) as Setup & { error?: string }
        if (!live) return
        if (!response.ok)
          setError(data.error ?? "Couldn't load the connect details.")
        else setSetup(data)
      })
      .catch(() => live && setError("Couldn't reach the Lemscape server."))
    return () => {
      live = false
    }
  }, [])

  const rotate = async () => {
    setConfirming(false)
    const response = await fetch("/api/ai/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    const data = (await response.json()) as Setup & { error?: string }
    if (!response.ok) {
      toast.error(data.error ?? "Couldn't make a new token.")
      return
    }
    setSetup(data)
    toast.success("New token made", {
      description:
        "Connected AI apps need the new command before they work again.",
    })
  }

  return (
    <Section title="Connect an AI app">
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {setup ? (
        <>
          <Tabs defaultValue="claude" className="gap-2">
            <TabsList className="w-full">
              <TabsTrigger value="claude">Claude Code</TabsTrigger>
              <TabsTrigger value="desktop">Claude Desktop</TabsTrigger>
              <TabsTrigger value="codex">Codex</TabsTrigger>
            </TabsList>
            <TabsContent value="claude">
              <Snippet
                setup={setup}
                which="claude"
                hint="Run once in a terminal. Then ask Claude Code to work on the board (keep the board open, e.g. in its browser pane)."
              />
            </TabsContent>
            <TabsContent value="desktop">
              <Snippet
                setup={setup}
                which="desktop"
                hint="Add to claude_desktop_config.json (Settings → Developer → Edit config), then restart Claude Desktop. Needs Node.js."
              />
            </TabsContent>
            <TabsContent value="codex">
              <Snippet
                setup={setup}
                which="codex"
                hint="Add to ~/.codex/config.toml, then start a new Codex session."
              />
            </TabsContent>
          </Tabs>
          <p className="text-[11px] text-muted-foreground">
            The command includes this computer&rsquo;s private token (hidden
            here, included when you copy). Anyone with it can use the
            board&rsquo;s AI tools while it&rsquo;s open.
          </p>
          {setup.fromEnv ? null : confirming ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="flex-1">Disconnect every AI app?</span>
              <Button
                size="xs"
                variant="destructive"
                onClick={() => void rotate()}
              >
                New token
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="xs"
              variant="outline"
              className="self-start"
              onClick={() => setConfirming(true)}
            >
              Make a new token
            </Button>
          )}
        </>
      ) : null}
    </Section>
  )
}

function Snippet({
  setup,
  which,
  hint,
}: {
  setup: Setup
  which: "claude" | "desktop" | "codex"
  hint: string
}) {
  const [copied, setCopied] = useState(false)
  const shown = commandsFor(setup, MASK)[which]
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        commandsFor(setup, setup.token)[which]
      )
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy. Your browser blocked the clipboard.")
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative rounded-md border bg-muted/40">
        <pre className="max-h-48 overflow-auto p-2 pr-9 font-mono text-[10.5px] leading-relaxed break-all whitespace-pre-wrap">
          {shown}
        </pre>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Copy"
          className="absolute top-1 right-1"
          onClick={() => void copy()}
        >
          <Icon icon={copied ? Tick02Icon : Copy01Icon} className="size-3.5" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

const STATUS: Record<
  ActivityStatus,
  { icon: Parameters<typeof Icon>[0]["icon"]; className: string; label: string }
> = {
  running: {
    icon: Loading03Icon,
    className: "animate-spin text-primary",
    label: "Working",
  },
  waiting: {
    icon: Clock01Icon,
    className: "text-amber-500",
    label: "Waiting for you",
  },
  done: {
    icon: CheckmarkCircle02Icon,
    className: "text-primary",
    label: "Done",
  },
  error: { icon: Alert02Icon, className: "text-destructive", label: "Failed" },
  denied: {
    icon: Cancel01Icon,
    className: "text-muted-foreground",
    label: "Denied",
  },
  cancelled: {
    icon: Cancel01Icon,
    className: "text-muted-foreground",
    label: "Cancelled",
  },
}

function Activity() {
  const editor = useEditor()
  const entries = useValue(aiActivity)
  const now = useNow(15_000)
  const show = (entry: ActivityEntry) => {
    const ids = (entry.shapes ?? []).filter((id) =>
      editor.getShape(id as TLShapeId)
    ) as TLShapeId[]
    if (!ids.length) return
    const pageId = editor.getAncestorPageId(ids[0])
    if (pageId && pageId !== editor.getCurrentPageId())
      editor.setCurrentPage(pageId)
    editor.select(
      ...ids.filter((id) => editor.getAncestorPageId(id) === pageId)
    )
    editor.zoomToSelection({ animation: { duration: 220 } })
  }
  return (
    <Section title="Activity" className="pb-4">
      {entries.length ? (
        <ul className="flex flex-col gap-0.5">
          {entries.map((entry) => {
            const status = STATUS[entry.status]
            const jump = Boolean(entry.shapes?.length)
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  disabled={!jump}
                  onClick={() => show(entry)}
                  className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs enabled:hover:bg-muted"
                >
                  <Icon
                    icon={status.icon}
                    className={cn("mt-0.5 size-3.5 shrink-0", status.className)}
                  />
                  <span className="sr-only">{status.label}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex gap-2">
                      <span className="truncate font-medium">
                        {entry.title}
                      </span>
                      <span className="ml-auto shrink-0 text-muted-foreground">
                        {ago(entry.at, now)}
                      </span>
                    </span>
                    {entry.summary ? (
                      <span className="line-clamp-2 text-muted-foreground">
                        {entry.summary}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          What AI apps read and change shows up here.
        </p>
      )}
    </Section>
  )
}
