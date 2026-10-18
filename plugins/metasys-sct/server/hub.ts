import "server-only"

import { randomUUID } from "node:crypto"
import { isIP } from "node:net"

import sql from "mssql"

import {
  displayStored,
  fqrOf,
  inNetworkTree,
  isDatabaseName,
  kindOfClass,
  NOT_NETWORK_CLASSES,
  NOT_NETWORK_FOLDERS,
  NOT_NETWORK_TYPES,
  nodeName,
  ownsReferences,
  parseStored,
  pointShort,
  splitFqr,
  unitsOf,
  type ItemRow,
} from "../model"
import type {
  SctConnectionInfo,
  SctConnectRequest,
  SctNode,
  SctPointDetail,
  SctPointValue,
  SctServerProfile,
} from "../shared"

// Read-only access to SCT archives. Every query is a fixed, parameterized SELECT; the
// password lives only in the pool's config in this process. Nothing here writes.

const DESCRIPTION = 28
const UNITS = 117
// An offline archive rarely has a Present Value (that's runtime); it keeps the
// configured defaults. First one stored wins.
const VALUE_ATTRIBUTES = [
  [85, "present value"],
  [104, "relinquish default"],
  [3113, "default value"],
] as const
const POINT_CLASSES = "0,1,2,3,4,5,13,14,19"
const MAX_CHILDREN = 2000

function poolConfig(
  profile: SctServerProfile,
  password: string,
  database: string
): sql.config {
  return {
    server: profile.server,
    port: profile.port,
    database,
    user: profile.username,
    password,
    connectionTimeout: 12_000,
    requestTimeout: 30_000,
    options: {
      encrypt: true,
      trustServerCertificate: profile.trustCertificate,
      // TLS won't accept an IP as the server name; with a trusted self-signed
      // certificate the name doesn't matter, so give it one it accepts.
      ...(isIP(profile.server) && profile.trustCertificate
        ? { serverName: "localhost" }
        : {}),
    },
    pool: { max: 4, min: 0, idleTimeoutMillis: 60_000 },
  }
}

/** Plain-language versions of the driver's errors. */
export function friendlySqlError(error: unknown): string {
  const e = error as {
    code?: string
    message?: string
    originalError?: { message?: string }
  }
  const message = e?.originalError?.message ?? e?.message ?? String(error)
  if (/Login failed/i.test(message))
    return "SQL Server refused the username or password."
  if (e?.code === "ETIMEOUT")
    return "SQL Server didn't answer in time. Check the address and port."
  if (e?.code === "ESOCKET")
    return "Couldn't reach SQL Server at that address and port."
  if (/self[- ]signed|certificate/i.test(message))
    return "SQL Server's certificate isn't trusted. Turn on “Trust the server certificate” for a self-signed one."
  if (/Cannot open database/i.test(message))
    return "That database doesn't exist, or this login can't open it."
  return message.slice(0, 300)
}

const ROW_COLUMNS = `
  i.itemID, i.parentItemID, i.DeviceItemID, i.PartialReference, i.UserName, i.ObjectId,
  d.type, d.bacnetClassid, d.itemDefName, dev.PartialReference AS deviceRef`

type Row = ItemRow & { deviceRef: string | null }

const quoted = (names: readonly string[]) =>
  names.map((n) => `N'${n.replace(/'/g, "''")}'`).join(", ")

/** The network-tree filter (model.ts `inNetworkTree`) in SQL, for item `a` typed by `d`. */
const inNetwork = (a: string, d: string) => `(
  ${a}.itemState <> 0
  AND ${d}.type NOT IN (${quoted(NOT_NETWORK_TYPES)})
  AND ISNULL(${d}.bacnetClassid, -1) NOT IN (${NOT_NETWORK_CLASSES.join(", ")})
  AND (${d}.type = 'site' OR (
    ISNULL(${a}.PartialReference, '') NOT LIKE '[$]%'
    AND ISNULL(${a}.PartialReference, '') NOT LIKE '%.[$]%'
    AND NOT (${d}.type = 'folder' AND ${a}.PartialReference IN (${quoted(NOT_NETWORK_FOLDERS)})))))`

const CHILD_COUNT = `(SELECT COUNT_BIG(1) FROM dbo.Item c
  JOIN dbo.ItemDefinition cd ON cd.itemDefInternalID = c.itemDefInternalID
  WHERE c.parentItemID = i.itemID AND ${inNetwork("c", "cd")}) AS childCount`

