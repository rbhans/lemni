import "server-only"

import { pluginRouteModules } from "@/plugins/server.generated"

import {
  compileRoutes,
  matchRoute,
  PluginRouteError,
  type CompiledRoute,
  type PluginRequest,
} from "./plugin-routes"
import { guardRequest } from "./request-guard"

// Serves /api/plugins/<id>/…: the request guard first (so a plugin can't forget it),
// then the plugin's own routes from plugins/<id>/server/routes.ts.

const compiled = new Map<string, Promise<CompiledRoute[]>>()

function routesOf(pluginId: string): Promise<CompiledRoute[]> | null {
  const load = pluginRouteModules[pluginId]
  if (!load) return null
  let routes = compiled.get(pluginId)
  if (!routes) {
    routes = load().then((module) => compileRoutes(pluginId, module.default))
    // A module that fails to load (or has a bad route) is retried on the next request.
    routes.catch(() => compiled.delete(pluginId))
    compiled.set(pluginId, routes)
  }
  return routes
}

const failure = (status: number, error: string, headers?: HeadersInit) =>
  Response.json({ error }, { status, headers })

export async function handlePluginRequest(
  request: Request,
  pluginId: string,
  path: string[]
): Promise<Response> {
  const denied = guardRequest(request)
  if (denied) return denied

  const loading = routesOf(pluginId)
  if (!loading)
    return failure(404, `No plugin "${pluginId}" has server routes.`)
  let routes: CompiledRoute[]
  try {
    routes = await loading
  } catch (error) {
    console.error(`[plugin:${pluginId}] routes failed to load`, error)
    return failure(
      500,
      error instanceof Error
        ? error.message
        : "The plugin's routes failed to load."
    )
  }

  const method = request.method === "HEAD" ? "GET" : request.method
  const match = matchRoute(routes, method, path)
  if (match.kind === "none")
    return failure(
      404,
      `"${pluginId}" has no route for ${method} /${path.join("/")}.`
    )
  if (match.kind === "method")
    return failure(
      405,
      `"${pluginId}" doesn't answer ${method} here (try ${match.allow.join(", ")}).`,
      { allow: match.allow.join(", ") }
    )

  const url = new URL(request.url)
  const context: PluginRequest = {
    request,
    pluginId,
    path,
    params: match.params,
    query: url.searchParams,
    async json<T>() {
      try {
        return (await request.json()) as T
      } catch {
        throw new PluginRouteError(400, "Send a JSON body.")
      }
    },
  }
  try {
    return await match.route.handler(context)
  } catch (error) {
    if (error instanceof PluginRouteError)
      return failure(error.status, error.message)
    console.error(`[plugin:${pluginId}] ${match.route.key} failed`, error)
    return failure(
      500,
      error instanceof Error ? error.message : "Something went wrong."
    )
  }
}
