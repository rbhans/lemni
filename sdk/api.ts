// Talking to a plugin's own server routes (`plugins/<id>/server/routes.ts`), which are
// served at /api/plugins/<id>/… behind the studio's request guard.

/** A request to a plugin route that failed; `message` is the server's `error` text. */
export class PluginApiError extends Error {
  /** The HTTP status, e.g. 404 when the server no longer knows the thing asked for. */
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** The address of a plugin route: `pluginApiUrl("my-plugin", "/sites?limit=5")`. */
export function pluginApiUrl(pluginId: string, path = ""): string {
  const rest =
    path && !path.startsWith("/") && !path.startsWith("?") ? `/${path}` : path
  return `/api/plugins/${pluginId}${rest}`
}

/**
 * A small JSON client for one plugin's routes. Bodies are sent as JSON (the request
 * guard requires it for writes); a failed request throws a `PluginApiError`.
 *
 * ```ts
 * const api = pluginApi("my-plugin")
 * const { sites } = await api.get<{ sites: Site[] }>("/sites")
 * await api.post("/sites", { name: "Plant" })
 * ```
 */
export function pluginApi(pluginId: string) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(pluginApiUrl(pluginId, path), {
      ...init,
      headers: init?.body
        ? { "content-type": "application/json", ...init.headers }
        : init?.headers,
    })
    const data = (await response.json().catch(() => ({}))) as T & {
      error?: string
    }
    if (!response.ok)
      throw new PluginApiError(
        data.error ?? `Request failed (${response.status}).`,
        response.status
      )
    return data
  }
  return {
    /** The full address of a route, for EventSource and links. */
    url: (path = "") => pluginApiUrl(pluginId, path),
    request,
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    put: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  }
}
