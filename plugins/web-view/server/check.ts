import "server-only"

import http from "node:http"
import https from "node:https"

import { framingVerdict, type FramingVerdict } from "../framing"
import { normalizeAddress } from "../model"

const TIMEOUT_MS = 5000
const MAX_REDIRECTS = 4

interface Headers {
  status: number
  location: string | null
  xFrameOptions: string | null
  csp: string | null
}

/**
 * Reads just the response headers. Certificates aren't checked: nothing is sent but
 * a plain GET, only two headers are read, and stations commonly use self-signed
 * certificates. The body is never read.
 */
function headersOf(url: URL): Promise<Headers> {
  const client = url.protocol === "https:" ? https : http
  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: "GET",
        timeout: TIMEOUT_MS,
        rejectUnauthorized: false,
        headers: { "user-agent": "Lemni web view check" },
      },
      (response) => {
        const one = (name: string) => {
          const value = response.headers[name]
          return Array.isArray(value) ? value.join(", ") : (value ?? null)
        }
        resolve({
          status: response.statusCode ?? 0,
          location: one("location"),
          xFrameOptions: one("x-frame-options"),
          csp: one("content-security-policy"),
        })
        response.destroy()
      }
    )
    request.on("timeout", () => request.destroy(new Error("timeout")))
    request.on("error", reject)
    request.end()
  })
}

export type FramingCheck =
  (FramingVerdict & { checked: true }) | { checked: false; error: string }

/** Whether `address` will show inside a page served from `embedderOrigin`. */
export async function checkFraming(
  address: string,
  embedderOrigin: string
): Promise<FramingCheck> {
  const normalized = normalizeAddress(address)
  if ("error" in normalized) return { checked: false, error: normalized.error }
  let url = new URL(normalized.url)
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const headers = await headersOf(url)
      if (headers.status >= 300 && headers.status < 400 && headers.location) {
        url = new URL(headers.location, url)
        if (url.protocol !== "http:" && url.protocol !== "https:") break
        continue
      }
      return {
        checked: true,
        ...framingVerdict(headers, embedderOrigin, url.href),
      }
    }
    return { checked: false, error: "Too many redirects." }
  } catch (error) {
    return {
      checked: false,
      error:
        error instanceof Error && error.message === "timeout"
          ? "The site didn't answer."
          : "The site couldn't be reached.",
    }
  }
}
