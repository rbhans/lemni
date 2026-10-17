import "server-only"

import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"

import {
  BaskStreamClient,
  BaskStreamError,
  toSlotOrd,
  type BrowseNode,
  type Json,
  type PointSnapshot,
  type Watch,
} from "@basidekick/baskstream"

import {
  activeLevelOf,
  type ConnectionInfo,
  type ConnectionStatus,
  type ConnectRequest,
  type HistoryBucket,
  type PointDetails,
  type PointValue,
  type PointWrite,
  type StationAlarm,
  type StationNode,
  type WriteInfo,
  type WriteResult,
} from "../shared"
import { friendlyError } from "./errors"

const MAX_LIVE_POINTS = 500
/** How long a browser tab's live points are kept after its stream drops (page reloads). */
const SESSION_GRACE_MS = 30_000

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null
}

export function toStationNode(node: BrowseNode): StationNode {
  return {
    ord: toSlotOrd(node.ord),
    name: node.name,
    display: str(node.display) ?? node.name,
    kind: str(node.kind) ?? "component",
    typeSpec: str(node.typeSpec) ?? "",
    hasChildren: Boolean(node.hasChildren),
    writable: Boolean(node.writable),
    features: Array.isArray(node.features) ? node.features : [],
    status: str(node.status),
  }
}

export function toPointValue(snapshot: PointSnapshot): PointValue {
  const facets = (snapshot.facets ?? {}) as Json
  return {
    point: snapshot.point,
    ok: Boolean(snapshot.ok),
    value: snapshot.value ?? null,
    display:
      str(snapshot.displayValue) ??
      (snapshot.value === undefined ? "—" : String(snapshot.value)),
    status: str(snapshot.status) ?? (snapshot.ok ? "{ok}" : "{unknown}"),
    timestamp:
      typeof snapshot.timestamp === "number" ? snapshot.timestamp : null,
    valueType: str(snapshot.valueType),
    units: str(facets.units),
    code: str(snapshot.code),
    message: str(snapshot.message),
  }
}

interface Session {
  points: Set<string>
  streams: number
  expires: NodeJS.Timeout | null
}

/** One station connection: the SDK client, its live watch, and the tabs using it. */
class StationConnection extends EventEmitter {
  readonly id = randomUUID()
  status: ConnectionStatus = "connected"
  message: string | null = null
  private watch: Watch | null = null
  private readonly sessions = new Map<string, Session>()
  private watchUpdate: Promise<unknown> = Promise.resolve()

  constructor(
    readonly profile: Omit<ConnectRequest, "password">,
    readonly client: BaskStreamClient
  ) {
    super()
    this.setMaxListeners(100)
    client.on("disconnected", () =>
      this.setStatus("reconnecting", "Connection lost. Reconnecting…")
    )
    client.on(
      "reconnecting",
      ({ attempt, delayMs }: { attempt: number; delayMs: number }) =>
        this.setStatus(
          "reconnecting",
          `Reconnecting (attempt ${attempt}, next in ${Math.round(delayMs / 1000)} s)…`
        )
    )
    client.on("reconnected", () => this.setStatus("connected", null))
    client.on("revoked", () =>
      this.setStatus(
        this.status,
        "The station revoked some live subscriptions."
      )
    )
    // Required: an unhandled 'error' event would crash the server process.
    client.on("error", (error: unknown) =>
      this.setStatus(this.status, friendlyError(error))
    )
  }

  info(): ConnectionInfo {
    return {
      id: this.id,
      name: this.profile.name,
      station: new URL(this.profile.station).origin,
      username: this.profile.username,
      status: this.status,
      apiVersion: str(this.client.capabilities.apiVersion),
      writesEnabled: this.client.capabilities.writesEnabled === true,
      allowSelfSigned: this.profile.allowSelfSigned,
      message: this.message,
      livePoints: this.watch?.pointOrds.length ?? 0,
    }
  }

  private setStatus(status: ConnectionStatus, message: string | null) {
    this.status = status
    this.message = message
    this.emit("status", this.info())
  }

  // ---- Live values -------------------------------------------------------------------------

  /** Replaces one tab's interest set; the station watch follows the union of all tabs. */
  async setSessionPoints(
    sessionId: string,
    points: string[]
  ): Promise<PointValue[]> {
    const session = this.sessions.get(sessionId) ?? {
      points: new Set<string>(),
      streams: 0,
      expires: null,
    }
    session.points = new Set(points.map(toSlotOrd))
    this.sessions.set(sessionId, session)
    await this.syncWatch()
    const values = this.watch?.values
    return [...session.points].flatMap((ord) => {
      const snapshot = values?.get(ord)
      return snapshot ? [toPointValue(snapshot)] : []
    })
  }

  openStream(sessionId: string) {
    const session = this.sessions.get(sessionId) ?? {
      points: new Set<string>(),
      streams: 0,
      expires: null,
    }
    if (session.expires) clearTimeout(session.expires)
    session.expires = null
    session.streams += 1
    this.sessions.set(sessionId, session)
  }

