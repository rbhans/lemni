import "server-only"

import { randomUUID } from "node:crypto"

import { appendAudit } from "@/server/audit"
import { guardRequest } from "@/server/request-guard"

import type {
  ConnectRequest,
  LiveEvent,
  PointValue,
  PointWrite,
  WriteAction,
} from "../shared"
import { errorStatus, friendlyError } from "./errors"
import { getStationHub } from "./hub"

type Handler = (request: Request, path: string[]) => Promise<Response>

const json = (data: unknown, status = 200) => Response.json(data, { status })
const fail = (error: unknown) =>
  json({ error: friendlyError(error) }, errorStatus(error))
const bad = (message: string) => json({ error: message }, 400)

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

const isString = (value: unknown): value is string => typeof value === "string"
const isOrd = (value: unknown): value is string =>
  isString(value) && /^slot:\//.test(value) && value.length < 2000
const isStringArray = (value: unknown, max: number): value is string[] =>
  Array.isArray(value) && value.length <= max && value.every(isOrd)

function parseConnect(data: Record<string, unknown>): ConnectRequest | string {
  const { name, station, username, password, allowSelfSigned } = data
  if (!isString(station) || !station.trim()) return "Enter the station address."
  if (!isString(username) || !username.trim()) return "Enter a username."
  if (!isString(password) || !password) return "Enter the password."
  return {
    name: isString(name) ? name.slice(0, 120) : "",
    station: station.slice(0, 500),
    username: username.trim().slice(0, 200),
    password,
    allowSelfSigned: allowSelfSigned === true,
  }
}

/** Server-sent events: live values for one browser tab, plus connection status. */
function liveStream(
  request: Request,
  connectionId: string,
  sessionId: string
): Response {
  const hub = getStationHub()
  const connection = hub.get(connectionId)
  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let pending: PointValue[] = []
      let flushTimer: NodeJS.Timeout | null = null

      const send = (event: LiveEvent) => {
        if (closed) return
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      const flush = () => {
        flushTimer = null
        if (pending.length) send({ type: "values", points: pending })
        pending = []
      }
      const onValue = (value: PointValue) => {
        if (!connection.pointsFor(sessionId).has(value.point)) return
        pending.push(value)
        flushTimer ??= setTimeout(flush, 100)
      }
      const onStatus = (info: ReturnType<typeof connection.info>) =>
        send({ type: "status", connection: info })
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"))
      }, 15_000)

      connection.openStream(sessionId)
      connection.on("value", onValue)
      connection.on("status", onStatus)
      send({ type: "status", connection: connection.info() })

      cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        if (flushTimer) clearTimeout(flushTimer)
        connection.off("value", onValue)
        connection.off("status", onStatus)
        connection.closeStream(sessionId)
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }
      request.signal.addEventListener("abort", cleanup)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

const handleGet: Handler = async (request, path) => {
  const hub = getStationHub()
  const url = new URL(request.url)
  if (path.length === 0) return json({ connections: hub.list() })

  const [id, action] = path
  const connection = hub.get(id)
  switch (action) {
    case undefined:
      return json({ connection: connection.info() })
    case "browse":
      return json(
        await connection.browse(url.searchParams.get("ord") ?? "slot:/")
      )
    case "search": {
      const q = (url.searchParams.get("q") ?? "").trim()
      if (q.length < 2) return bad("Type at least two characters.")
      return json(await connection.search(q.slice(0, 200)))
    }
    case "describe": {
      const ord = url.searchParams.get("ord")
      if (!isOrd(ord)) return bad("Missing ord.")
      return json({ point: await connection.describe(ord) })
    }
    case "history": {
      const ord = url.searchParams.get("ord")
      if (!isOrd(ord)) return bad("Missing ord.")
      const param = (name: string) => {
        const value = Number(url.searchParams.get(name))
        return url.searchParams.has(name) && Number.isFinite(value)
          ? value
          : null
      }
      // Either an explicit window (start/end in ms) or the last `hours`.
      const end = param("end") ?? Date.now()
      const start = param("start") ?? end - (param("hours") ?? 24) * 3_600_000
      if (start >= end) return bad("The history window is empty.")
      return json({
        buckets: await connection.history(ord, {
          start,
          end,
          buckets: param("buckets") ?? 120,
        }),
      })
    }
    case "alarms":
      return json({ alarms: await connection.alarms() })
    case "live": {
      const session = url.searchParams.get("session")
      if (!session || !/^[\w-]{8,64}$/.test(session))
        return bad("Missing session.")
      return liveStream(request, id, session)
    }
    default:
      return json({ error: "Not found." }, 404)
  }
}

const MAX_WRITES = 50
const ACTIONS: WriteAction[] = ["set", "override", "auto"]

