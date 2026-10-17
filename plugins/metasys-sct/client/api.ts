import type {
  SctConnectionInfo,
  SctNode,
  SctPointDetail,
  SctPointValue,
  SctServerProfile,
} from "../shared"

const BASE = "/api/sct"

export class SctApiError extends Error {
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
    throw new SctApiError(
      data.error ?? `Request failed (${response.status}).`,
      response.status
    )
  return data
}

const enc = encodeURIComponent

export const sctApi = {
  list: () => request<{ connections: SctConnectionInfo[] }>(""),
  /** Archive databases on a server (the password is used once, not kept). */
  archives: (profile: SctServerProfile, password: string) =>
    request<{ archives: string[] }>("/archives", {
      method: "POST",
      body: JSON.stringify({ ...profile, password }),
    }),
  connect: (profile: SctServerProfile, password: string, database: string) =>
    request<{ connection: SctConnectionInfo }>("", {
      method: "POST",
      body: JSON.stringify({ ...profile, password, database }),
    }),
  disconnect: (id: string) =>
    request<{ ok: true }>(`/${id}`, { method: "DELETE" }),
  children: (id: string, parent: number | null) =>
    request<{ nodes: SctNode[] }>(
      `/${id}/children${parent === null ? "" : `?parent=${parent}`}`
    ),
  search: (id: string, q: string) =>
    request<{ nodes: SctNode[] }>(`/${id}/search?q=${enc(q)}`),
  describe: (id: string, fqr: string) =>
    request<{ point: SctPointDetail | null }>(
      `/${id}/describe?fqr=${enc(fqr)}`
    ),
  under: (id: string, item: number, limit: number) =>
    request<{ nodes: SctNode[] }>(`/${id}/under?item=${item}&limit=${limit}`),
  values: (id: string, fqrs: string[]) =>
    request<{ values: SctPointValue[] }>(`/${id}/values`, {
      method: "POST",
      body: JSON.stringify({ fqrs }),
    }),
}
