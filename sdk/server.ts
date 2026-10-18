import "server-only"

// The plugin SDK for server code (`plugins/<id>/server/*`). A plugin's
// `server/routes.ts` default-exports its routes; they're served at
// /api/plugins/<id>/… behind the request guard. See docs/PLUGINS.md → Server routes.
//
// Server files import only from here, never `@/sdk` (that one is the browser side and
// brings React with it).

/** The pure helpers (AI input checks, navigation targets), same as `sdk/core.ts`. */
export * from "./core"

export {
  definePluginRoutes,
  PluginRouteError,
  type HttpMethod,
  type PluginRequest,
  type PluginRouteHandler,
  type PluginRoutes,
} from "@/server/plugin-routes"

/** A plugin's own files on this machine, in `.lemscape/plugins/<id>/`. */
export { pluginDataPath } from "@/server/plugin-data"

/**
 * The audit log: every write to an outside system is logged before it's sent (no log,
 * no write). Shown in the AI panel and kept in `.lemscape/audit.log`.
 */
export { appendAudit, readAudit, type AuditEntry } from "@/server/audit"

/** The studio's shared files (the audit log, the AI connection token). */
export { localDataPath } from "@/server/local-data"

/**
 * For connect probes: GETs a path at an address someone typed (https, then http, when
 * no scheme was given), reporting an untrusted certificate instead of failing.
 */
export {
  probeHttp,
  type HttpProbe,
  type HttpProbeAnswer,
  type HttpProbeOptions,
} from "@/server/http-probe"

/**
 * The host check (local addresses, same origin) for endpoints that live outside
 * /api/plugins because outside clients call them with their own credentials, like
 * the MCP endpoint. Plugin routes get the full guard automatically.
 */
export { guardHost } from "@/server/request-guard"