function parseWrites(value: unknown): PointWrite[] | string {
  if (!Array.isArray(value) || !value.length || value.length > MAX_WRITES)
    return `Send 1–${MAX_WRITES} writes.`
  const writes: PointWrite[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return "Each write must be an object."
    const {
      point,
      action,
      value: v,
      durationSec,
    } = raw as Record<string, unknown>
    if (!isOrd(point)) return "Each write needs a slot:/ point."
    if (!ACTIONS.includes(action as WriteAction))
      return `action must be one of ${ACTIONS.join(", ")}.`
    if (action === "auto") {
      if (v !== undefined || durationSec !== undefined)
        return "auto releases the override; it takes no value or duration."
      writes.push({ point, action })
      continue
    }
    const okValue =
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v)) ||
      (typeof v === "string" && v.length <= 200)
    if (!okValue) return `${point}: set and override need a value.`
    if (durationSec !== undefined) {
      if (action !== "override") return "Only an override can be timed."
      if (
        typeof durationSec !== "number" ||
        !Number.isInteger(durationSec) ||
        durationSec < 1 ||
        durationSec > 7 * 86_400
      )
        return "durationSec must be whole seconds, up to 7 days."
    }
    writes.push({
      point,
      action: action as WriteAction,
      value: v as PointWrite["value"],
      ...(durationSec !== undefined
        ? { durationSec: durationSec as number }
        : {}),
    })
  }
  return writes
}

/** Who asked and why, for the audit log. Changes must say they were confirmed. */
function attribution(data: Record<string, unknown>) {
  if (data.confirm !== true) return null
  return {
    requestedBy:
      typeof data.requestedBy === "string" && data.requestedBy.trim()
        ? data.requestedBy.slice(0, 160)
        : "Person",
    reason: typeof data.reason === "string" ? data.reason.slice(0, 2000) : "",
  }
}

const handlePost: Handler = async (request, path) => {
  const hub = getStationHub()
  const data = await body(request)

  if (path.length === 0) {
    const parsed = parseConnect(data)
    if (typeof parsed === "string") return bad(parsed)
    return json({ connection: await hub.connect(parsed) })
  }

  const [id, action] = path
  const connection = hub.get(id)
  switch (action) {
    case "read":
      if (!isStringArray(data.points, 1000))
        return bad("points must be a list of slot:/ ORDs.")
      return json({ points: await connection.read(data.points) })
    case "watch":
      if (!isString(data.session) || !/^[\w-]{8,64}$/.test(data.session))
        return bad("Missing session.")
      if (!isStringArray(data.points, 1000))
        return bad("points must be a list of slot:/ ORDs.")
      return json({
        points: await connection.setSessionPoints(data.session, data.points),
      })
    case "describe-write":
      if (!isStringArray(data.points, MAX_WRITES))
        return bad("points must be a list of slot:/ ORDs.")
      return json({ points: await connection.describeWrite(data.points) })
    case "write": {
      const who = attribution(data)
      if (!who) return bad("Writes must be confirmed.")
      const writes = parseWrites(data.writes)
      if (typeof writes === "string") return bad(writes)
      const info = connection.info()
      if (!info.writesEnabled)
        return json({ error: "Writes are turned off on this station." }, 403)
      const base = {
        id: randomUUID(),
        kind: "point-write",
        target: info.station,
        account: info.username,
        ...who,
      }
      // Logged before sending: if the log can't be written, nothing is sent.
      await appendAudit({
        ...base,
        at: new Date().toISOString(),
        stage: "attempt",
        items: writes,
      })
      const results = await connection.write(writes)
      const failed = results.filter((r) => !r.ok).length
      await appendAudit({
        ...base,
        at: new Date().toISOString(),
        stage: "outcome",
        items: results.map(({ point, ok, error, after }) => ({
          point,
          ok,
          error,
          value: after?.display,
          status: after?.status,
        })),
        outcome: !failed
          ? "succeeded"
          : failed === results.length
            ? "failed"
            : "partial",
      }).catch(() => {})
      return json({ results })
    }
    case "ack-alarms": {
      const who = attribution(data)
      if (!who) return bad("Acknowledgements must be confirmed.")
      const uuids = data.uuids
      if (
        !Array.isArray(uuids) ||
        !uuids.length ||
        uuids.length > MAX_WRITES ||
        !uuids.every((u) => isString(u) && u.length <= 200)
      )
        return bad(`uuids must be 1–${MAX_WRITES} alarm ids.`)
      const info = connection.info()
      const base = {
        id: randomUUID(),
        kind: "alarm-ack",
        target: info.station,
        account: info.username,
        ...who,
      }
      await appendAudit({
        ...base,
        at: new Date().toISOString(),
        stage: "attempt",
        items: uuids,
      })
      try {
        await connection.ackAlarms(uuids as string[])
      } catch (error) {
        await appendAudit({
          ...base,
          at: new Date().toISOString(),
          stage: "outcome",
          items: uuids,
          outcome: "failed",
          error: friendlyError(error),
        }).catch(() => {})
        throw error
      }
      await appendAudit({
        ...base,
        at: new Date().toISOString(),
        stage: "outcome",
        items: uuids,
        outcome: "succeeded",
      }).catch(() => {})
      return json({ ok: true })
    }
    default:
      return json({ error: "Not found." }, 404)
  }
}

const handleDelete: Handler = async (_request, path) => {
  if (path.length !== 1) return json({ error: "Not found." }, 404)
  await getStationHub().disconnect(path[0])
  return json({ ok: true })
}

const HANDLERS: Record<string, Handler> = {
  GET: handleGet,
  POST: handlePost,
  DELETE: handleDelete,
}

/** Entry point for app/api/stations/[[...path]]. */
export async function handleStationsRequest(
  request: Request,
  path: string[] = []
): Promise<Response> {
  const denied = guardRequest(request)
  if (denied) return denied
  const handler = HANDLERS[request.method]
  if (!handler) return json({ error: "Method not allowed." }, 405)
  try {
    return await handler(request, path)
  } catch (error) {
    return fail(error)
  }
}
