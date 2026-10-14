#!/usr/bin/env node
// A small simulated Niagara station speaking the baskStream API, for developing without
// hardware. It implements Niagara's SCRAM-SHA-256 login, /stream/health and the /stream
// WebSocket (MessagePack) with browse, describe, search, read, leased subscriptions with
// COV pushes, history rollups, alarms, describe_write, point writes (set, override at
// priority 8 with an optional duration, auto) and alarm acknowledgement. Nothing here
// touches real equipment; SIM_WRITES=off makes it read only.
//
//   npm run sim                 # http://127.0.0.1:8710, login demo / demo-pass
//   SIM_PORT=9000 SIM_USER=me SIM_PASSWORD=pw npm run sim
//
// Modeled on test/fake-station.mjs from github.com/rbhans/bask-stream.

import crypto from "node:crypto"
import http from "node:http"
import { decode, encode } from "@msgpack/msgpack"
import { WebSocketServer } from "ws"

const PORT = Number(process.env.SIM_PORT ?? 8710)
const HOST = process.env.SIM_HOST ?? "127.0.0.1"
const USER = process.env.SIM_USER ?? "demo"
const PASSWORD = process.env.SIM_PASSWORD ?? "demo-pass"
const STATION_NAME = "Riverside ES (simulated)"
const WRITES = process.env.SIM_WRITES !== "off"

// ---- Station model -----------------------------------------------------------------------

/** @type {Map<string, any>} */
const nodes = new Map()
/** @type {Map<string, any>} point ord -> live state */
const points = new Map()

const HOUR = 3_600_000

function parentOf(ord) {
  const parent = ord.slice(0, ord.lastIndexOf("/"))
  return parent === "slot:" ? "slot:/" : parent
}

function folder(ord, name, typeSpec = "baja:Folder", extra = {}) {
  nodes.set(ord, { ord, slotPath: ord, name, display: name, typeSpec, kind: "container", status: "{ok}", ok: true, writable: false, features: [], operations: ["describe", "browse"], children: [], ...extra })
  const parent = parentOf(ord)
  if (ord !== "slot:/" && nodes.has(parent)) nodes.get(parent).children.push(ord)
}

function component(ord, name, typeSpec, extra = {}) {
  folder(ord, name, typeSpec, { kind: "component", ...extra })
}

/**
 * @param {string} ord
 * @param {{ type: "numeric" | "boolean" | "enum", display?: string, units?: string, precision?: number,
 *   value: any, noise?: number, writable?: boolean, status?: string, history?: (t: number) => number,
 *   trueText?: string, falseText?: string, options?: string[] }} spec
 */
function point(ord, spec) {
  const name = ord.slice(ord.lastIndexOf("/") + 1)
  const typeSpec = {
    numeric: spec.writable ? "control:NumericWritable" : "control:NumericPoint",
    boolean: spec.writable ? "control:BooleanWritable" : "control:BooleanPoint",
    enum: spec.writable ? "control:EnumWritable" : "control:EnumPoint",
  }[spec.type]
  const hasHistory = spec.type !== "enum"
  folder(ord, name, typeSpec, {
    kind: "point",
    display: spec.display ?? name,
    writable: Boolean(spec.writable),
    features: hasHistory ? ["point", "history"] : ["point"],
    operations: ["describe", "read", "subscribe", ...(hasHistory ? ["read_history"] : []), ...(spec.writable ? ["write"] : [])],
    hasChildren: false,
  })
  points.set(ord, { ...spec, base: spec.value, fallback: spec.value, status: spec.status ?? "{ok}", changedAt: Date.now() })
}

folder("slot:/", "station", "baja:Station", { display: STATION_NAME })
folder("slot:/Drivers", "Drivers", "driver:DriverContainer")
component("slot:/Drivers/BacnetNetwork", "BacnetNetwork", "bacnet:BacnetNetwork", { metadata: { classification: { isDriverNetwork: true } } })

