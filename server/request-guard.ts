import "server-only"

// Lemscape's API talks to building systems, so it only answers the local browser app:
// loopback hosts by default (DNS-rebinding protection), same-origin requests only
// (CSRF protection), and JSON bodies for writes (no simple-form posts).

const DEFAULT_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"]

function allowedHosts(): string[] {
  const extra =
    (
      process.env.LEMSCAPE_ALLOWED_HOSTS ??
      process.env.LEMNI_ALLOWED_HOSTS ??
      process.env.BASBOARD_ALLOWED_HOSTS
    )
      ?.split(",")
      .map((h) => h.trim().toLowerCase()) ?? []
  return [...DEFAULT_HOSTS, ...extra.filter(Boolean)]
}

function hostnameOf(host: string): string {
  const trimmed = host.trim().toLowerCase()
  if (trimmed.startsWith("[")) return trimmed.slice(0, trimmed.indexOf("]") + 1)
  return trimmed.split(":")[0]
}

const deny = (message: string) =>
  Response.json({ error: message }, { status: 403 })

/**
 * Host and Origin checks shared by every API: a local address (DNS-rebinding
 * protection) and, when a browser sends an Origin, the same origin.
 */
export function guardHost(request: Request): Response | null {
  const host = request.headers.get("host") ?? ""
  if (!allowedHosts().includes(hostnameOf(host))) {
    return deny(
      "This API only answers requests to a local address. Set LEMSCAPE_ALLOWED_HOSTS to allow others."
    )
  }

  const origin = request.headers.get("origin")
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase())
        return deny("Cross-origin requests are not allowed.")
    } catch {
      return deny("Invalid origin.")
    }
  }
  return null
}

/** Returns a response to send instead, or null when the request may proceed. */
export function guardRequest(request: Request): Response | null {
  const denied = guardHost(request)
  if (denied) return denied

  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none")
    return deny("Cross-site requests are not allowed.")

  if (request.method !== "GET" && request.method !== "HEAD") {
    const type = request.headers.get("content-type") ?? ""
    if (request.method !== "DELETE" && !type.includes("application/json")) {
      return Response.json({ error: "Send JSON." }, { status: 415 })
    }
  }

  return null
}
