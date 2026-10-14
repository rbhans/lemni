import "server-only"

import { randomUUID } from "node:crypto"

import {
  allows,
  errorOutput,
  type AiAccessLevel,
  type AiClientInfo,
  type AiToolInfo,
  type AiToolOutput,
  type BridgeEvent,
} from "../protocol"

// The board's tools run in the browser tab that has the board open; AI apps reach them
// through the MCP endpoint in this process. The bridge keeps both sides: open board tabs
// (server-sent events out, results back in) and MCP sessions (AI apps), and hands each
// tool call to the board tab used most recently.

interface Catalog {
  access: AiAccessLevel
  board: string
  tools: AiToolInfo[]
}

interface Tab {
  id: string
  send(event: BridgeEvent): void
  focusedAt: number
  catalog: Catalog | null
}

interface PendingCall {
  tab: string
  session: string | null
  requestId: string | number | null
  resolve(output: AiToolOutput): void
}

interface Session extends AiClientInfo {
  /** Open GET streams for server → client notifications. */
  streams: Set<(message: unknown) => void>
}

const BOARD_STATUS: AiToolInfo = {
  name: "board_status",
  title: "Is the board open?",
  description:
    "Says whether Lemni is open in a browser, which board, and how much the person lets AI apps do. Call it when other tools say the board isn't open.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  access: "read",
  timeoutMs: 5_000,
  plugin: "assistant",
}

export const NOT_OPEN =
  "Lemni isn't open. Ask the person to open the board in a browser (for example the browser pane next to this chat), then try again."

/** Friendly names for common MCP clients (they report a code name). */
const CLIENT_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  "claude-ai": "Claude",
  "claude-desktop": "Claude Desktop",
  "codex-mcp-client": "Codex",
  codex: "Codex",
  "cursor-vscode": "Cursor",
  "Visual Studio Code": "VS Code",
}

const SESSION_IDLE_MS = 24 * 3_600_000

class AiBridge {
  private readonly tabs = new Map<string, Tab>()
  private readonly calls = new Map<string, PendingCall>()
  private readonly sessions = new Map<string, Session>()
  /** The last catalog any tab sent, so tools stay listed while the board reloads. */
  private lastCatalog: Catalog | null = null
  private listSignature = ""

  // ---- Board tabs ----------------------------------------------------------------------

  openTab(id: string, send: (event: BridgeEvent) => void): () => void {
    const tab: Tab = { id, send, focusedAt: Date.now(), catalog: null }
    this.tabs.set(id, tab)
    send({ type: "clients", clients: this.clients() })
    return () => {
      if (this.tabs.get(id) !== tab) return
      this.tabs.delete(id)
      for (const [callId, call] of this.calls)
        if (call.tab === id)
          this.finish(
            callId,
            errorOutput("The board was closed or reloaded before it answered.")
          )
    }
  }

  setCatalog(tabId: string, catalog: Catalog) {
    const tab = this.tabs.get(tabId)
    if (!tab) return false
    tab.catalog = catalog
    if (this.activeTab() === tab) this.lastCatalog = catalog
    this.notifyIfListChanged()
    return true
  }

  focus(tabId: string) {
    const tab = this.tabs.get(tabId)
    if (!tab) return false
    tab.focusedAt = Date.now()
    if (tab.catalog) this.lastCatalog = tab.catalog
    this.notifyIfListChanged()
    return true
  }

  /** The tab used most recently that has said what it offers. */
  private activeTab(): Tab | null {
    let best: Tab | null = null
    for (const tab of this.tabs.values())
      if (tab.catalog && (!best || tab.focusedAt > best.focusedAt)) best = tab
    return best
  }

  // ---- Tools ---------------------------------------------------------------------------

  private catalog(): Catalog | null {
    return this.activeTab()?.catalog ?? this.lastCatalog
  }

  listTools(): AiToolInfo[] {
    const catalog = this.catalog()
    if (!catalog || catalog.access === "off") return [BOARD_STATUS]
    return [
      BOARD_STATUS,
      ...catalog.tools.filter((tool) => allows(catalog.access, tool.access)),
    ]
  }

  private notifyIfListChanged() {
    const signature = this.listTools()
      .map((tool) => `${tool.name}:${tool.access}:${tool.description.length}`)
      .join("|")
    if (signature === this.listSignature) return
    const first = this.listSignature === ""
    this.listSignature = signature
    if (first) return
    for (const session of this.sessions.values())
      for (const send of session.streams)
        send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" })
  }

  private status(): AiToolOutput {
    const tab = this.activeTab()
    const catalog = tab?.catalog
    const text = !tab
      ? NOT_OPEN
      : catalog?.access === "off"
        ? `Lemni is open ("${catalog.board}"), but the person has turned AI access off in its AI panel.`
        : `Lemni is open: "${catalog?.board}". Access: ${catalog?.access}. Call board_overview to start.`
    return { content: [{ type: "text", text }] }
  }