const ahu = "slot:/Drivers/BacnetNetwork/AHU_1"
component(ahu, "AHU_1", "bacnet:BacnetDevice", { display: "AHU-1", metadata: { classification: { isDriverDevice: true, equipmentCertainty: "device" } } })
folder(`${ahu}/points`, "points", "bacnet:BacnetPointDeviceExt")
const warmAfternoon = (t) => {
  const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60
  if (hour < 6) return 61 + Math.sin(t / HOUR) * 0.4
  if (hour < 13) return 55.2 + Math.sin(t / (HOUR / 3)) * 0.3
  return Math.min(58.9, 55.2 + (hour - 13) * 1.4) + Math.sin(t / (HOUR / 4)) * 0.25
}
point(`${ahu}/points/DA-T`, { type: "numeric", display: "Discharge air temp", units: "°F", precision: 1, value: 58.4, noise: 0.15, history: warmAfternoon })
point(`${ahu}/points/DA-T-SP`, { type: "numeric", display: "Discharge air setpoint", units: "°F", precision: 1, value: 55, writable: true, history: () => 55 })
point(`${ahu}/points/SF-S`, { type: "boolean", display: "Supply fan status", value: true, trueText: "On", falseText: "Off", history: (t) => (new Date(t).getHours() >= 6 ? 1 : 0) })
point(`${ahu}/points/SF-C`, { type: "boolean", display: "Supply fan command", value: true, trueText: "On", falseText: "Off", writable: true, history: (t) => (new Date(t).getHours() >= 6 ? 1 : 0) })
point(`${ahu}/points/SF-VFD`, { type: "numeric", display: "Supply fan speed", units: "%", precision: 1, value: 72, noise: 1.2, writable: true, history: (t) => (new Date(t).getHours() >= 6 ? 70 + Math.sin(t / HOUR) * 4 : 0) })
point(`${ahu}/points/CHW-V`, { type: "numeric", display: "Chilled water valve", units: "%", precision: 0, value: 100, writable: true, history: (t) => (new Date(t).getHours() >= 12 ? 100 : 60 + Math.sin(t / HOUR) * 10) })
point(`${ahu}/points/HW-V`, { type: "numeric", display: "Hot water valve", units: "%", precision: 0, value: 0, writable: true, history: () => 0 })
point(`${ahu}/points/OA-D`, { type: "numeric", display: "Outside air damper", units: "%", precision: 1, value: 35, writable: true, status: "{overridden} @ 8", history: (t) => (new Date(t).getHours() >= 12 ? 35 : 15) })
point(`${ahu}/points/OA-T`, { type: "numeric", display: "Outside air temp", units: "°F", precision: 1, value: 88, noise: 0.2, history: (t) => 70 + 18 * Math.max(0, Math.sin(((new Date(t).getHours() - 6) / 24) * Math.PI * 2)) })
point(`${ahu}/points/SP`, { type: "numeric", display: "Duct static pressure", units: "in", precision: 2, value: 1.24, noise: 0.03, history: (t) => (new Date(t).getHours() >= 6 ? 1.25 : 0) })
point(`${ahu}/points/OCC-MODE`, { type: "enum", display: "Occupancy mode", value: "occupied", options: ["unoccupied", "occupied", "standby", "bypass"], writable: true })

for (let i = 1; i <= 5; i++) {
  const vav = `slot:/Drivers/BacnetNetwork/VAV_2_0${i}`
  component(vav, `VAV_2_0${i}`, "bacnet:BacnetDevice", { display: `VAV-2-0${i}`, metadata: { classification: { isDriverDevice: true } } })
  folder(`${vav}/points`, "points", "bacnet:BacnetPointDeviceExt")
  const hot = i === 2
  point(`${vav}/points/SpaceTemp`, { type: "numeric", display: "Space temp", units: "°F", precision: 1, value: hot ? 75.9 : 71.5 + i * 0.2, noise: 0.08, status: hot ? "{alarm}" : "{ok}", history: (t) => (hot ? 72 + Math.max(0, new Date(t).getHours() - 12) * 0.5 : 71.8) })
  point(`${vav}/points/SpaceTempSP`, { type: "numeric", display: "Space temp setpoint", units: "°F", precision: 1, value: i === 4 ? 70 : 72, writable: true, status: i === 4 ? "{overridden} @ 8" : "{ok}", history: () => 72 })
  point(`${vav}/points/DamperPos`, { type: "numeric", display: "Damper position", units: "%", precision: 0, value: hot ? 100 : 30 + i * 5, noise: hot ? 0 : 1.5, writable: true, history: () => 40 })
}

