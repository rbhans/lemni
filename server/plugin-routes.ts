// Plugin server routes: the types a plugin's `server/routes.ts` uses, and the matcher
// the dispatcher (server/plugin-dispatch.ts) runs. Pure (no Next, no server-only, no
// path aliases) so `node --test` can run it.
//
// A plugin's routes are served at /api/plugins/<id>/…, behind the request guard (local
// addresses, same origin, JSON bodies for writes), so handlers don't check that.

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface PluginRequest {
  request: Request
  pluginId: string
  /** The path after /api/plugins/<id>/, split on "/". */
  path: string[]
  /** Named parts of the route: ":id" segments, and a final "*rest" joined with "/". */
  params: Record<string, string>
  query: URLSearchParams
  /** The JSON body; a body that isn't JSON answers 400 for you. */
  json<T = unknown>(): Promise<T>
}

export type PluginRouteHandler = (
  request: PluginRequest
) => Response | Promise<Response>

/**
 * Routes by "METHOD /path": the method is GET, POST, PUT, PATCH, DELETE or * (any);
 * the path has literal segments, ":name" segments and optionally a last "*name" that
 * takes the rest (none or more). "/" is the plugin's root. The first match in order
 * wins.
 */
export type PluginRoutes = Readonly<Record<string, PluginRouteHandler>>

/**
 * Declares a plugin's routes; `plugins/<id>/server/routes.ts` default-exports one.
 *
 * ```ts
 * export default definePluginRoutes({
 *   "GET /sites": async () => Response.json({ sites: await listSites() }),
 *   "GET /sites/:id": async ({ params }) => Response.json(await getSite(params.id)),
 *   "POST /sites": async ({ json }) => Response.json(await addSite(await json())),
 * })
 * ```
 */
export function definePluginRoutes<R extends PluginRoutes>(routes: R): R {
  return routes
}

/** Thrown from a handler to answer with a status and message, e.g. 404 "No such site." */
export class PluginRouteError extends Error {
  // A plain field, not a parameter property, so `node --test` can strip the types.
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Segment =
  | { kind: "literal"; value: string }
  | { kind: "param"; name: string }
  | { kind: "rest"; name: string }

export interface CompiledRoute {
  key: string
  method: HttpMethod | "*"
  segments: Segment[]
  handler: PluginRouteHandler
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "*"])
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Checks and prepares a plugin's routes; throws a sentence naming the bad route. */
export function compileRoutes(
  pluginId: string,
  routes: PluginRoutes
): CompiledRoute[] {
  return Object.entries(routes).map(([key, handler]) => {
    const fail = (why: string): never => {
      throw new Error(`Plugin "${pluginId}" route "${key}": ${why}`)
    }
    const [method, path, extra] = key.trim().split(/\s+/)
    if (extra !== undefined || !path) fail('write it as "METHOD /path"')
    if (!METHODS.has(method))
      fail("the method must be GET, POST, PUT, PATCH, DELETE or *")
    if (!path.startsWith("/")) fail('the path must start with "/"')
    if (typeof handler !== "function") fail("the handler must be a function")
    const parts = path.split("/").filter(Boolean)
    const segments = parts.map((part, i): Segment => {
      if (part.startsWith(":")) {
        if (!NAME.test(part.slice(1))) fail(`"${part}" isn't a valid name`)
        return { kind: "param", name: part.slice(1) }
      }
      if (part.startsWith("*")) {
        if (i !== parts.length - 1) fail('"*rest" must be the last segment')
        if (!NAME.test(part.slice(1))) fail(`"${part}" isn't a valid name`)
        return { kind: "rest", name: part.slice(1) }
      }
      return { kind: "literal", value: part }
    })
    return { key, method: method as HttpMethod | "*", segments, handler }
  })
}

function matchPath(
  segments: Segment[],
  path: string[]
): Record<string, string> | null {
  const params: Record<string, string> = {}
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment.kind === "rest") {
      params[segment.name] = path.slice(i).join("/")
      return params
    }
    if (i >= path.length) return null
    if (segment.kind === "literal" && segment.value !== path[i]) return null
    if (segment.kind === "param") params[segment.name] = path[i]
  }
  return segments.length === path.length ? params : null
}

export type RouteMatch =
  | { kind: "found"; route: CompiledRoute; params: Record<string, string> }
  /** The path exists, but not for this method; `allow` lists the ones that do. */
  | { kind: "method"; allow: string[] }
  | { kind: "none" }

export function matchRoute(
  routes: CompiledRoute[],
  method: string,
  path: string[]
): RouteMatch {
  const allow = new Set<string>()
  for (const route of routes) {
    const params = matchPath(route.segments, path)
    if (!params) continue
    if (route.method === "*" || route.method === method)
      return { kind: "found", route, params }
    allow.add(route.method)
  }
  return allow.size ? { kind: "method", allow: [...allow] } : { kind: "none" }
}
