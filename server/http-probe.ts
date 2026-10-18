import "server-only"

import http from "node:http"
import https from "node:https"

import { parseAddress } from "../studio/lib/address"

// Recognizing what answers at an address someone typed, for Connect…: each connection
// plugin's probe route asks for a few paths (a Niagara sign-in page, a Haystack
// `about`) and decides from the answers. Nothing is sent but a plain GET.

const TIMEOUT_MS = 4000
const MAX_BODY = 64 * 1024

export interface HttpProbeAnswer {
  /** Where it answered, e.g. "https://10.0.0.20" (the scheme is worked out when none was typed). */
  origin: string
  status: number
  /** Response headers, names in lower case; repeated ones joined with ", ". */
  headers: Record<string, string>
  /** The start of the body as text (at most 64 KB). */
  body: string
  /**
   * Why this computer doesn't trust the https certificate ("it's self-signed",
   * "it has expired", …), or null. The answer is still read: stations often use
   * self-signed certificates, and only a GET was sent.
   */
  certificateProblem: string | null
}

/** What answered, or why nothing did (a sentence for the person). */
export type HttpProbe = HttpProbeAnswer | { error: string }

export interface HttpProbeOptions {
  /** Per attempt (default 4 s). */
  timeoutMs?: number
  headers?: Record<string, string>
  /** Stops the probe, e.g. `request.signal` so a closed dialog stops it too. */
  signal?: AbortSignal
}

const CERTIFICATE_PROBLEMS: Record<string, string> = {
  DEPTH_ZERO_SELF_SIGNED_CERT: "it's self-signed",
  SELF_SIGNED_CERT_IN_CHAIN:
    "it's signed by a certificate this computer doesn't trust",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "its issuer isn't trusted by this computer",
  UNABLE_TO_GET_ISSUER_CERT: "its issuer isn't trusted by this computer",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY:
    "its issuer isn't trusted by this computer",
  CERT_HAS_EXPIRED: "it has expired",
  CERT_NOT_YET_VALID: "it isn't valid yet",
  ERR_TLS_CERT_ALTNAME_INVALID: "it was issued for another name",
}

class ProbeFailure extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function get(
  url: URL,
  options: HttpProbeOptions,
  verify: boolean
): Promise<Omit<HttpProbeAnswer, "certificateProblem">> {
  const client = url.protocol === "https:" ? https : http
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted)
      return reject(new ProbeFailure("ABORTED", "Stopped."))
    const request = client.request(
      url,
      {
        method: "GET",
        timeout: options.timeoutMs ?? TIMEOUT_MS,
        rejectUnauthorized: verify,
        headers: {
          "user-agent": "Lemscape connect check",
          accept: "*/*",
          ...options.headers,
        },
      },
      (response) => {
        const headers: Record<string, string> = {}
        for (const [name, value] of Object.entries(response.headers))
          if (value !== undefined)
            headers[name] = Array.isArray(value) ? value.join(", ") : value
        const chunks: Buffer[] = []
        let size = 0
        const finish = () =>
          resolve({
            origin: url.origin,
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf8").slice(0, MAX_BODY),
          })
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk)
          size += chunk.length
          if (size >= MAX_BODY) {
            response.destroy()
            finish()
          }
        })
        response.on("end", finish)
        response.on("error", finish)
      }
    )
    const stop = () => request.destroy(new ProbeFailure("ABORTED", "Stopped."))
    options.signal?.addEventListener("abort", stop, { once: true })
    request.on("close", () =>
      options.signal?.removeEventListener("abort", stop)
    )
    request.on("timeout", () =>
      request.destroy(new ProbeFailure("TIMEOUT", "timeout"))
    )
    request.on("error", reject)
    request.end()
  })
}

const codeOf = (error: unknown) =>
  error instanceof ProbeFailure
    ? error.code
    : ((error as { code?: string })?.code ?? "")

/** A sentence for why nothing answered at `where`. */
function unreachable(code: string, where: string) {
  switch (code) {
    case "ECONNREFUSED":
      return `Nothing is listening at ${where}.`
    case "TIMEOUT":
    case "ETIMEDOUT":
      return `${where} didn't answer.`
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `Couldn't find ${where}; check the name.`
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return `${where} can't be reached from this computer.`
    case "ABORTED":
      return "Stopped."
    default:
      return `${where} couldn't be reached.`
  }
}

/**
 * GETs one path at an address someone typed ("10.0.0.20", "host:8443",
 * "https://host"), to recognize what answers there. Without a scheme it tries https,
 * then http. No credentials are sent, redirects aren't followed (a redirect is an
 * answer too: a sign-in page, say) and only the first 64 KB of the body is read.
 * `path` defaults to the address's own path.
 */
export async function probeHttp(
  address: string,
  path?: string,
  options: HttpProbeOptions = {}
): Promise<HttpProbe> {
  const parsed = parseAddress(address)
  if (!parsed.ok) return { error: parsed.error }
  const target = path ?? `${parsed.url.pathname}${parsed.url.search}`
  const schemes = parsed.scheme ? [parsed.scheme] : (["https", "http"] as const)
  let failure = ""
  for (const scheme of schemes) {
    const url = new URL(target || "/", `${scheme}://${parsed.hostPort}`)
    try {
      return { ...(await get(url, options, true)), certificateProblem: null }
    } catch (error) {
      const problem = CERTIFICATE_PROBLEMS[codeOf(error)]
      if (problem) {
        try {
          return {
            ...(await get(url, options, false)),
            certificateProblem: problem,
          }
        } catch (retry) {
          failure = codeOf(retry)
          continue
        }
      }
      failure = codeOf(error)
      if (failure === "ABORTED") break
    }
  }
  return { error: unreachable(failure, parsed.hostPort) }
}