component("slot:/Drivers/ModbusNetwork", "ModbusNetwork", "modbusTcp:ModbusTcpNetwork")
component("slot:/Drivers/ModbusNetwork/Meter_1", "Meter_1", "modbusTcp:ModbusTcpDevice", { display: "Main meter" })
folder("slot:/Drivers/ModbusNetwork/Meter_1/points", "points", "modbusTcp:ModbusTcpPointDeviceExt")
point("slot:/Drivers/ModbusNetwork/Meter_1/points/kW", { type: "numeric", display: "Demand", units: "kW", precision: 1, value: 42, noise: 1.5, history: (t) => 30 + 15 * Math.max(0, Math.sin(((new Date(t).getHours() - 6) / 16) * Math.PI)) })
folder("slot:/Services", "Services", "baja:ServiceContainer")

for (const node of nodes.values()) if (node.kind !== "point") node.hasChildren = node.children.length > 0

// ---- Values ------------------------------------------------------------------------------

function round(value, precision) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function snapshot(ord) {
  const state = points.get(ord)
  const node = nodes.get(ord)
  if (!state) return { point: ord, ok: false, code: "not_found", message: `No point at ${ord}` }
  const base = { point: ord, ok: !/fault|down|stale|disabled/.test(state.status), display: node.display, status: state.status, timestamp: Date.now() }
  if (state.type === "numeric") {
    const value = round(state.value, state.precision ?? 1)
    return { ...base, valueType: "baja:Double", value, displayValue: `${value.toFixed(state.precision ?? 1)} ${state.units ?? ""}`.trim(), facets: { units: state.units ?? "", precision: String(state.precision ?? 1) } }
  }
  if (state.type === "boolean") {
    const text = state.value ? state.trueText : state.falseText
    return { ...base, valueType: "baja:Boolean", value: state.value, displayValue: text, enumTag: state.value ? "true" : "false", enumDisplay: text, facets: { trueText: state.trueText, falseText: state.falseText } }
  }
  const ordinal = state.options.indexOf(state.value)
  const display = state.value.replace(/^\w/, (c) => c.toUpperCase())
  return { ...base, valueType: "baja:DynamicEnum", value: state.value, displayValue: display, enumOrdinal: ordinal, enumTag: state.value, enumDisplay: display, enumOptions: state.options.map((tag, i) => ({ ordinal: i, tag, display: tag.replace(/^\w/, (c) => c.toUpperCase()) })) }
}

/** Nudges noisy points; returns the ords that changed. */
function tick() {
  const changed = []
  for (const [ord, state] of points) {
    if (!state.noise) continue
    const next = state.base + (Math.random() - 0.5) * 2 * state.noise
    if (round(next, state.precision ?? 1) !== round(state.value, state.precision ?? 1)) {
      state.value = next
      state.changedAt = Date.now()
      changed.push(ord)
    }
  }
  return changed
}

// ---- Protocol ----------------------------------------------------------------------------

const OPERATIONS = ["ping", "capabilities", "browse", "describe", "search", "read", "replace_subscriptions", "renew_subscriptions", "release_subscriptions", "subscription_status", "describe_write", "write", "describe_history", "read_history_rollup", "read_alarms", "ack_alarm", "ack_alarms"]

// ---- Writes (simulated priority 8 and fallback only) -----------------------------------------

/** Checks a value against the point's type; returns an error message or null. */
function badValue(state, value) {
  if (state.type === "numeric") return typeof value === "number" && Number.isFinite(value) ? null : "Send a number."
  if (state.type === "boolean") return typeof value === "boolean" ? null : "Send true or false."
  return state.options.includes(value) ? null : `Send one of: ${state.options.join(", ")}.`
}

function applyValue(state, value) {
  state.value = value
  if (state.type === "numeric") state.base = value
  state.changedAt = Date.now()
}

/** Applies one write; returns an error [code, message] or null. */
function writePoint(ord, action, value, durationSec) {
  const node = nodes.get(ord)
  const state = points.get(ord)
  if (!node || !state) return ["not_found", `No point at ${ord}`]
  if (!node.writable) return ["not_writable", `${node.display} isn't writable.`]
  if (!["set", "override", "auto"].includes(action)) return ["unsupported_action", `Unsupported action ${action}.`]
  clearTimeout(state.overrideTimer)
  if (action === "auto") {
    state.override = undefined
    state.status = "{ok}"
    applyValue(state, state.fallback)
    return null
  }
  const problem = badValue(state, value)
  if (problem) return ["invalid_value", problem]
  if (action === "set") {
    state.fallback = value
    if (state.override === undefined && !/@/.test(state.status)) applyValue(state, value)
    return null
  }
  state.override = value
  state.status = "{overridden} @ 8"
  applyValue(state, value)
  if (durationSec) {
    state.overrideTimer = setTimeout(() => {
      writePoint(ord, "auto")
      pushCov([ord])
    }, durationSec * 1000)
    state.overrideTimer.unref()
  }
  return null
}

