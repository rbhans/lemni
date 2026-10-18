import "server-only"

import { isDatabaseName } from "../model"
import type { SctConnectRequest, SctServerProfile } from "../shared"
import { friendlySqlError, getSctHub } from "./hub"

// /api/plugins/metasys-sct/…: connect to SQL Server, list archives, browse the network
// tree, search, describe points and read their stored values. Read only.

const json = (data: unknown, status = 200) => Response.json(data, { status })
const bad = (message: string) => json({ error: message }, 400)
const fail = (error: unknown) => {
  const status = (error as { status?: number })?.status
  return json(
    { error: friendlySqlError(error) },
    status && status >= 400 ? status : 502
  )
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json()
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

const isString = (v: unknown): v is string => typeof v === "string"

function parseServer(
  data: Record<string, unknown>
): (SctServerProfile & { password: string }) | string {
  const { server, port, username, password, trustCertificate } = data
  if (!isString(server) || !server.trim() || server.length > 255)
    return "Enter the SQL Server address."
  const p = typeof port === "number" ? port : Number(port)
  if (!Number.isInteger(p) || p < 1 || p > 65535)
    return "Enter a port from 1 to 65535."
  if (!isString(username) || !username.trim()) return "Enter a username."
  if (!isString(password) || !password) return "Enter the password."
  return {
    server: server.trim(),
    port: p,
    username: username.trim().slice(0, 128),
    password,
    trustCertificate: trustCertificate === true,
  }
}

const isFqr = (v: unknown): v is string =>
  isString(v) && v.length > 0 && v.length < 2000

export async function handleSctRequest(
  request: Request,
  path: string[]
): Promise<Response> {
  const hub = getSctHub()
  try {
    if (request.method === "GET") {
      if (path.length === 0) return json({ connections: hub.list() })
      const [id, action] = path
      const connection = hub.get(id)
      const url = new URL(request.url)
      if (action === "children") {
        const parent = url.searchParams.get("parent")
        const parentId =
          parent === null || parent === "" ? null : Number(parent)
        if (parentId !== null && !Number.isInteger(parentId))
          return bad("Bad parent.")
        return json({ nodes: await connection.children(parentId) })
      }
      if (action === "search") {
        const q = (url.searchParams.get("q") ?? "").trim()
        if (q.length < 2) return json({ nodes: [] })
        return json({ nodes: await connection.search(q.slice(0, 200)) })
      }
      if (action === "describe") {
        const fqr = url.searchParams.get("fqr")
        if (!isFqr(fqr)) return bad("Bad reference.")
        return json({ point: await connection.describe(fqr) })
      }
      if (action === "under") {
        const item = Number(url.searchParams.get("item"))
        const limit = Number(url.searchParams.get("limit") ?? 300)
        if (!Number.isInteger(item)) return bad("Bad item.")
        return json({ nodes: await connection.pointsUnder(item, limit) })
      }
      return json({ error: "Not found." }, 404)
    }

    if (request.method === "POST") {
      const data = await body(request)
      if (path[0] === "archives") {
        const server = parseServer(data)
        if (isString(server)) return bad(server)
        const { password, ...profile } = server
        return json({ archives: await hub.listArchives(profile, password) })
      }
      if (path.length === 0) {
        const server = parseServer(data)
        if (isString(server)) return bad(server)
        const database = data.database
        if (!isString(database) || !isDatabaseName(database))
          return bad("Choose an archive database.")
        const connectRequest: SctConnectRequest = { ...server, database }
        return json({ connection: await hub.connect(connectRequest) })
      }
      const [id, action] = path
      const connection = hub.get(id)
      if (action === "values") {
        const fqrs = data.fqrs
        if (!Array.isArray(fqrs) || fqrs.length > 300 || !fqrs.every(isFqr))
          return bad("Send up to 300 references.")
        return json({ values: await connection.values(fqrs) })
      }
      return json({ error: "Not found." }, 404)
    }

    if (request.method === "DELETE" && path.length === 1) {
      await hub.disconnect(path[0])
      return json({ ok: true })
    }
    return json({ error: "Not found." }, 404)
  } catch (error) {
    return fail(error)
  }
}