function toNode(row: Row): SctNode {
  const ref = row.PartialReference ?? ""
  const fqr = ownsReferences(row.type) ? ref : fqrOf(ref, row.deviceRef)
  const isValue = row.type === "point" || row.type === "object"
  return {
    id: row.itemID,
    fqr,
    name: nodeName(row),
    display: row.UserName ?? "",
    type: row.type,
    definition: row.itemDefName,
    classId: row.bacnetClassid,
    pointType: isValue ? pointShort(row.bacnetClassid) : null,
    kind: isValue ? kindOfClass(row.bacnetClassid) : null,
    hasChildren: Number(row.childCount ?? 0) > 0,
  }
}

interface ConnectionParts {
  id: string
  profile: SctServerProfile
  database: string
  pool: sql.ConnectionPool
  archive: string
  release: string | null
}

class SctConnection {
  private resolved = new Map<string, Row | null>()

  constructor(private readonly parts: ConnectionParts) {}

  get id() {
    return this.parts.id
  }
  get profile() {
    return this.parts.profile
  }
  get database() {
    return this.parts.database
  }
  private get pool() {
    return this.parts.pool
  }

  /** What a reloaded hub needs to keep this connection open. */
  handOver(): ConnectionParts {
    return this.parts
  }

  info(): SctConnectionInfo {
    const { id, profile, database, archive, release } = this.parts
    return { ...profile, id, database, archive, release }
  }

  async close() {
    await this.pool.close().catch(() => {})
  }

  private request() {
    return this.pool.request()
  }

  /** Children of an item; the archive's top level when `parentId` is null. */
  async children(parentId: number | null): Promise<SctNode[]> {
    const request = this.request()
    let where: string
    if (parentId === null) {
      where =
        "i.parentItemID = (SELECT TOP (1) itemID FROM dbo.Item WHERE parentItemID IS NULL ORDER BY itemID)"
    } else {
      request.input("parent", sql.Int, parentId)
      where = "i.parentItemID = @parent"
    }
    const { recordset } = await request.query<Row>(`
      SELECT TOP (${MAX_CHILDREN}) ${ROW_COLUMNS}, ${CHILD_COUNT}
      FROM dbo.Item i
      JOIN dbo.ItemDefinition d ON d.itemDefInternalID = i.itemDefInternalID
      LEFT JOIN dbo.Item dev ON dev.itemID = i.DeviceItemID
      WHERE ${where} AND ${inNetwork("i", "d")}
      ORDER BY CASE WHEN d.type IN ('point', 'object') THEN 1 ELSE 0 END, i.PartialReference`)
    return recordset.filter(inNetworkTree).map(toNode)
  }

  /** Points and value objects whose name or reference matches. */
  async search(query: string): Promise<SctNode[]> {
    const request = this.request()
    request.input(
      "q",
      sql.NVarChar(400),
      `%${query.replace(/[[%_]/g, "[$&]")}%`
    )
    const { recordset } = await request.query<Row>(`
      SELECT TOP (100) ${ROW_COLUMNS}, 0 AS childCount
      FROM dbo.Item i
      JOIN dbo.ItemDefinition d ON d.itemDefInternalID = i.itemDefInternalID
      LEFT JOIN dbo.Item dev ON dev.itemID = i.DeviceItemID
      WHERE i.itemState <> 0 AND d.type IN ('point', 'object')
        AND d.bacnetClassid IN (${POINT_CLASSES})
        AND (i.PartialReference LIKE @q OR i.UserName LIKE @q)
      ORDER BY i.PartialReference`)
    return recordset.map(toNode)
  }

  /** The item an FQR names (cached; archives don't change while open). */
  private async resolve(fqr: string): Promise<Row | null> {
    if (this.resolved.has(fqr)) return this.resolved.get(fqr) ?? null
    const { device, item } = splitFqr(fqr)
    const request = this.request()
    request.input("item", sql.NVarChar(1000), item)
    let where: string
    if (device) {
      request.input("device", sql.NVarChar(1000), device)
      where = "dev.PartialReference = @device AND i.PartialReference = @item"
    } else {
      where = "i.PartialReference = @item AND d.type IN ('server', 'device')"
    }
    const { recordset } = await request.query<Row>(`
      SELECT TOP (1) ${ROW_COLUMNS}, ${CHILD_COUNT}
      FROM dbo.Item i
      JOIN dbo.ItemDefinition d ON d.itemDefInternalID = i.itemDefInternalID
      LEFT JOIN dbo.Item dev ON dev.itemID = i.DeviceItemID
      WHERE ${where} AND i.itemState <> 0`)
    const row = recordset[0] ?? null
    this.resolved.set(fqr, row)
    return row
  }