function shallow(node) {
  const rest = { ...node }
  delete rest.children
  return rest
}

function describe(node) {
  const state = points.get(node.ord)
  const parentOrd = parentOf(node.ord)
  const metadata = {
    ...(node.metadata ?? {}),
    classification: {
      ...(node.metadata?.classification ?? {}),
      isControlPoint: node.kind === "point",
      isWritablePoint: Boolean(node.writable),
      hasHistory: node.features.includes("history"),
    },
    parent: nodes.has(parentOrd) ? { ord: parentOrd, name: nodes.get(parentOrd).name, display: nodes.get(parentOrd).display } : undefined,
  }
  if (state) metadata.point = { facets: snapshot(node.ord).facets ?? {}, activeLevel: /@ (\d+)/.exec(state.status)?.[1] ? Number(/@ (\d+)/.exec(state.status)[1]) : undefined }
  return { ...shallow(node), metadata }
}

const ALARMS = [
  { uuid: "sim-1", timestamp: Date.now() - 42 * 60_000, priority: 30, alarmClass: "Critical", sourceState: "offnormal", ackState: "unacked", sources: ["slot:/Drivers/BacnetNetwork/VAV_2_02/points/SpaceTemp"], data: { msgText: "Space temperature high (75.9 °F)" } },
  { uuid: "sim-2", timestamp: Date.now() - 2.5 * HOUR, priority: 120, alarmClass: "Default", sourceState: "offnormal", ackState: "unacked", sources: ["slot:/Drivers/BacnetNetwork/AHU_1/points/DA-T"], data: { msgText: "Discharge air above setpoint for 2 h" } },
  { uuid: "sim-3", timestamp: Date.now() - 20 * HOUR, priority: 200, alarmClass: "Maintenance", sourceState: "normal", ackState: "unacked", sources: ["slot:/Drivers/BacnetNetwork/AHU_1/points/SF-S"], data: { msgText: "Filter runtime exceeded" } },
]