  closeStream(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.streams -= 1
    if (session.streams > 0) return
    session.expires = setTimeout(() => {
      this.sessions.delete(sessionId)
      void this.syncWatch()
    }, SESSION_GRACE_MS)
    session.expires.unref()
  }

  pointsFor(sessionId: string): Set<string> {
    return this.sessions.get(sessionId)?.points ?? new Set()
  }

  private syncWatch(): Promise<unknown> {
    // Serialize updates so rapid changes from several tabs apply in order.
    this.watchUpdate = this.watchUpdate
      .catch(() => {})
      .then(async () => {
        const union = new Set<string>()
        for (const session of this.sessions.values())
          for (const ord of session.points) union.add(ord)
        let points = [...union]
        if (points.length > MAX_LIVE_POINTS) {
          points = points.slice(0, MAX_LIVE_POINTS)
          this.setStatus(
            this.status,
            `Only the first ${MAX_LIVE_POINTS} points are live (station limit).`
          )
        }
        if (!this.watch) {
          if (!points.length) return
          this.watch = await this.client.watch(points, {
            group: `lemscape-${this.id.slice(0, 8)}`,
            leaseSec: 120,
          })
          this.watch.on("change", (snapshot: PointSnapshot) =>
            this.emit("value", toPointValue(snapshot))
          )
          for (const snapshot of this.watch.values.values())
            this.emit("value", toPointValue(snapshot))
        } else {
          await this.watch.update(points)
        }
        this.emit("status", this.info())
      })
    return this.watchUpdate
  }

  // ---- Queries -----------------------------------------------------------------------------

  async browse(
    ord: string
  ): Promise<{ node: StationNode; children: StationNode[] }> {
    const node = await this.client.browse(ord || "slot:/", {
      depth: 1,
      metadata: "none",
    })
    return {
      node: toStationNode(node),
      children: (node.children ?? []).map(toStationNode),
    }
  }

  async search(
    query: string,
    limit = 100
  ): Promise<{ nodes: StationNode[]; truncated: boolean }> {
    const reply = await this.client.search("slot:/", query, {
      limit,
      metadata: "none",
    })
    const result = (reply.result ?? {}) as Json
    const nodes = Array.isArray(result.nodes)
      ? (result.nodes as BrowseNode[])
      : []
    return {
      nodes: nodes.map(toStationNode),
      truncated: result.truncated === true,
    }
  }

  async describe(ord: string): Promise<PointDetails> {
    const node = await this.client.describe(ord, "full")
    const metadata = (node.metadata ?? {}) as Json
    const point = (metadata.point ?? {}) as Json
    const facets = (point.facets ?? {}) as Json
    const parent = (metadata.parent ?? null) as Json | null
    const classification = (metadata.classification ?? {}) as Json
    const base = toStationNode(node)
    return {
      ...base,
      description: str(node.description),
      units: str(facets.units),
      precision:
        facets.precision !== undefined ? Number(facets.precision) : null,
      activeLevel:
        typeof point.activeLevel === "number"
          ? point.activeLevel
          : activeLevelOf(base.status),
      parent:
        parent && str(parent.ord)
          ? {
              ord: toSlotOrd(String(parent.ord)),
              display: str(parent.display) ?? str(parent.name) ?? "",
            }
          : null,
      hasHistory:
        classification.hasHistory === true || base.features.includes("history"),
    }
  }

  async read(points: string[]): Promise<PointValue[]> {
    return (await this.client.read(points.slice(0, 1000))).map(toPointValue)
  }

  /** Rollup buckets for `[start, end]` (at most 31 days, one-minute buckets at the finest). */
  async history(
    ord: string,
    window: { start: number; end: number; buckets: number }
  ): Promise<HistoryBucket[]> {
    const end = Math.min(window.end, Date.now())
    const span = Math.min(Math.max(end - window.start, 60_000), 31 * 86_400_000)
    const buckets = Math.min(Math.max(Math.round(window.buckets), 10), 600)
    const interval = Math.max(60_000, Math.round(span / buckets))
    try {
      const rollup = await this.client.historyRollup(ord, {
        start: end - span,
        end,
        interval,
      })
      const history = ((rollup.histories as Json[] | undefined) ?? [])[0]
      const buckets = (history?.buckets as Json[] | undefined) ?? []
      const num = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? v : null
      return buckets.map((b) => ({
        t: Number(b.start),
        avg: num(b.avg),
        min: num(b.min),
        max: num(b.max),
      }))
    } catch (error) {
      if (
        error instanceof BaskStreamError &&
        /history|not_found|unsupported/.test(error.code)
      )
        return []
      throw error
    }
  }

