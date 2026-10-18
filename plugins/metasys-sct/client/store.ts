"use client"

import { atom, computed, react, type Atom } from "tldraw"

import {
  PluginApiError,
  pluginStorage,
  registerDataSource,
  sourceIcon,
  type DataSource,
  type LiveValue,
  type PointOption,
} from "@/sdk"

import { sourceIdFor } from "../model"
import type {
  SctConnectionInfo,
  SctNode,
  SctPointValue,
  SctServerProfile,
} from "../shared"
import { sctApi } from "./api"

/** A Metasys archive in SQL Server. */
export const SCT_ICON = sourceIcon("M", "sql")

const storage = pluginStorage("metasys-sct")
/** The connection this tab shows (per tab, so sessionStorage). */
const ACTIVE_KEY = storage.key("active", { from: ["lemscape.sct.active"] })
const PROFILES_KEY = storage.key("profiles", {
  from: ["lemscape.sct-profiles.v1"],
})

/** Folder drags carry the item id ("#123"): they're used at once, so it needn't be stable. */
export const folderRef = (node: Pick<SctNode, "id">) => `#${node.id}`

export function pointOption(node: SctNode): PointOption {
  const parts = node.display.split(".")
  return {
    point: node.fqr,
    label: node.name,
    path: parts.slice(0, -1).join(".") || node.fqr.split("/")[0],
    kind: node.kind,
  }
}

// An archive is a snapshot: values are what SCT stored, never live. Offline archives
// mostly keep the configured defaults, so the status says which one it is.
function toLiveValue(value: SctPointValue, archive: string): LiveValue {
  const from = value.from
    ? `${value.from[0].toUpperCase()}${value.from.slice(1)} in ${archive}`
    : `No value stored in ${archive}`
  return {
    ok: value.ok,
    value: value.value,
    display: value.display,
    status: value.ok ? from : value.display,
    statusKind: value.ok ? "ok" : "unknown",
    timestamp: null,
    units: value.units,
  }
}

// ---- Saved profiles (never a password) -------------------------------------------------------

export interface SctProfile extends SctServerProfile {
  /** The archive last opened with this login. */
  database: string
}

function loadProfiles(): SctProfile[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(PROFILES_KEY) ?? "[]"
    )
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (p): p is SctProfile =>
          typeof p?.server === "string" && typeof p?.username === "string"
      )
      .map(({ server, port, username, trustCertificate, database }) => ({
        server,
        port: Number.isInteger(port) ? port : 1433,
        username,
        trustCertificate: trustCertificate === true,
        database: typeof database === "string" ? database : "",
      }))
  } catch {
    return []
  }
}

export const sctProfiles = atom<SctProfile[]>("sct profiles", loadProfiles())
react("persist sct profiles", () => {
  const profiles = sctProfiles.get()
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
  } catch {
    // Storage blocked: profiles apply for this session only.
  }
})

const sameLogin = (a: SctServerProfile, b: SctServerProfile) =>
  a.server === b.server && a.port === b.port && a.username === b.username

export function rememberProfile(profile: SctProfile) {
  sctProfiles.update((all) =>
    [profile, ...all.filter((p) => !sameLogin(p, profile))].slice(0, 12)
  )
}

export function forgetProfile(profile: SctServerProfile) {
  sctProfiles.update((all) => all.filter((p) => !sameLogin(p, profile)))
}

// ---- The open archive -----------------------------------------------------------------------

// The panel's tree registers how to show a point (it imports this module).
let revealInTree: ((fqr: string) => void) | null = null
export function onReveal(reveal: (fqr: string) => void) {
  revealInTree = reveal
}

/** Points of an open archive. Values load once (an archive doesn't change). */
class SctArchiveSource implements DataSource {
  readonly icon = SCT_ICON
  private readonly values = new Map<string, Atom<LiveValue | undefined>>()
  private readonly pending = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private unregister: (() => void) | null = null

  constructor(
    readonly id: string,
    readonly label: string,
    private readonly connectionId: string
  ) {}

  start() {
    this.unregister = registerDataSource(this)
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.unregister?.()
    for (const value of this.values.values()) value.set(undefined)
  }

  watch(point: string): () => void {
    if (!this.value(point).get()) {
      this.pending.add(point)
      this.timer ??= setTimeout(() => void this.load(), 60)
    }
    return () => {}
  }

  value(point: string): Atom<LiveValue | undefined> {
    let value = this.values.get(point)
    if (!value) {
      value = atom(`sct ${point}`, undefined as LiveValue | undefined)
      this.values.set(point, value)
    }
    return value
  }

  async search(query: string): Promise<PointOption[]> {
    if (query.trim().length < 2) return []
    const { nodes } = await sctApi.search(this.connectionId, query.trim())
    return nodes.map(pointOption)
  }

  async pointsUnder(folder: string, limit: number): Promise<PointOption[]> {
    const item = Number(folder.replace(/^#/, ""))
    if (!folder.startsWith("#") || !Number.isInteger(item)) return []
    const { nodes } = await sctApi.under(this.connectionId, item, limit)
    return nodes.map(pointOption)
  }

  reveal(point: string) {
    revealInTree?.(point)
  }

  private async load() {
    this.timer = null
    const points = [...this.pending].slice(0, 300)
    for (const p of points) this.pending.delete(p)
    if (this.pending.size) this.timer = setTimeout(() => void this.load(), 0)
    try {
      const { values } = await sctApi.values(this.connectionId, points)
      for (const v of values) this.value(v.fqr).set(toLiveValue(v, this.label))
    } catch (error) {
      if (error instanceof PluginApiError && error.status === 404)
        void detach("The archive connection closed.")
    }
  }
}

export const sctConnection = atom<SctConnectionInfo | null>(
  "sct connection",
  null
)
export const sctConnectionError = atom<string | null>(
  "sct connection error",
  null
)
let source: SctArchiveSource | null = null

/** The rail icon: dashed until an archive is open. */
export const sctRailIcon = computed("sct rail icon", () =>
  sourceIcon("M", "sql", sctConnection.get() !== null)
)

export function currentSourceId(): string | null {
  const info = sctConnection.get()
  return info ? sourceIdFor(info.database) : null
}

function attach(info: SctConnectionInfo) {
  source?.stop()
  sctConnection.set(info)
  sctConnectionError.set(null)
  sessionStorage.setItem(ACTIVE_KEY, info.id)
  source = new SctArchiveSource(
    sourceIdFor(info.database),
    info.archive,
    info.id
  )
  source.start()
}

export async function detach(message: string | null = null) {
  source?.stop()
  source = null
  sctConnection.set(null)
  sctConnectionError.set(message)
  sessionStorage.removeItem(ACTIVE_KEY)
}

export async function connect(
  profile: SctServerProfile,
  password: string,
  database: string,
  remember: boolean
) {
  const { connection: info } = await sctApi.connect(profile, password, database)
  if (remember) rememberProfile({ ...profile, database })
  attach(info)
  return info
}

export async function disconnect() {
  const info = sctConnection.get()
  await detach()
  if (info) await sctApi.disconnect(info.id).catch(() => {})
}

/** After a reload, reattach to an archive the server still holds open. */
export async function restore() {
  if (sctConnection.get()) return
  try {
    const { connections } = await sctApi.list()
    const saved = sessionStorage.getItem(ACTIVE_KEY)
    const match = connections.find((c) => c.id === saved) ?? connections[0]
    if (match) attach(match)
  } catch {
    // Server unreachable; the panel shows the connect form.
  }
}