function handle(ws, session, request) {
  const { op, id } = request
  const send = (frame) => ws.send(encode(frame))
  const fail = (code, message) => send({ op: "error", id, code, message })

  switch (op) {
    case "ping":
      return send({ op: "pong", id })
    case "capabilities":
      return send({
        op: "capabilities_result",
        id,
        capabilities: {
          apiVersion: "1.7",
          operations: OPERATIONS,
          writesEnabled: WRITES,
          modelEditing: { enabled: false },
          user: { username: USER },
          station: { name: STATION_NAME },
          limits: { heartbeatIntervalSec: 30, maxBrowseDepth: 4, maxSearchLimit: 5000, maxSubscriptionsPerClient: 500, subscriptionLeaseSec: 300, covBatchWindowMillis: 100 },
        },
      })
    case "browse": {
      const node = nodes.get(request.base ?? "slot:/")
      if (!node) return fail("not_found", `No component at ${request.base}`)
      return send({ op: "browse_result", id, depth: 1, node: { ...shallow(node), children: node.children.map((ord) => shallow(nodes.get(ord))) } })
    }
    case "describe": {
      const node = nodes.get(request.ord)
      if (!node) return fail("not_found", `No component at ${request.ord}`)
      return send({ op: "describe_result", id, node: describe(node) })
    }
    case "search": {
      const base = request.base ?? "slot:/"
      const query = String(request.query ?? "").toLowerCase()
      const limit = Math.min(Number(request.limit ?? 250), 5000)
      const matches = [...nodes.values()].filter(
        (node) =>
          node.ord.startsWith(base) &&
          node.ord !== base &&
          `${node.name} ${node.display} ${node.ord}`.toLowerCase().includes(query) &&
          (!request.features?.length || request.features.every((f) => node.features.includes(f)))
      )
      return send({ op: "search_result", id, result: { base, count: Math.min(matches.length, limit), truncated: matches.length > limit, truncatedReasons: matches.length > limit ? ["limit"] : [], nodes: matches.slice(0, limit).map(shallow) } })
    }
    case "read":
      return send({ op: "read_result", id, points: (request.points ?? []).map(snapshot) })
    case "replace_subscriptions":
      session.groups.set(request.group, new Set(request.points ?? []))
      return send({ op: "subscriptions_replaced", id, group: request.group, points: request.points, leaseSec: request.leaseSec })
    case "renew_subscriptions":
      if (!session.groups.has(request.group)) return fail("group_not_found", "Subscription group not found.")
      return send({ op: "subscriptions_renewed", id, group: request.group })
    case "release_subscriptions":
      session.groups.delete(request.group)
      return send({ op: "subscriptions_released", id, group: request.group })
    case "subscription_status":
      return send({ op: "subscription_status_result", id, session: { subscriptionGroups: session.groups.size, pointSubscriptions: [...session.groups.values()].reduce((n, set) => n + set.size, 0) }, groups: [] })
    case "describe_write":
      return send({
        op: "write_description",
        id,
        points: (request.points ?? []).map((ord) => {
          const node = nodes.get(ord)
          const state = points.get(ord)
          if (!node || !state) return { point: ord, ok: false, code: "not_found" }
          return { point: ord, writable: node.writable, valueKind: state.type, actions: node.writable ? ["set", "override", "auto"] : [], supportsDuration: node.writable, levels: [], ...(state.type === "enum" ? { enumOptions: state.options.map((tag, i) => ({ ordinal: i, tag })) } : {}) }
        }),
      })
    case "write": {
      if (!WRITES) return fail("writes_disabled", "Writes are disabled on this simulated station.")
      const error = writePoint(request.point, request.action, request.value, request.durationSec)
      if (error) return fail(...error)
      console.log(`write ${request.action} ${request.point}${request.value === undefined ? "" : ` = ${JSON.stringify(request.value)}`}${request.durationSec ? ` for ${request.durationSec}s` : ""}`)
      pushCov([request.point])
      return send({ op: "write_result", id, points: [snapshot(request.point)] })
    }
    case "ack_alarm":
    case "ack_alarms": {
      if (!WRITES) return fail("writes_disabled", "Writes are disabled on this simulated station.")
      const uuids = request.uuids ?? (request.uuid ? [request.uuid] : [])
      const matched = ALARMS.filter((alarm) => uuids.includes(alarm.uuid))
      if (!request.dryRun) for (const alarm of matched) alarm.ackState = "acked"
      if (!request.dryRun && matched.length) console.log(`ack ${matched.map((a) => a.uuid).join(", ")}`)
      return send({ op: "alarm_action_result", id, alarms: { count: matched.length, dryRun: Boolean(request.dryRun), alarms: matched } })
    }
    case "describe_history": {
      const node = nodes.get(request.ord)
      if (!node?.features.includes("history")) return send({ op: "history_description", id, history: { requestOrd: request.ord, count: 0, histories: [] } })
      return send({ op: "history_description", id, history: { requestOrd: request.ord, count: 1, histories: [{ historyOrd: `history:/Sim/${node.name}`, historyId: `Sim/${node.name}`, recordType: "history:NumericTrendRecord", totalCount: 20160, firstTimestamp: Date.now() - 7 * 24 * HOUR, lastTimestamp: Date.now() }] } })
    }
    case "read_history_rollup": {
      const state = points.get(request.ord)
      if (!state?.history) return fail("history_not_found", `No history for ${request.ord}`)
      const end = request.end ?? Date.now()
      const start = request.start ?? end - 24 * HOUR
      const interval = Math.max(1000, Number(request.interval))
      if ((end - start) / interval > 5000) return fail("invalid_request", "Too many buckets.")
      const buckets = []
      for (let t = start; t < end; t += interval) {
        const v = state.history(t) + (state.noise ? (Math.random() - 0.5) * state.noise : 0)
        buckets.push({ start: t, count: 4, min: v - (state.noise ?? 0), max: v + (state.noise ?? 0), sum: v * 4, avg: v, first: v, last: v })
      }
      return send({ op: "history_rollup_result", id, rollup: { interval, histories: [{ historyId: `Sim/${nodes.get(request.ord).name}`, buckets, bucketCount: buckets.length, truncated: false }] } })
    }
    case "read_alarms": {
      const scope = request.scope ?? "open"
      const list = ALARMS.filter((alarm) => scope === "all" || alarm.sourceState !== "normal" || alarm.ackState === "unacked")
      return send({ op: "alarms_result", id, alarms: { count: list.length, alarms: list } })
    }
    default:
      return fail("unsupported_op", `Unsupported op: ${op}`)
  }
}

// ---- HTTP, login and WebSocket -------------------------------------------------------------

