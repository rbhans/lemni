// Addresses people type or paste to reach a building system: "10.0.0.20",
// "station.local:8443", "https://10.0.0.20/ord?station:%7Cslot:/". Pure (no React, no
// DOM, relative imports only) so `node --test` can run it, and shared by the Connect
// dialog, pasted links and the server's connect checks.

export type ParsedAddress =
  | {
      ok: true
      /** The host name or IP, without the port ("10.0.0.20", "[fd00::1]"). */
      host: string
      /** The host with its port, when one was given ("10.0.0.20:8443"). */
      hostPort: string
      /** The scheme typed, or null when only a host was given. */
      scheme: "http" | "https" | null
      /** The whole address; https when no scheme was typed. */
      url: URL
    }
  | { ok: false; error: string }

const MAX_LENGTH = 500

/**
 * Reads an address someone typed. Only http and https are accepted; without a
 * scheme it's taken as a host (with an optional port and path). A login in the
 * address is refused, since connection forms ask for it separately.
 */
export function parseAddress(input: string): ParsedAddress {
  const text = input.trim()
  if (!text) return { ok: false, error: "Enter an address." }
  if (text.length > MAX_LENGTH)
    return { ok: false, error: "That address is too long." }
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)?.[1]?.toLowerCase()
  if (scheme && scheme !== "http" && scheme !== "https")
    return {
      ok: false,
      error: "Use an http:// or https:// address, or just the host name or IP.",
    }
  let url: URL
  try {
    url = new URL(scheme ? text : `https://${text}`)
  } catch {
    return { ok: false, error: "That doesn't look like an address." }
  }
  if (!url.hostname)
    return { ok: false, error: "That doesn't look like an address." }
  if (url.username || url.password)
    return {
      ok: false,
      error:
        "Leave the login out of the address; the connection form asks for it.",
    }
  return {
    ok: true,
    host: url.hostname,
    hostPort: url.host,
    scheme: (scheme as "http" | "https" | undefined) ?? null,
    url,
  }
}

function ipv4(host: string): number[] | null {
  const parts = host.split(".")
  if (parts.length !== 4) return null
  const bytes = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number(part) : -1
  )
  return bytes.every((b) => b >= 0 && b <= 255) ? bytes : null
}

/**
 * Whether a host is on a local or private network, where building systems live:
 * private and loopback IPs, link-local addresses, `localhost`, `.local`, `.lan`,
 * `.internal`, `.home.arpa` and single-label names.
 */
export function isPrivateHost(host: string): boolean {
  const name = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
  if (!name) return false
  const v4 = ipv4(name)
  if (v4) {
    const [a, b] = v4
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    )
  }
  if (name.includes(":"))
    return (
      name === "::1" ||
      /^f[cd][0-9a-f]{0,2}:/.test(name) ||
      /^fe[89ab][0-9a-f]?:/.test(name)
    )
  if (name === "localhost" || !name.includes(".")) return true
  return /\.(local|lan|internal|localdomain|home\.arpa)$/.test(name)
}
