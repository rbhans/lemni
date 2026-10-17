"use client"

import { atom, computed, react, type Atom } from "tldraw"

import {
  registerDataSource,
  type DataSource,
  type HistoryBucket,
  type HistoryQuery,
  type LiveValue,
  type PointOption,
  type PointWriteRequest,
  type WriteAction,
  type WriteCapability,
  type WriteOutcome,
  type WriteRequester,
} from "@/studio/data/live-points"
import { sourceIcon } from "@/studio/shell/source-icon"

import {
  statusKind,
  type ConnectionInfo,
  type LiveEvent,
  type PointValue,
  type StationNode,
  type StationProfile,
} from "../shared"
import { stationApi, StationApiError } from "./api"

/** A live Niagara station. */
export const NIAGARA_ICON = sourceIcon("N", "live")

const SESSION_ID = crypto.randomUUID()
const ACTIVE_KEY = "lemscape.station.active"
const PROFILES_KEY = "lemscape.station-profiles.v1"

function toLiveValue(value: PointValue): LiveValue {
  return {
    ok: value.ok,
    value: value.value,
    display: value.display,
    status: value.status,
    statusKind: statusKind(value.status, value.ok),
    timestamp: value.timestamp,
    units: value.units,
  }
}

function pointOption(node: StationNode): PointOption {
  const type = node.typeSpec.toLowerCase()
  return {
    point: node.ord,
    label: node.name,
    path: node.ord
      .replace(/^slot:\//, "")
      .split("/")
      .slice(0, -1)
      .join("/"),
    kind: type.includes("boolean")
      ? "boolean"
      : type.includes("numeric")
        ? "number"
        : type.includes("enum") || type.includes("string")
          ? "text"
          : null,
  }
}

// ---- Saved profiles (never a password) -------------------------------------------------------

function loadProfiles(): StationProfile[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(PROFILES_KEY) ?? "[]"
    )
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (p): p is StationProfile =>
          typeof p?.station === "string" && typeof p?.username === "string"
      )
      .map(({ name, station, username, allowSelfSigned }) => ({
        name: name ?? "",
        station,
        username,
        allowSelfSigned: allowSelfSigned === true,
      }))
  } catch {
    return []
  }
}

export const stationProfiles = atom<StationProfile[]>(
  "station profiles",
  loadProfiles()
)
react("persist station profiles", () => {
  const profiles = stationProfiles.get()
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
  } catch {
    // Storage blocked: profiles apply for this session only.
  }
})

export function rememberProfile(profile: StationProfile) {
  stationProfiles.update((all) =>
    [
      profile,
      ...all.filter(
        (p) => p.station !== profile.station || p.username !== profile.username
      ),
    ].slice(0, 12)
  )
}

export function forgetProfile(profile: StationProfile) {
  stationProfiles.update((all) =>
    all.filter(
      (p) => p.station !== profile.station || p.username !== profile.username
    )
  )
}

// ---- The active connection ------------------------------------------------------------------

// The Station panel's tree registers how to show a point (it imports this module, so
// the store can't import it back).
let revealInTree: ((ord: string) => void) | null = null
export function onReveal(reveal: (ord: string) => void) {
  revealInTree = reveal
}

/** Live values and interest tracking for the connected station. */
class NiagaraLiveSource implements DataSource {
  readonly label: string
  readonly icon = NIAGARA_ICON
  private readonly values = new Map<string, Atom<LiveValue | undefined>>()
  private readonly interest = new Map<string, number>()
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private events: EventSource | null = null
  private unregister: (() => void) | null = null

  constructor(
    readonly id: string,
    private readonly connectionId: string,
    label: string
  ) {
    this.label = label
  }

  start() {
    this.unregister = registerDataSource(this)
    this.events = new EventSource(
      stationApi.liveUrl(this.connectionId, SESSION_ID)
    )
    this.events.onmessage = (message) => {
      const event = JSON.parse(message.data) as LiveEvent
      if (event.type === "values")
        for (const value of event.points)
          this.value(value.point).set(toLiveValue(value))
      else connection.set(event.connection)
    }
    this.events.onerror = () => {
      // EventSource retries by itself; stop if the server no longer knows this connection.
      stationApi.get(this.connectionId).catch((error) => {
        if (error instanceof StationApiError && error.status === 404)
          void detach("The station connection closed.")
      })
    }
    this.scheduleSync()
  }

  stop() {
    this.events?.close()
    this.events = null
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.unregister?.()
    for (const value of this.values.values()) value.set(undefined)
  }

  watch(point: string): () => void {
    this.interest.set(point, (this.interest.get(point) ?? 0) + 1)
    this.scheduleSync()
    let released = false
    return () => {
      if (released) return
      released = true
      const count = (this.interest.get(point) ?? 1) - 1
      if (count <= 0) this.interest.delete(point)
      else this.interest.set(point, count)
      this.scheduleSync()
    }
  }

