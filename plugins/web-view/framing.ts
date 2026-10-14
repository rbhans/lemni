// Whether a site lets another page show it in a frame, from its response headers.
// Pure (no React, no DOM, relative imports only) so `node --test` can run it.

export interface FramingVerdict {
  /** False when the browser will refuse to show the page in a web view. */
  allowed: boolean
  /** The header that decided, for people who manage the site. */
  reason: string | null
}

/** Does a CSP source expression (from frame-ancestors) match the embedding page? */
function sourceMatches(source: string, embedder: URL, target: URL) {
  const s = source.toLowerCase()
  if (s === "*") return true
  if (s === "'self'") return embedder.origin === target.origin
  if (s === "'none'") return false
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return embedder.protocol === s
  const match =
    /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?/.exec(s)
  if (!match) return false
  const [, scheme, wildcard, host, port] = match
  if (scheme && `${scheme}:` !== embedder.protocol) return false
  const embedderHost = embedder.hostname.toLowerCase()
  const hostOk = wildcard
    ? embedderHost.endsWith(`.${host}`)
    : embedderHost === host
  if (!hostOk) return false
  if (!port || port === "*") return true
  const embedderPort =
    embedder.port || (embedder.protocol === "https:" ? "443" : "80")
  return port === embedderPort
}

/**
 * Reads `Content-Security-Policy: frame-ancestors` (which wins when present) and
 * `X-Frame-Options`, the way browsers do.
 */
export function framingVerdict(
  headers: { xFrameOptions: string | null; csp: string | null },
  embedderOrigin: string,
  targetUrl: string
): FramingVerdict {
  const embedder = new URL(embedderOrigin)
  const target = new URL(targetUrl)
  for (const policy of (headers.csp ?? "").split(",")) {
    const directive = policy
      .split(";")
      .map((d) => d.trim())
      .find((d) => /^frame-ancestors(\s|$)/i.test(d))
    if (!directive) continue
    const sources = directive.split(/\s+/).slice(1)
    const allowed = sources.some((s) => sourceMatches(s, embedder, target))
    if (!allowed)
      return { allowed: false, reason: `Content-Security-Policy: ${directive}` }
  }
  if (headers.csp && /frame-ancestors/i.test(headers.csp))
    return { allowed: true, reason: null }

  const xfo = headers.xFrameOptions?.split(",")[0]?.trim().toUpperCase() ?? ""
  if (xfo === "DENY") return { allowed: false, reason: "X-Frame-Options: DENY" }
  if (xfo === "SAMEORIGIN" && embedder.origin !== target.origin)
    return { allowed: false, reason: "X-Frame-Options: SAMEORIGIN" }
  return { allowed: true, reason: null }
}
