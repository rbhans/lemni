import { pluginApi } from "@/sdk"

import type {
  SctConnectionInfo,
  SctNode,
  SctPointDetail,
  SctPointValue,
  SctServerProfile,
} from "../shared"

const api = pluginApi("metasys-sct")

const enc = encodeURIComponent

export const sctApi = {
  list: () => api.get<{ connections: SctConnectionInfo[] }>(""),
  /** Archive databases on a server (the password is used once, not kept). */
  archives: (profile: SctServerProfile, password: string) =>
    api.post<{ archives: string[] }>("/archives", { ...profile, password }),
  connect: (profile: SctServerProfile, password: string, database: string) =>
    api.post<{ connection: SctConnectionInfo }>("", {
      ...profile,
      password,
      database,
    }),
  disconnect: (id: string) => api.delete<{ ok: true }>(`/${id}`),
  children: (id: string, parent: number | null) =>
    api.get<{ nodes: SctNode[] }>(
      `/${id}/children${parent === null ? "" : `?parent=${parent}`}`
    ),
  search: (id: string, q: string) =>
    api.get<{ nodes: SctNode[] }>(`/${id}/search?q=${enc(q)}`),
  describe: (id: string, fqr: string) =>
    api.get<{ point: SctPointDetail | null }>(
      `/${id}/describe?fqr=${enc(fqr)}`
    ),
  under: (id: string, item: number, limit: number) =>
    api.get<{ nodes: SctNode[] }>(`/${id}/under?item=${item}&limit=${limit}`),
  values: (id: string, fqrs: string[]) =>
    api.post<{ values: SctPointValue[] }>(`/${id}/values`, { fqrs }),
}