  async call(
    name: string,
    input: unknown,
    options: {
      session: string | null
      requestId: string | number | null
      signal?: AbortSignal
    }
  ): Promise<AiToolOutput> {
    if (name === BOARD_STATUS.name) return this.status()
    const tab = this.activeTab()
    if (!tab?.catalog) return errorOutput(NOT_OPEN)
    const { catalog } = tab
    if (catalog.access === "off")
      return errorOutput(
        "The person has turned AI access off in Lemni's AI panel."
      )
    const tool = catalog.tools.find((t) => t.name === name)
    if (!tool)
      return errorOutput(
        `There's no tool called ${name} on this board right now. The plugin that brings it may be turned off; list the tools again.`
      )
    if (!allows(catalog.access, tool.access))
      return errorOutput(
        tool.access === "write"
          ? "Station writes are off for AI apps. The person can allow them in Lemni's AI panel (Edit + station writes)."
          : "The person has set AI access to read only, so the board can't be changed."
      )

    const callId = randomUUID()
    const session = options.session ? this.sessions.get(options.session) : null
    return new Promise<AiToolOutput>((resolve) => {
      const timer = setTimeout(() => {
        tab.send({ type: "cancel", callId })
        this.finish(
          callId,
          errorOutput(
            tool.access === "write"
              ? "Nobody approved the request in time, so nothing was sent."
              : "The board didn't answer in time."
          )
        )
      }, tool.timeoutMs + 5_000)
      const onAbort = () => {
        tab.send({ type: "cancel", callId })
        this.finish(callId, errorOutput("Cancelled."))
      }
      options.signal?.addEventListener("abort", onAbort, { once: true })
      this.calls.set(callId, {
        tab: tab.id,
        session: options.session,
        requestId: options.requestId,
        resolve: (output) => {
          clearTimeout(timer)
          options.signal?.removeEventListener("abort", onAbort)
          resolve(output)
        },
      })
      tab.send({
        type: "call",
        callId,
        tool: name,
        input,
        client: session?.name ?? "An AI app",
      })
    })
  }

  /** A board tab's answer. Only the tab that was asked may answer. */
  answer(tabId: string, callId: string, output: AiToolOutput) {
    const call = this.calls.get(callId)
    if (!call || call.tab !== tabId) return false
    this.finish(callId, output)
    return true
  }

  /** The AI app gave up on a request (notifications/cancelled). */
  cancelRequest(session: string, requestId: string | number) {
    for (const [callId, call] of this.calls)
      if (call.session === session && call.requestId === requestId) {
        this.tabs.get(call.tab)?.send({ type: "cancel", callId })
        this.finish(callId, errorOutput("Cancelled."))
      }
  }

  private finish(callId: string, output: AiToolOutput) {
    const call = this.calls.get(callId)
    if (!call) return
    this.calls.delete(callId)
    call.resolve(output)
  }

  // ---- AI apps (MCP sessions) ----------------------------------------------------------

  startSession(info: { name?: unknown; title?: unknown; version?: unknown }) {
    this.pruneSessions()
    const code = typeof info.name === "string" ? info.name.slice(0, 80) : ""
    const title = typeof info.title === "string" ? info.title.slice(0, 80) : ""
    const now = Date.now()
    const session: Session = {
      id: randomUUID(),
      name: title || CLIENT_NAMES[code] || code || "AI app",
      version:
        typeof info.version === "string" ? info.version.slice(0, 40) : "",
      connectedAt: now,
      lastSeen: now,
      streams: new Set(),
    }
    this.sessions.set(session.id, session)
    this.broadcastClients()
    return session.id
  }

  touchSession(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    const quiet = Date.now() - session.lastSeen > 30_000
    session.lastSeen = Date.now()
    if (quiet) this.broadcastClients()
    return true
  }

  endSession(id: string) {
    if (this.sessions.delete(id)) this.broadcastClients()
  }

  /** Server → client messages for a session (its GET stream). */
  openSessionStream(id: string, send: (message: unknown) => void) {
    const session = this.sessions.get(id)
    if (!session) return null
    session.streams.add(send)
    return () => session.streams.delete(send)
  }

  private clients(): AiClientInfo[] {
    return [...this.sessions.values()]
      .map(({ id, name, version, connectedAt, lastSeen }) => ({
        id,
        name,
        version,
        connectedAt,
        lastSeen,
      }))
      .sort((a, b) => b.lastSeen - a.lastSeen)
  }

  private broadcastClients() {
    const clients = this.clients()
    for (const tab of this.tabs.values()) tab.send({ type: "clients", clients })
  }

  private pruneSessions() {
    const cutoff = Date.now() - SESSION_IDLE_MS
    for (const [id, session] of this.sessions)
      if (session.lastSeen < cutoff && !session.streams.size)
        this.sessions.delete(id)
  }
}

const globalBridge = globalThis as typeof globalThis & {
  __lemniAiBridge?: AiBridge
}

/** Process-wide; survives hot reloads in development. */
export function getAiBridge(): AiBridge {
  globalBridge.__lemniAiBridge ??= new AiBridge()
  return globalBridge.__lemniAiBridge
}
