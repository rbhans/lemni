import "server-only"

import { BaskStreamError } from "@basidekick/baskstream"

const TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
])

function codeOf(error: unknown): string {
  if (error instanceof BaskStreamError) return error.code
  const code =
    (error as { code?: unknown; cause?: { code?: unknown } })?.code ??
    (error as { cause?: { code?: unknown } })?.cause?.code
  return typeof code === "string" ? code : ""
}

/** A message a person can act on. Never includes credentials. */
export function friendlyError(error: unknown): string {
  const code = codeOf(error)
  const message = error instanceof Error ? error.message : String(error)

  if (code === "login_failed")
    return "Login failed. Check the username and password."
  if (code === "session_expired")
    return "The station session expired. Connect again."
  if (code === "timeout") return "The station didn't answer in time."
  if (code === "not_connected" || code === "connection_closed")
    return "The connection to the station is closed."
  if (code === "connection_not_found")
    return "That station connection is no longer open. Connect again."
  if (code === "invalid_request") return message
  if (TLS_CODES.has(code) || /self[- ]signed|certificate/i.test(message)) {
    return "The station's certificate isn't trusted. For a station with a self-signed certificate on a trusted network, turn on “Allow self-signed certificate”."
  }
  if (code === "ECONNREFUSED" || /ECONNREFUSED/.test(message))
    return "Couldn't reach the station: the connection was refused. Check the address and port."
  if (code === "ENOTFOUND" || /ENOTFOUND/.test(message))
    return "Couldn't find that station address."
  if (
    code === "ETIMEDOUT" ||
    code === "EHOSTUNREACH" ||
    /ETIMEDOUT|EHOSTUNREACH/.test(message)
  )
    return "Couldn't reach the station. Check the address and network."
  if (/HTTP 40[13]|refused the WebSocket/.test(message)) {
    return "The station refused the connection. Check that baskStream is installed and this user may use it."
  }
  if (error instanceof BaskStreamError) return message
  return "Something went wrong talking to the station."
}

export function errorStatus(error: unknown): number {
  const code = codeOf(error)
  if (code === "connection_not_found") return 404
  if (code === "invalid_request") return 400
  if (code === "login_failed") return 401
  if (code === "forbidden" || code === "permission_denied") return 403
  return 502
}
