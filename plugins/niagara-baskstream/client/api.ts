import { pluginApi } from "@/sdk"

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

const api = pluginApi("niagara-baskstream")

const enc = encodeURIComponent

export const stationApi = {
  list: () => api.get<{ connections: ConnectionInfo[] }>(""),
  get: (id: string) => api.get<{ connection: ConnectionInfo }>(`/${id}`),
  connect: (body: ConnectRequest) =>
    api.post<{ connection: ConnectionInfo }>("", body),
  disconnect: (id: string) => api.delete<{ ok: true }>(`/${id}`),
  browse: (id: string, ord: string) =>
    api.get<{ node: StationNode; children: StationNode[] }>(
      `/${id}/browse?ord=${enc(ord)}`
    ),
  search: (id: string, q: string) =>
    api.get<{ nodes: StationNode[]; truncated: boolean }>(
      `/${id}/search?q=${enc(q)}`
    ),
  describe: (id: string, ord: string) =>
    api.get<{ point: PointDetails }>(`/${id}/describe?ord=${enc(ord)}`),
  history: (id: string, ord: string, hours = 24) =>
    api.get<{ buckets: HistoryBucket[] }>(
      `/${id}/history?ord=${enc(ord)}&hours=${hours}`
    ),
  historyWindow: (
    id: string,
    ord: string,
    window: { start: number; end: number; buckets: number }
  ) =>
    api.get<{ buckets: HistoryBucket[] }>(
      `/${id}/history?ord=${enc(ord)}&start=${Math.round(window.start)}&end=${Math.round(window.end)}&buckets=${Math.round(window.buckets)}`
    ),
  alarms: (id: string) => api.get<{ alarms: StationAlarm[] }>(`/${id}/alarms`),
  watch: (id: string, session: string, points: string[]) =>
    api.post<{ points: PointValue[] }>(`/${id}/watch`, { session, points }),
  liveUrl: (id: string, session: string) =>
    api.url(`/${id}/live?session=${enc(session)}`),
  read: (id: string, points: string[]) =>
    api.post<{ points: PointValue[] }>(`/${id}/read`, { points }),
  describeWrite: (id: string, points: string[]) =>
    api.post<{ points: WriteInfo[] }>(`/${id}/describe-write`, { points }),
  /** Only after the person approved it. `requestedBy` and `reason` go to the audit log. */
  write: (
    id: string,
    writes: PointWrite[],
    who: { requestedBy: string; reason: string }
  ) =>
    api.post<{ results: WriteResult[] }>(`/${id}/write`, {
      writes,
      ...who,
      confirm: true,
    }),
  ackAlarms: (
    id: string,
    uuids: string[],
    who: { requestedBy: string; reason: string }
  ) =>
    api.post<{ ok: true }>(`/${id}/ack-alarms`, {
      uuids,
      ...who,
      confirm: true,
    }),
}