  async alarms(): Promise<StationAlarm[]> {
    const result = await this.client.alarms({
      scope: "open",
      order: "newest",
      limit: 200,
    })
    const list = (result.alarms as Json[] | undefined) ?? []
    return list.map((alarm) => {
      const data = (alarm.data ?? {}) as Json
      const sources = Array.isArray(alarm.sources)
        ? (alarm.sources as string[])
        : []
      return {
        uuid: String(alarm.uuid),
        timestamp: typeof alarm.timestamp === "number" ? alarm.timestamp : null,
        priority: typeof alarm.priority === "number" ? alarm.priority : null,
        alarmClass: str(alarm.alarmClass),
        sourceState: str(alarm.sourceState),
        ackState: str(alarm.ackState),
        source: sources[0] ? toSlotOrd(sources[0]) : null,
        message: str(data.msgText) ?? str(alarm.message) ?? "Alarm",
      }
    })
  }

  // ---- Writes (only after the person approved them; see api.ts) ----------------------

  async describeWrite(points: string[]): Promise<WriteInfo[]> {
    const reply = await this.client.describeWrite(points)
    const list = Array.isArray(reply.points) ? (reply.points as Json[]) : []
    return list.map((entry) => ({
      point: toSlotOrd(String(entry.point ?? "")),
      writable: entry.writable === true,
      actions: Array.isArray(entry.actions)
        ? (entry.actions as unknown[]).filter(
            (a): a is string => typeof a === "string"
          )
        : [],
      valueKind: str(entry.valueKind),
      supportsDuration: entry.supportsDuration === true,
      enumOptions: Array.isArray(entry.enumOptions)
        ? (entry.enumOptions as Json[]).flatMap((o) =>
            typeof o === "string" ? [o] : str(o?.tag) ? [String(o.tag)] : []
          )
        : [],
    }))
  }

  /** Sends each write once (never retried), then reads the points back. */
  async write(writes: PointWrite[]): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    for (const write of writes) {
      try {
        await this.client.write(
          write.point,
          write.action,
          write.action === "auto" ? undefined : write.value,
          write.durationSec ? { durationSec: write.durationSec } : {}
        )
        results.push({ point: write.point, ok: true })
      } catch (error) {
        results.push({
          point: write.point,
          ok: false,
          error: friendlyError(error),
        })
      }
    }
    // Let the station settle, then show what actually won.
    await new Promise((resolve) => setTimeout(resolve, 250))
    const after = await this.read(writes.map((w) => w.point)).catch(() => [])
    return results.map((result) => ({
      ...result,
      after: after.find((value) => value.point === toSlotOrd(result.point)),
    }))
  }

  async ackAlarms(uuids: string[]): Promise<Json> {
    return (await this.client.ackAlarms({ uuids })) as Json
  }

  async close() {
    for (const session of this.sessions.values())
      if (session.expires) clearTimeout(session.expires)
    this.sessions.clear()
    await this.watch?.close().catch(() => {})
    this.client.close()
    this.setStatus("disconnected", null)
    this.removeAllListeners()
  }
}

function normalizeStationUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(
      raw.trim().includes("://") ? raw.trim() : `https://${raw.trim()}`
    )
  } catch {
    throw new BaskStreamError(
      "invalid_request",
      "That station address isn't a valid URL."
    )
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BaskStreamError(
      "invalid_request",
      "Use an http:// or https:// station address."
    )
  }
  if (url.username || url.password) {
    throw new BaskStreamError(
      "invalid_request",
      "Don't put credentials in the address; use the username and password fields."
    )
  }
  return url.origin
}

/** Process-wide registry of station connections. Survives hot reloads in development. */
class StationHub {
  private readonly connections = new Map<string, StationConnection>()

  list(): ConnectionInfo[] {
    return [...this.connections.values()].map((connection) => connection.info())
  }

  get(id: string): StationConnection {
    const connection = this.connections.get(id)
    if (!connection)
      throw new BaskStreamError(
        "connection_not_found",
        "That station connection is no longer open."
      )
    return connection
  }

  async connect(request: ConnectRequest): Promise<ConnectionInfo> {
    const station = normalizeStationUrl(request.station)
    const password = request.password
    const client = await BaskStreamClient.connect({
      station,
      username: request.username,
      // Kept only in this closure (server memory) so reconnects can log in again.
      password: () => password,
      verifyTls: !request.allowSelfSigned,
      reconnect: true,
      timeoutMs: 20_000,
    })
    const connection = new StationConnection(
      {
        name: request.name.trim() || new URL(station).host,
        station,
        username: request.username,
        allowSelfSigned: request.allowSelfSigned,
      },
      client
    )
    this.connections.set(connection.id, connection)
    return connection.info()
  }

  async disconnect(id: string) {
    const connection = this.connections.get(id)
    if (!connection) return
    this.connections.delete(id)
    await connection.close()
  }
}

const globalHub = globalThis as typeof globalThis & {
  __lemscapeStationHub?: StationHub
}

export function getStationHub(): StationHub {
  globalHub.__lemscapeStationHub ??= new StationHub()
  return globalHub.__lemscapeStationHub
}

export type { StationConnection }