  /** Values the archive stores for points: Present Value if kept, else the configured defaults. */
  async values(fqrs: string[]): Promise<SctPointValue[]> {
    const rows = await Promise.all(fqrs.map((fqr) => this.resolve(fqr)))
    const ids = [...new Set(rows.flatMap((row) => (row ? [row.itemID] : [])))]
    const stored = new Map<number, Map<number, string | null>>()
    if (ids.length) {
      const request = this.request()
      const params = ids.map((id, i) => {
        request.input(`id${i}`, sql.Int, id)
        return `@id${i}`
      })
      const attribs = [...VALUE_ATTRIBUTES.map(([id]) => id), UNITS]
      const { recordset } = await request.query<{
        ItemID: number
        AttribID: number
        Value: string | null
      }>(`
        SELECT ItemID, AttribID, Value FROM dbo.Value
        WHERE ValueState <> 0 AND ParentValueOrder IS NULL
          AND AttribID IN (${attribs.join(", ")})
          AND ItemID IN (${params.join(", ")})
        ORDER BY ValueOrder`)
      for (const r of recordset) {
        const item = stored.get(r.ItemID) ?? new Map<number, string | null>()
        if (!item.has(r.AttribID)) item.set(r.AttribID, r.Value)
        stored.set(r.ItemID, item)
      }
    }
    return fqrs.map((fqr, i) => {
      const row = rows[i]
      if (!row)
        return {
          fqr,
          ok: false,
          value: null,
          display: "Not in archive",
          units: null,
          from: null,
        }
      const kind = kindOfClass(row.bacnetClassid)
      const attributes = stored.get(row.itemID)
      const units =
        kind === "number" ? unitsOf(attributes?.get(UNITS) ?? null) : null
      for (const [attrib, from] of VALUE_ATTRIBUTES) {
        const value = parseStored(attributes?.get(attrib) ?? null, kind)
        if (value !== null)
          return {
            fqr,
            ok: true,
            value,
            display: displayStored(value, units),
            units,
            from,
          }
      }
      return { fqr, ok: true, value: null, display: "—", units, from: null }
    })
  }

  /** A point's details: description, object id, engine, and where it sits in the tree. */
  async describe(fqr: string): Promise<SctPointDetail | null> {
    const row = await this.resolve(fqr)
    if (!row) return null
    const request = this.request()
    request.input("id", sql.Int, row.itemID)
    request.input("attrib", sql.Int, DESCRIPTION)
    const description = await request.query<{ Value: string | null }>(`
      SELECT TOP (1) Value FROM dbo.Value
      WHERE ItemID = @id AND AttribID = @attrib AND ValueState <> 0 ORDER BY ValueOrder`)
    const path = await this.request().input("id", sql.Int, row.itemID).query<{
      itemID: number
      PartialReference: string | null
      UserName: string | null
      type: string
      depth: number
    }>(`
        WITH up AS (
          SELECT itemID, parentItemID, 0 AS depth FROM dbo.Item WHERE itemID = @id
          UNION ALL
          SELECT p.itemID, p.parentItemID, up.depth + 1 FROM dbo.Item p JOIN up ON p.itemID = up.parentItemID)
        SELECT up.itemID, i.PartialReference, i.UserName, d.type, up.depth
        FROM up JOIN dbo.Item i ON i.itemID = up.itemID
        JOIN dbo.ItemDefinition d ON d.itemDefInternalID = i.itemDefInternalID
        WHERE up.depth > 0 AND i.parentItemID IS NOT NULL
        ORDER BY up.depth DESC
        OPTION (MAXRECURSION 64)`)
    return {
      ...toNode(row),
      description: description.recordset[0]?.Value ?? null,
      objectId: row.ObjectId,
      device: row.deviceRef,
      path: path.recordset.map((p) => ({ id: p.itemID, name: nodeName(p) })),
    }
  }