const SALT = crypto.randomBytes(16)
const ITERATIONS = 4096
const salted = crypto.pbkdf2Sync(PASSWORD, SALT, ITERATIONS, 32, "sha256")
const hmac = (key, text) => crypto.createHmac("sha256", key).update(text).digest()
const sessions = new Set()
const scram = new Map()
const cookieOf = (req) => /JSESSIONID=([^;]+)/.exec(req.headers.cookie ?? "")?.[1]

const server = http.createServer(async (req, res) => {
  let body = ""
  for await (const chunk of req) body += chunk
  let sid = cookieOf(req)
  if (!sid) {
    sid = crypto.randomUUID()
    res.setHeader("Set-Cookie", `JSESSIONID=${sid}; Path=/; HttpOnly`)
  }
  if (req.url === "/stream/health") {
    if (!sessions.has(sid)) return void res.writeHead(302, { Location: "/prelogin" }).end()
    return void res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, apiVersion: "1.7" }))
  }
  if (req.url === "/prelogin") return void res.writeHead(200).end("<html>login</html>")
  if (req.url === "/login") return void res.writeHead(200).end('<form action="j_security_check">')
  if (req.url === "/j_security_check/" && req.method === "GET") {
    if (scram.get(sid)?.done) sessions.add(sid)
    return void res.writeHead(200).end("ok")
  }
  if (req.url === "/j_security_check/") {
    const params = new URLSearchParams(body.replace(/\+/g, "%2B"))
    if (params.get("action") === "sendClientFirstMessage") {
      const first = params.get("clientFirstMessage") ?? ""
      const bare = first.slice(3)
      const user = /n=([^,]+)/.exec(bare)?.[1]
      const clientNonce = /r=([^,]+)/.exec(bare)?.[1]
      if (user !== USER || !clientNonce) return void res.writeHead(403).end("e=unknown-user")
      const serverFirst = `r=${clientNonce}${crypto.randomBytes(12).toString("base64")},s=${SALT.toString("base64")},i=${ITERATIONS}`
      scram.set(sid, { bare, serverFirst })
      return void res.writeHead(200).end(serverFirst)
    }
    const pending = scram.get(sid)
    const final = params.get("clientFinalMessage") ?? ""
    if (!pending || !final.includes(",p=")) return void res.writeHead(403).end("e=invalid-proof")
    const withoutProof = final.slice(0, final.lastIndexOf(",p="))
    const proof = Buffer.from(final.slice(final.lastIndexOf(",p=") + 3), "base64")
    const auth = `${pending.bare},${pending.serverFirst},${withoutProof}`
    const clientKey = hmac(salted, "Client Key")
    const signature = hmac(crypto.createHash("sha256").update(clientKey).digest(), auth)
    const expected = Buffer.alloc(32)
    for (let i = 0; i < 32; i += 1) expected[i] = clientKey[i] ^ signature[i]
    if (proof.length !== 32 || !proof.equals(expected)) return void res.writeHead(403).end("e=invalid-proof")
    pending.done = true
    return void res.writeHead(200).end(`v=${hmac(hmac(salted, "Server Key"), auth).toString("base64")}`)
  }
  res.writeHead(404).end()
})

const sockets = new Map()
const wss = new WebSocketServer({ noServer: true })
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/stream" || !sessions.has(cookieOf(req))) {
    socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n")
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const session = { groups: new Map() }
    sockets.set(ws, session)
    ws.on("close", () => sockets.delete(ws))
    ws.on("message", (data) => {
      try {
        handle(ws, session, decode(data))
      } catch (error) {
        console.error("bad frame", error)
      }
    })
  })
})

let sequence = 0
function pushCov(changed) {
  for (const [ws, session] of sockets) {
    const watched = new Set([...session.groups.values()].flatMap((set) => [...set]))
    const mine = changed.filter((ord) => watched.has(ord))
    if (mine.length) ws.send(encode({ op: "cov", sequence: ++sequence, timestamp: Date.now(), batched: true, sourceEvents: mine.length, points: mine.map(snapshot) }))
  }
}

setInterval(() => {
  const changed = tick()
  if (changed.length) pushCov(changed)
}, 1000).unref()

server.listen(PORT, HOST, () => {
  console.log(`Simulated station "${STATION_NAME}" at http://${HOST}:${PORT}`)
  console.log(`Login: ${USER} / ${PASSWORD}  (override with SIM_USER / SIM_PASSWORD)`)
})