  async search(query: string): Promise<PointOption[]> {
    if (query.trim().length < 2) return []
    const { nodes } = await stationApi.search(this.connectionId, query.trim())
    return nodes.filter((node) => node.kind === "point").map(pointOption)
  }

  reveal(point: string) {
    revealInTree?.(point)
  }

  async describeWrite(points: string[]): Promise<WriteCapability[]> {
    const { points: infos } = await stationApi.describeWrite(
      this.connectionId,
      points
    )
    return infos.map((info) => ({
      point: info.point,
      writable: info.writable,
      actions: info.actions.filter(
        (a): a is WriteAction => a === "set" || a === "override" || a === "auto"
      ),
      enumOptions: info.enumOptions,
      supportsDuration: info.supportsDuration,
    }))
  }

  async write(
    writes: PointWriteRequest[],
    who: WriteRequester
  ): Promise<WriteOutcome[]> {
    const { results } = await stationApi.write(this.connectionId, writes, who)
    return results.map((result) => {
      if (result.after) this.value(result.point).set(toLiveValue(result.after))
      return {
        point: result.point,
        ok: result.ok,
        error: result.error,
        after: result.after ? toLiveValue(result.after) : undefined,
      }
    })
  }

  /** Walks the folder breadth-first, a few levels deep, collecting points. */
  async pointsUnder(folder: string, limit: number): Promise<PointOption[]> {
    const found: PointOption[] = []
    let level = [folder]
    let requests = 0
    for (
      let depth = 0;
      depth < 4 && level.length && found.length < limit;
      depth++
    ) {
      const next: string[] = []
      for (const ord of level) {
        if (requests++ >= 80 || found.length >= limit) break
        const { children } = await stationApi.browse(this.connectionId, ord)
        for (const node of children) {
          if (node.kind === "point") {
            if (found.length < limit) found.push(pointOption(node))
          } else if (node.hasChildren) next.push(node.ord)
        }
      }
      level = next
    }
    return found
  }

  async history(point: string, query: HistoryQuery): Promise<HistoryBucket[]> {
    const { buckets } = await stationApi.historyWindow(
      this.connectionId,
      point,
      query
    )
    return buckets
  }

  value(point: string): Atom<LiveValue | undefined> {
    let value = this.values.get(point)
    if (!value) {
      value = atom(`live ${point}`, undefined as LiveValue | undefined)
      this.values.set(point, value)
    }
    return value
  }

  private scheduleSync() {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => void this.sync(), 150)
  }

  private async sync() {
    this.syncTimer = null
    try {
      const { points } = await stationApi.watch(this.connectionId, SESSION_ID, [
        ...this.interest.keys(),
      ])
      for (const value of points)
        this.value(value.point).set(toLiveValue(value))
    } catch (error) {
      connectionError.set(
        error instanceof Error ? error.message : "Couldn't update live points."
      )
    }
  }
}

export const connection = atom<ConnectionInfo | null>(
  "station connection",
  null
)
export const connectionError = atom<string | null>(
  "station connection error",
  null
)
let source: NiagaraLiveSource | null = null

/** The rail icon: dashed until the station is connected. */
export const niagaraRailIcon = computed("niagara rail icon", () =>
  sourceIcon("N", "live", connection.get()?.status === "connected")
)

/** Stable source id for drawings: the station, not this browser session. */
export function sourceIdFor(info: Pick<ConnectionInfo, "station">) {
  return `niagara:${info.station}`
}

export function currentSourceId(): string | null {
  const info = connection.get()
  return info ? sourceIdFor(info) : null
}

function attach(info: ConnectionInfo) {
  source?.stop()
  connection.set(info)
  connectionError.set(null)
  sessionStorage.setItem(ACTIVE_KEY, info.id)
  source = new NiagaraLiveSource(sourceIdFor(info), info.id, info.name)
  source.start()
}

export async function detach(message: string | null = null) {
  source?.stop()
  source = null
  connection.set(null)
  connectionError.set(message)
  sessionStorage.removeItem(ACTIVE_KEY)
}

export async function connect(
  profile: StationProfile,
  password: string,
  remember: boolean
) {
  const { connection: info } = await stationApi.connect({
    ...profile,
    password,
  })
  if (remember) rememberProfile(profile)
  attach(info)
  return info
}

export async function disconnect() {
  const info = connection.get()
  await detach()
  if (info) await stationApi.disconnect(info.id).catch(() => {})
}

/** After a reload, reattach to a connection the server still holds. */
export async function restore() {
  if (connection.get()) return
  try {
    const { connections } = await stationApi.list()
    const saved = sessionStorage.getItem(ACTIVE_KEY)
    const match = connections.find((c) => c.id === saved) ?? connections[0]
    if (match) attach(match)
  } catch {
    // Server unreachable; the panel shows the connect form.
  }
}

export function liveSource() {
  return source
}
