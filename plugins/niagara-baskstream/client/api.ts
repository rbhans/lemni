import type {
  ConnectionInfo,
  ConnectRequest,
  HistoryBucket,
  PointDetails,
  PointValue,
  PointWrite,
  StationAlarm,
  StationNode,
  WriteInfo,
  WriteResult,
} from "../shared"

const BASE = "/api/stations"

export class StationApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  })
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string
  }
  if (!response.ok)
    throw new StationApiError(
      data.error ?? `Request failed (${response.status}).`,
      response.status
    )
  return data
}

const enc = encodeURIComponent

export const stationApi = {
  list: () => request<{ connections: ConnectionInfo[] }>(""),
  get: (id: string) => request<{ connection: ConnectionInfo }>(`/${id}`),
  connect: (body: ConnectRequest) =>
    request<{ connection: ConnectionInfo }>("", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  disconnect: (id: string) =>
    request<{ ok: true }>(`/${id}`, { method: "DELETE" }),
  browse: (id: string, ord: string) =>
    request<{ node: StationNode; children: StationNode[] }>(
      `/${id}/browse?ord=${enc(ord)}`
    ),
  search: (id: string, q: string) =>
    request<{ nodes: StationNode[]; truncated: boolean }>(
      `/${id}/search?q=${enc(q)}`
    ),
  describe: (id: string, ord: string) =>
    request<{ point: PointDetails }>(`/${id}/describe?ord=${enc(ord)}`),
  history: (id: string, ord: string, hours = 24) =>
    request<{ buckets: HistoryBucket[] }>(
      `/${id}/history?ord=${enc(ord)}&hours=${hours}`
    ),
  historyWindow: (
    id: string,
    ord: string,
    window: { start: number; end: number; buckets: number }
  ) =>
    request<{ buckets: HistoryBucket[] }>(
      `/${id}/history?ord=${enc(ord)}&start=${Math.round(window.start)}&end=${Math.round(window.end)}&buckets=${Math.round(window.buckets)}`
    ),
  alarms: (id: string) => request<{ alarms: StationAlarm[] }>(`/${id}/alarms`),
  watch: (id: string, session: string, points: string[]) =>
    request<{ points: PointValue[] }>(`/${id}/watch`, {
      method: "POST",
      body: JSON.stringify({ session, points }),
    }),
  liveUrl: (id: string, session: string) =>
    `${BASE}/${id}/live?session=${enc(session)}`,
  read: (id: string, points: string[]) =>
    request<{ points: PointValue[] }>(`/${id}/read`, {
      method: "POST",
      body: JSON.stringify({ points }),
    }),
  describeWrite: (id: string, points: string[]) =>
    request<{ points: WriteInfo[] }>(`/${id}/describe-write`, {
      method: "POST",
      body: JSON.stringify({ points }),
    }),
  /** Only after the person approved it. `requestedBy` and `reason` go to the audit log. */
  write: (
    id: string,
    writes: PointWrite[],
    who: { requestedBy: string; reason: string }
  ) =>
    request<{ results: WriteResult[] }>(`/${id}/write`, {
      method: "POST",
      body: JSON.stringify({ writes, ...who, confirm: true }),
    }),
  ackAlarms: (
    id: string,
    uuids: string[],
    who: { requestedBy: string; reason: string }
  ) =>
    request<{ ok: true }>(`/${id}/ack-alarms`, {
      method: "POST",
      body: JSON.stringify({ uuids, ...who, confirm: true }),
    }),
}
