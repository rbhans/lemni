// Recognizing a Niagara station from what its web server says before anyone signs in,
// for Connect…. Pure (no React, no DOM, relative imports only) so `node --test` can
// run it; the server's probe route and the browser's pasted-link check share it.

import { isPrivateHost } from "../../sdk/core.ts"

export interface ProbeAnswer {
  status: number
  /** Header names in lower case. */
  headers: Record<string, string>
  body: string
}

export interface StationAnswers {
  /** GET /prelogin: Niagara's sign-in page. */
  prelogin: ProbeAnswer | null
  /** GET /stream/health: baskStream's health check (it asks for a sign-in first). */
  health: ProbeAnswer | null
}

export interface StationVerdict {
  confidence: "certain" | "likely"
  /** What gave it away, for people: "Niagara sign-in page". */
  signs: string[]
}

/** What the probe route sends back. */
export interface StationProbeResult {
  /** Nothing answered at all (a sentence for the person). */
  error?: string
  match: {
    title: string
    detail?: string
    address: string
    confidence: "certain" | "likely"
    data: { certificateProblem: string | null }
  } | null
}

const isRedirect = (status: number) => status >= 300 && status < 400

/** Where a redirect goes, as a path ("/prelogin"). */
function redirectPath(answer: ProbeAnswer) {
  const location = answer.headers.location ?? ""
  try {
    return new URL(location, "http://station").pathname.toLowerCase()
  } catch {
    return ""
  }
}

function healthVersion(answer: ProbeAnswer): string | null {
  if (answer.status !== 200) return null
  try {
    const json = JSON.parse(answer.body) as { apiVersion?: unknown }
    return typeof json.apiVersion === "string" ? json.apiVersion : null
  } catch {
    return null
  }
}

/**
 * Decides from the answers whether a Niagara station is there. The server header or
 * baskStream's own health answer make it certain; a Niagara sign-in page makes it
 * likely. A page that merely exists at /prelogin isn't enough (plenty of sites answer
 * every path), so it also needs Niagara's wording or a sign-in redirect at /stream.
 */
export function stationVerdict({
  prelogin,
  health,
}: StationAnswers): StationVerdict | null {
  const certain: string[] = []
  const likely: string[] = []
  const server = [prelogin, health]
    .map((answer) => answer?.headers.server ?? "")
    .find((value) => /niagara/i.test(value))
  if (server) certain.push(server)
  const version = health ? healthVersion(health) : null
  if (version) certain.push(`baskStream API ${version}`)

  const signInPage =
    prelogin?.status === 200 &&
    /j_username|j_security_check|niagara|tridium/i.test(prelogin.body)
  const signInRedirect =
    prelogin?.status === 200 &&
    health !== null &&
    isRedirect(health.status) &&
    /^\/(pre)?login\b/.test(redirectPath(health))
  if (signInPage) likely.push("Niagara sign-in page")
  else if (signInRedirect) likely.push("Signs in at /prelogin, like Niagara")

  if (certain.length)
    return { confidence: "certain", signs: [...certain, ...likely] }
  if (likely.length) return { confidence: "likely", signs: likely }
  return null
}

/**
 * Whether a pasted web address could be a station's, without asking it: a Niagara
 * path (/ord, /prelogin, …) or a host on a private network.
 */
export function looksLikeStationUrl(url: URL): boolean {
  if (
    /^\/(ord|prelogin|login|j_security_check|stream|hx|px|wb)\b/i.test(
      url.pathname
    )
  )
    return true
  return isPrivateHost(url.hostname)
}

/** Two station addresses are the same station when their origins match. */
export function sameStation(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}
