import "server-only"

import { probeHttp, type HttpProbe } from "@/sdk/server"

import { stationVerdict, type StationProbeResult } from "../probe-model"

const answered = (probe: HttpProbe) => ("error" in probe ? null : probe)

/**
 * Is there a Niagara station at this address? Asks for the sign-in page and
 * baskStream's health check, signed out: no login is sent.
 */
export async function probeStation(
  address: string,
  signal: AbortSignal
): Promise<StationProbeResult> {
  const prelogin = await probeHttp(address, "/prelogin", { signal })
  if ("error" in prelogin) return { error: prelogin.error, match: null }
  const health = await probeHttp(prelogin.origin, "/stream/health", { signal })
  const verdict = stationVerdict({ prelogin, health: answered(health) })
  if (!verdict) return { match: null }
  const { certificateProblem } = prelogin
  return {
    match: {
      title: "Niagara station",
      detail: [
        ...verdict.signs,
        certificateProblem
          ? `certificate not trusted: ${certificateProblem}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      address: prelogin.origin,
      confidence: verdict.confidence,
      data: { certificateProblem },
    },
  }
}