  /** Points under a folder, engine or controller, a few levels deep. */
  async pointsUnder(itemId: number, limit: number): Promise<SctNode[]> {
    const request = this.request()
    request.input("root", sql.Int, itemId)
    request.input("limit", sql.Int, Math.min(Math.max(1, limit), 500))
    const { recordset } = await request.query<Row>(`
      WITH down AS (
        SELECT itemID, 0 AS depth FROM dbo.Item WHERE itemID = @root
        UNION ALL
        SELECT c.itemID, down.depth + 1 FROM dbo.Item c JOIN down ON c.parentItemID = down.itemID
        WHERE c.itemState <> 0 AND down.depth < 6)
      SELECT TOP (@limit) ${ROW_COLUMNS}, 0 AS childCount
      FROM down JOIN dbo.Item i ON i.itemID = down.itemID
      JOIN dbo.ItemDefinition d ON d.itemDefInternalID = i.itemDefInternalID
      LEFT JOIN dbo.Item dev ON dev.itemID = i.DeviceItemID
      WHERE d.type IN ('point', 'object') AND d.bacnetClassid IN (${POINT_CLASSES})
      ORDER BY i.PartialReference
      OPTION (MAXRECURSION 16)`)
    return recordset.map(toNode)
  }
}

class SctHub {
  private connections = new Map<string, SctConnection>()

  /** Keeps a previous hub's open pools (after a hot reload) with this code's queries. */
  adopt(previous: { handOverAll?(): ConnectionParts[] }) {
    for (const parts of previous.handOverAll?.() ?? [])
      this.connections.set(parts.id, new SctConnection(parts))
  }

  handOverAll(): ConnectionParts[] {
    return [...this.connections.values()].map((c) => c.handOver())
  }

  list(): SctConnectionInfo[] {
    return [...this.connections.values()].map((c) => c.info())
  }

  get(id: string): SctConnection {
    const connection = this.connections.get(id)
    if (!connection)
      throw Object.assign(new Error("That archive connection is closed."), {
        status: 404,
      })
    return connection
  }

  /** SCT archives on the server: online databases that have SCT's item tables. */
  async listArchives(
    profile: SctServerProfile,
    password: string
  ): Promise<string[]> {
    const pool = new sql.ConnectionPool(poolConfig(profile, password, "master"))
    try {
      await pool.connect()
      const { recordset } = await pool.request().query<{ name: string }>(`
        SELECT name FROM sys.databases
        WHERE state_desc = 'ONLINE' AND database_id > 4
          AND OBJECT_ID(QUOTENAME(name) + '.dbo.Item') IS NOT NULL
          AND OBJECT_ID(QUOTENAME(name) + '.dbo.ItemDefinition') IS NOT NULL
        ORDER BY name`)
      return recordset.map((r) => r.name)
    } finally {
      await pool.close().catch(() => {})
    }
  }

  async connect(request: SctConnectRequest): Promise<SctConnectionInfo> {
    if (!isDatabaseName(request.database))
      throw new Error("That isn't a valid database name.")
    const pool = new sql.ConnectionPool(
      poolConfig(request, request.password, request.database)
    )
    await pool.connect()
    try {
      // Is this an SCT archive? Its root item names it.
      const { recordset } = await pool
        .request()
        .query<{ PartialReference: string | null }>(
          "SELECT TOP (1) PartialReference FROM dbo.Item WHERE parentItemID IS NULL ORDER BY itemID"
        )
      if (!recordset.length)
        throw new Error("That database has no SCT archive in it.")
      let release: string | null = null
      try {
        const history = await pool
          .request()
          .query<{ Build: string | null }>(
            "SELECT TOP (1) Build FROM dbo.ArchiveHistory ORDER BY EventTimeStamp DESC"
          )
        release = history.recordset[0]?.Build ?? null
      } catch {
        // Older archives have no history table.
      }
      const { password: _password, database, ...profile } = request
      void _password
      // One connection per archive: reconnecting replaces it.
      for (const existing of this.connections.values())
        if (
          existing.database === database &&
          existing.profile.server === profile.server
        ) {
          this.connections.delete(existing.id)
          void existing.close()
        }
      const connection = new SctConnection({
        id: randomUUID(),
        profile,
        database,
        pool,
        archive: recordset[0].PartialReference ?? database,
        release,
      })
      this.connections.set(connection.id, connection)
      return connection.info()
    } catch (error) {
      await pool.close().catch(() => {})
      throw error
    }
  }

  async disconnect(id: string) {
    const connection = this.connections.get(id)
    if (!connection) return
    this.connections.delete(id)
    await connection.close()
  }
}

const KEY = "__lemscapeSctHub"
type Holder = typeof globalThis & { [KEY]?: SctHub }

/** One hub per server process (kept across hot reloads). */
export function getSctHub(): SctHub {
  const holder = globalThis as Holder
  const current = holder[KEY]
  if (!(current instanceof SctHub)) {
    const hub = new SctHub()
    if (current) hub.adopt(current)
    holder[KEY] = hub
  }
  return holder[KEY] as SctHub
}
